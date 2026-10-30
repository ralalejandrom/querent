import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { blockedBetween } from "./safety";

/**
 * One-to-one direct messages. A message from someone the recipient doesn't follow arrives as a
 * request: it waits in Requests until they accept or reply, and the sender can send only a few
 * messages until then. Blocking hides the conversation both ways and stops new messages.
 */
const { conversations, conversationMembers: cm, messages, users, follows } = schema;

export type DmPolicy = "everyone" | "following" | "none";
export const DM_POLICIES: DmPolicy[] = ["everyone", "following", "none"];
/** Messages a sender can send before a request is accepted. */
export const REQUEST_MESSAGE_LIMIT = 3;
export const MESSAGE_MAX = 2000;

export const pairKey = (a: string, b: string) => [a, b].sort().join(":");

/** Does `who` follow `whom`? */
export async function followsUser(who: string, whom: string): Promise<boolean> {
  const [row] = await db.select({ x: follows.userId }).from(follows)
    .where(and(eq(follows.userId, who), eq(follows.targetType, "user"), eq(follows.targetId, whom))).limit(1);
  return !!row;
}

type Target = { id: string; displayName: string; dmPolicy: string; deletedAt: Date | null };

/** Whether `senderId` may start a new conversation with `target`. Returns null when allowed, or the reason. */
export async function cannotStart(senderId: string, target: Target): Promise<string | null> {
  if (target.id === senderId) return "You can't message yourself.";
  if (target.deletedAt) return "This account no longer exists.";
  if (await blockedBetween(senderId, target.id)) return "You can't message this person.";
  if (target.dmPolicy === "none") return `${target.displayName} isn't accepting messages.`;
  if (target.dmPolicy === "following" && !(await followsUser(target.id, senderId))) return `${target.displayName} only accepts messages from people they follow.`;
  return null;
}

export type ConversationRow = {
  id: string;
  lastMessageAt: Date;
  state: string;
  other: { id: string; handle: string; displayName: string; field: string };
  last: { body: string; mine: boolean; gone: boolean } | null;
  unread: number;
};

/** The person's conversations in one box: "inbox" (accepted) or "requests". Blocked people never appear. */
export async function listConversations(userId: string, box: "inbox" | "requests"): Promise<ConversationRow[]> {
  const state = box === "inbox" ? "active" : "request";
  const rows = await db.execute<{
    id: string; last_message_at: string; state: string; other_id: string; handle: string; display_name: string; field: string;
    last_body: string | null; last_sender: string | null; last_gone: boolean | null; unread: string;
  }>(sql`
    select c.id, c.last_message_at, me.state, ou.id as other_id, ou.handle, ou.display_name, ou.field,
      lm.body as last_body, lm.sender_id as last_sender, (lm.deleted_at is not null or lm.removed_at is not null) as last_gone,
      (select count(*) from ${messages} m where m.conversation_id = c.id and m.sender_id <> ${userId}
         and m.deleted_at is null and m.removed_at is null
         and m.created_at > coalesce(greatest(me.last_read_at, me.cleared_at), 'epoch'::timestamptz)) as unread
    from ${cm} me
    join ${conversations} c on c.id = me.conversation_id
    join ${cm} other on other.conversation_id = c.id and other.user_id <> me.user_id
    join ${users} ou on ou.id = other.user_id
    left join lateral (select body, sender_id, deleted_at, removed_at from ${messages} m
      where m.conversation_id = c.id and m.created_at > coalesce(me.cleared_at, 'epoch'::timestamptz)
      order by m.created_at desc limit 1) lm on true
    where me.user_id = ${userId} and me.state = ${state} and c.last_message_at is not null
      and c.last_message_at > coalesce(me.cleared_at, 'epoch'::timestamptz)
      and not exists (select 1 from ${schema.blocks} b where (b.blocker_id = ${userId} and b.blocked_id = ou.id) or (b.blocker_id = ou.id and b.blocked_id = ${userId}))
    order by c.last_message_at desc
    limit 100`);
  return rows.rows.map((r) => ({
    id: r.id, lastMessageAt: new Date(r.last_message_at), state: r.state,
    other: { id: r.other_id, handle: r.handle, displayName: r.display_name, field: r.field },
    last: r.last_sender ? { body: r.last_body ?? "", mine: r.last_sender === userId, gone: !!r.last_gone } : null,
    unread: Number(r.unread),
  }));
}

/** Badge counts: conversations with unread messages in the inbox, and pending requests. */
export async function dmCounts(userId: string): Promise<{ unread: number; requests: number }> {
  const res = await db.execute<{ state: string; n: string }>(sql`
    select me.state, count(distinct me.conversation_id) as n
    from ${cm} me join ${messages} m on m.conversation_id = me.conversation_id
    where me.user_id = ${userId} and me.state in ('active', 'request') and m.sender_id <> ${userId}
      and m.deleted_at is null and m.removed_at is null
      and m.created_at > coalesce(greatest(me.last_read_at, me.cleared_at), 'epoch'::timestamptz)
      and not exists (select 1 from ${schema.blocks} b where (b.blocker_id = ${userId} and b.blocked_id = m.sender_id) or (b.blocker_id = m.sender_id and b.blocked_id = ${userId}))
    group by me.state`);
  const get = (s: string) => Number(res.rows.find((r) => r.state === s)?.n ?? 0);
  return { unread: get("active"), requests: get("request") };
}

/** One conversation as `viewerId` sees it, or null when they aren't in it. */
export async function getConversation(id: string, viewerId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const members = await db.select({ m: cm, u: users }).from(cm).innerJoin(users, eq(users.id, cm.userId)).where(eq(cm.conversationId, id));
  const me = members.find((x) => x.m.userId === viewerId);
  const other = members.find((x) => x.m.userId !== viewerId);
  if (!me || !other) return null;
  const since = me.m.clearedAt ?? new Date(0);
  const list = (await db.select().from(messages)
    .where(and(eq(messages.conversationId, id), gt(messages.createdAt, since)))
    .orderBy(desc(messages.createdAt)).limit(300)).reverse();
  const [{ n: sentByMe }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(messages)
    .where(and(eq(messages.conversationId, id), eq(messages.senderId, viewerId)));
  return {
    id, me: me.m, other: other.m,
    otherUser: { id: other.u.id, handle: other.u.handle, displayName: other.u.displayName, field: other.u.field, deleted: !!other.u.deletedAt },
    messages: list, sentByMe, blocked: await blockedBetween(viewerId, other.u.id),
  };
}

export async function markRead(conversationId: string, userId: string) {
  await db.update(cm).set({ lastReadAt: new Date() }).where(and(eq(cm.conversationId, conversationId), eq(cm.userId, userId)));
}

/** The existing conversation between two people, if any. */
export async function findConversation(a: string, b: string) {
  const [c] = await db.select().from(conversations).where(eq(conversations.pairKey, pairKey(a, b))).limit(1);
  return c ?? null;
}

/** Recent messages before a reported one, for the moderator's context. */
export async function contextFor(messageId: string, take = 6) {
  const [m] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!m) return [];
  return db.select({ m: messages, sender: users.displayName }).from(messages).innerJoin(users, eq(users.id, messages.senderId))
    .where(and(eq(messages.conversationId, m.conversationId), sql`${messages.createdAt} <= ${m.createdAt}`))
    .orderBy(desc(messages.createdAt)).limit(take).then((r) => r.reverse());
}

