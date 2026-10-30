"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { isModerator, requireUser } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { notifyAdmins } from "@/lib/notify";
import { needsModeration, blockedBetween } from "@/lib/safety";
import { attemptsSince, recordAttempt } from "@/lib/ratelimit";
import { pushConfigured, sendPush } from "@/lib/push";
import { cannotStart, DM_POLICIES, findConversation, followsUser, MESSAGE_MAX, pairKey, REQUEST_MESSAGE_LIMIT } from "@/lib/dm";
import type { ActionState } from "./actions";

const { conversations, conversationMembers: cm, messages, users, messageReports } = schema;
const uuid = z.string().uuid();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** New conversations a person can start per day, and messages per minute. */
const NEW_PER_DAY = 20;
const MSG_PER_MINUTE = 20;

const push = (userId: string, body: string, url: string) => {
  if (!pushConfigured()) return;
  after(() => sendPush(userId, { body, url }).catch((err) => console.error("push failed", err)));
};

/** "Message" on a profile: opens the existing conversation, or creates one (empty until the first message). */
export async function startConversationAction(targetId: string) {
  const user = await requireUser();
  if (!uuid.safeParse(targetId).success) redirect("/messages");
  const existing = await findConversation(user.id, targetId);
  if (existing) redirect(`/messages/${existing.id}`);
  const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) redirect("/messages");
  const why = await cannotStart(user.id, target);
  if (why) redirect(`/u/${target.handle}?dm=${encodeURIComponent(why)}`);
  if ((await attemptsSince("dm_new", user.id, 24 * 60)) >= NEW_PER_DAY) redirect(`/u/${target.handle}?dm=${encodeURIComponent("You've started many new conversations today. Try again tomorrow.")}`);
  await recordAttempt("dm_new", user.id);
  // Someone the recipient follows lands in their inbox; anyone else arrives as a request.
  const theirState = (await followsUser(target.id, user.id)) ? "active" : "request";
  const id = await db.transaction(async (tx) => {
    const [c] = await tx.insert(conversations).values({ pairKey: pairKey(user.id, target.id), createdBy: user.id }).onConflictDoNothing().returning({ id: conversations.id });
    if (!c) return (await findConversation(user.id, target.id))!.id; // created at the same moment by the other person
    await tx.insert(cm).values([{ conversationId: c.id, userId: user.id, state: "active" }, { conversationId: c.id, userId: target.id, state: theirState }]);
    return c.id;
  });
  redirect(`/messages/${id}`);
}

export async function sendMessageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const conversationId = str(fd, "conversationId");
  const body = String(fd.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  if (!uuid.safeParse(conversationId).success) return { error: "This conversation doesn't exist." };
  if (!body) return { error: "Write a message first." };
  if (body.length > MESSAGE_MAX) return { error: `Messages can be up to ${MESSAGE_MAX.toLocaleString("en-US")} characters.` };
  const members = await db.select({ m: cm, u: users }).from(cm).innerJoin(users, eq(users.id, cm.userId)).where(eq(cm.conversationId, conversationId));
  const me = members.find((x) => x.m.userId === user.id);
  const other = members.find((x) => x.m.userId !== user.id);
  if (!me || !other) return { error: "This conversation doesn't exist." };
  const [self] = await db.select({ disabled: users.messagingDisabledAt }).from(users).where(eq(users.id, user.id));
  if (self?.disabled) return { error: "Messaging is turned off for your account after a moderation decision. Contact support if you think this is a mistake." };
  if (other.u.deletedAt) return { error: "This account no longer exists." };
  if (await blockedBetween(user.id, other.u.id)) return { error: "You can't message this person." };
  if (other.m.state === "declined") return { error: `${other.u.displayName} isn't accepting your messages.` };
  if (other.m.state === "request") {
    const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.senderId, user.id)));
    if (n >= REQUEST_MESSAGE_LIMIT) return { error: `Wait for ${other.u.displayName} to accept your request before sending more.` };
  }
  if (needsModeration(body)) return { error: "This message can't be sent because it matched our content filter (slurs, explicit content or spam)." };
  if ((await attemptsSince("dm_msg", user.id, 1)) >= MSG_PER_MINUTE) return { error: "You're sending messages very fast. Wait a minute and try again." };
  await recordAttempt("dm_msg", user.id);

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(messages).values({ conversationId, senderId: user.id, body, createdAt: now });
    await tx.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, conversationId));
    // Replying to a request accepts it.
    await tx.update(cm).set({ lastReadAt: now, ...(me.m.state !== "active" ? { state: "active" } : {}) }).where(and(eq(cm.conversationId, conversationId), eq(cm.userId, user.id)));
  });
  const preview = body.length > 120 ? body.slice(0, 117) + "…" : body;
  if (other.m.state === "active") push(other.u.id, `${user.displayName}: ${preview}`, `/messages/${conversationId}`);
  else push(other.u.id, `${user.displayName} sent you a message request.`, "/messages?box=requests");
  revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/messages");
  return { ok: "Sent." };
}

async function myMembership(conversationId: string, userId: string) {
  if (!uuid.safeParse(conversationId).success) return null;
  const [m] = await db.select().from(cm).where(and(eq(cm.conversationId, conversationId), eq(cm.userId, userId))).limit(1);
  return m ?? null;
}

export async function acceptRequestAction(conversationId: string) {
  const user = await requireUser();
  if (!(await myMembership(conversationId, user.id))) return;
  await db.update(cm).set({ state: "active", lastReadAt: new Date() }).where(and(eq(cm.conversationId, conversationId), eq(cm.userId, user.id)));
  revalidatePath("/", "layout");
}

/** Declining hides the request and stops further messages from that person in this conversation. They aren't told. */
export async function declineRequestAction(conversationId: string) {
  const user = await requireUser();
  if (!(await myMembership(conversationId, user.id))) return;
  await db.update(cm).set({ state: "declined", clearedAt: new Date() }).where(and(eq(cm.conversationId, conversationId), eq(cm.userId, user.id)));
  revalidatePath("/", "layout");
  redirect("/messages?box=requests");
}

/** "Delete chat": hides the conversation and its history for this person only. */
export async function clearConversationAction(conversationId: string) {
  const user = await requireUser();
  if (!(await myMembership(conversationId, user.id))) return;
  await db.update(cm).set({ clearedAt: new Date() }).where(and(eq(cm.conversationId, conversationId), eq(cm.userId, user.id)));
  revalidatePath("/", "layout");
  redirect("/messages");
}

/** The sender deletes their own message for everyone. The text is erased; a report keeps its own copy. */
export async function deleteMessageAction(messageId: string) {
  const user = await requireUser();
  if (!uuid.safeParse(messageId).success) return;
  const [m] = await db.update(messages).set({ deletedAt: new Date(), body: "" })
    .where(and(eq(messages.id, messageId), eq(messages.senderId, user.id))).returning({ c: messages.conversationId });
  if (m) revalidatePath(`/messages/${m.c}`);
}

const REASONS = ["harassment", "offensive", "spam", "scam", "unsafe_medical_advice", "other"] as const;

export async function reportMessageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const messageId = str(fd, "messageId");
  const reason = z.enum(REASONS).safeParse(str(fd, "reason"));
  if (!uuid.safeParse(messageId).success || !reason.success) return { error: "Choose a reason." };
  const [m] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!m || m.senderId === user.id) return { error: "You can only report messages other people sent you." };
  if (!(await myMembership(m.conversationId, user.id))) return { error: "You can only report messages in your own conversations." };
  const details = str(fd, "details").slice(0, 1000);
  await db.transaction(async (tx) => {
    await tx.insert(messageReports).values({ messageId, reporterId: user.id, reason: reason.data, details, snapshot: m.body || "(deleted by the sender before the report)" });
    await audit(tx, { actorId: user.id, entityType: "message", entityId: messageId, action: "message.reported", after: { reason: reason.data } });
  });
  if (fd.get("block") === "on") {
    await db.insert(schema.blocks).values({ blockerId: user.id, blockedId: m.senderId }).onConflictDoNothing();
    await db.delete(schema.follows).where(and(eq(schema.follows.targetType, "user"), sql`(${schema.follows.userId} = ${user.id} and ${schema.follows.targetId} = ${m.senderId}) or (${schema.follows.userId} = ${m.senderId} and ${schema.follows.targetId} = ${user.id})`));
  }
  notifyAdmins(`Lyncei: message reported (${reason.data.replace(/_/g, " ")})`, ["A direct message was reported.", `Reason: ${reason.data.replace(/_/g, " ")}`, "Open the moderation queue to review it within 24 hours."]);
  revalidatePath(`/messages/${m.conversationId}`);
  return { ok: fd.get("block") === "on" ? "Report sent, and this person is blocked." : "Report sent. A moderator will review it within 24 hours." };
}

const modSchema = z.object({ reportId: uuid, decision: z.enum(["remove", "remove_disable", "dismiss"]), rationale: z.string().min(5, "Write a short rationale.").max(1000) });

/** Moderators: remove a reported message (optionally turning off the sender's messaging) or dismiss the report. */
export async function moderateMessageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("/moderation");
  if (!isModerator(user)) return { error: "Moderators only." };
  const p = modSchema.safeParse({ reportId: str(fd, "reportId"), decision: str(fd, "decision"), rationale: str(fd, "rationale") });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  const [row] = await db.select({ r: messageReports, m: messages }).from(messageReports).innerJoin(messages, eq(messages.id, messageReports.messageId)).where(eq(messageReports.id, p.data.reportId)).limit(1);
  if (!row || row.r.status !== "open") return { error: "This report was already handled." };
  const now = new Date();
  await db.transaction(async (tx) => {
    if (p.data.decision !== "dismiss") {
      await tx.update(messages).set({ removedAt: now }).where(eq(messages.id, row.m.id));
      if (p.data.decision === "remove_disable") await tx.update(users).set({ messagingDisabledAt: now }).where(eq(users.id, row.m.senderId));
      await notify(tx, row.m.senderId, `A moderator removed a message you sent${p.data.decision === "remove_disable" ? " and turned off messaging for your account" : ""}: ${p.data.rationale}`, "/guidelines");
    }
    // Every open report on the same message is settled by one decision.
    await tx.update(messageReports).set({ status: p.data.decision === "dismiss" ? "dismissed" : "actioned" }).where(and(eq(messageReports.messageId, row.m.id), eq(messageReports.status, "open")));
    await audit(tx, { actorId: user.id, entityType: "message", entityId: row.m.id, action: `message.moderated.${p.data.decision}`, after: { rationale: p.data.rationale, reportId: row.r.id } });
  });
  revalidatePath("/moderation");
  return { ok: "Decision recorded." };
}

export async function updateDmPolicyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("/settings");
  const policy = str(fd, "dmPolicy");
  if (!DM_POLICIES.includes(policy as never)) return { error: "Choose who can message you." };
  await db.update(users).set({ dmPolicy: policy }).where(eq(users.id, user.id));
  revalidatePath("/settings");
  return { ok: "Saved." };
}
