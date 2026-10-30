"use server";

import { revalidatePath } from "next/cache";
import { isOurVideoUrl } from "@/lib/media";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { consumeLoginToken, endSession, findUserByEmail, isModerator, isReviewer, requireUser, sendLoginLink, startSession } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { fetchCrossref, normalizeDoi } from "@/lib/doi";
import { computeRigor, REVIEW_TYPE_LABELS, type ReviewType } from "@/lib/rigor";
import { slugify } from "@/lib/text";
import { notifyAdmins } from "@/lib/notify";
import { accessIsOpen, isInvited } from "@/lib/access";
import { isExampleEmail } from "@/lib/examples";
import { after } from "next/server";
import { ensureSourceSummary } from "@/lib/source-preview";
import { blockedBetween, needsModeration } from "@/lib/safety";
import { clientIp, attemptsSince, recordAttempt } from "@/lib/ratelimit";

export type ActionState = { error?: string; ok?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const uuid = z.string().uuid();

/* ------------------------------------------------------------- sign-in */
// Best-effort throttle per IP within one server instance; the per-email limit lives in sendLoginLink.
const loginHits = new Map<string, number[]>();
function loginThrottled(ip: string): boolean {
  const now = Date.now();
  const recent = (loginHits.get(ip) ?? []).filter((t) => now - t < 15 * 60_000);
  recent.push(now);
  loginHits.set(ip, recent);
  return recent.length > 10;
}

/** Second step of email sign-in: runs only when the person clicks "Sign in" on /auth/verify. */
export async function confirmLoginAction(fd: FormData) {
  const token = str(fd, "token");
  const next = str(fd, "next") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const user = token ? await consumeLoginToken(token) : null;
  if (!user) redirect("/login?error=invalid");
  await startSession(user.id);
  if (user.isNew) notifyAdmins(`Lyncei: new account (${user.email})`, [`Email: ${user.email}`, "Signed in for the first time."]);
  redirect(user.isNew ? "/settings?welcome=1" : safeNext);
}
export async function requestLoginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = z.string().email().max(254).safeParse(str(fd, "email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (loginThrottled(ip)) return { error: "Too many sign-in requests. Wait a few minutes and try again." };
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === "production") {
    return { error: "Email sign-in isn't set up on this server yet." };
  }
  // Links go to existing accounts and invited emails. New people create an account (and accept the Terms) on /signup.
  // The reply is the same either way, so the form can't be used to find out who has an account.
  const address = email.data.toLowerCase();
  if ((await findUserByEmail(address)) || (await isInvited(address))) {
    try {
      await sendLoginLink(address, str(fd, "next") || "/");
    } catch {
      return { error: "We couldn't send the email right now. Try again in a minute." };
    }
  } else if (!accessIsOpen() && !isExampleEmail(address)) {
    const added = await db.insert(schema.waitlist).values({ email: address, interest: "individual" }).onConflictDoNothing().returning({ id: schema.waitlist.id });
    if (added.length) notifyAdmins(`Lyncei: new waitlist sign-up (${address})`, [`Email: ${address}`, "Came from the sign-in page without access yet."]);
  }
  return { ok: "If this email has a Lyncei account, your sign-in link is on its way (it expires in 15 minutes). New here? Create an account instead." };
}

/** Separate demo deployments only (DEMO_LOGIN=1): one-click sign-in to the fictional example accounts (…@example.com). */
export async function demoLoginAction(handle: string) {
  if (process.env.DEMO_LOGIN !== "1") redirect("/login");
  const [u] = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(eq(schema.users.handle, handle)).limit(1);
  if (!u || !u.email.endsWith("@example.com")) redirect("/login");
  // Public demo sign-in never grants staff powers: accounts with moderation or admin roles are excluded.
  const staff = await db.select({ role: schema.userRoles.role }).from(schema.userRoles)
    .where(and(eq(schema.userRoles.userId, u.id), inArray(schema.userRoles.role, ["moderator", "integrity_admin", "platform_admin"]))).limit(1);
  if (staff.length) redirect("/login");
  await startSession(u.id);
  redirect("/");
}

export async function signOutAction() {
  await endSession();
  redirect("/");
}

/* --------------------------------------------------------------- sources */
async function resolveSource(rawDoi: string): Promise<{ id: string } | { error: string }> {
  const doi = normalizeDoi(rawDoi);
  if (!doi) return { error: "That doesn't look like a DOI. It should start with 10., like 10.1000/xyz123." };
  const [existing] = await db.select({ id: schema.sources.id }).from(schema.sources).where(sql`lower(${schema.sources.doi}) = ${doi}`).limit(1);
  if (existing) return existing;
  const meta = await fetchCrossref(doi);
  const [row] = await db
    .insert(schema.sources)
    .values(
      meta
        ? { doi, title: meta.title, authors: meta.authors, venue: meta.venue, publishedYear: meta.publishedYear, sourceType: meta.sourceType, correctionStatus: meta.correctionStatus, abstract: meta.abstract, provenance: { provider: "crossref", fetchedAt: new Date().toISOString() }, lastSyncedAt: new Date() }
        // Never invent metadata: keep the DOI, mark it unresolved, and retry later.
        : { doi, title: doi, correctionStatus: "unknown", provenance: { provider: "unresolved", fetchedAt: new Date().toISOString() } },
    )
    .returning({ id: schema.sources.id });
  if (meta?.abstract) after(() => ensureSourceSummary(row.id)); // AI preview, generated after the response
  return row;
}

/* ----------------------------------------------------------------- posts */
const postSchema = z.object({
  kind: z.enum(schema.postKindEnum.enumValues),
  title: z.string().min(8, "Add a title of at least 8 characters.").max(200),
  body: z.string().max(5000),
  doi: z.string().max(300),
  questionId: z.union([uuid, z.literal("")]),
  topicId: z.union([z.coerce.number().int().positive(), z.literal("")]),
  ai: z.boolean(),
  studyType: z.union([z.enum(schema.studyTypeEnum.enumValues), z.literal("")]),
  mediaUrl: z.union([z.string().max(500).refine(isOurVideoUrl, "That video link isn't valid. Upload the video again."), z.literal("")]),
  conflicts: z.string().min(1, "Declare your conflicts of interest, or write “None”.").max(500),
  limitations: z.string().max(1500),
  mediaCredit: z.string().max(300),
});
/** "None", "none.", "n/a" and similar all read as no conflict. */
const noConflict = (s: string) => /^(none|no|n\/?a|nothing)\.?$/i.test(s.trim());

export async function createPostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("/new");
  const parsed = postSchema.safeParse({
    kind: str(fd, "kind"), title: str(fd, "title"), body: str(fd, "body"), doi: str(fd, "doi"),
    questionId: str(fd, "questionId"), topicId: str(fd, "topicId"), ai: fd.get("ai") === "on", studyType: str(fd, "studyType"),
    mediaUrl: str(fd, "mediaUrl"), conflicts: str(fd, "conflicts"), limitations: str(fd, "limitations"), mediaCredit: str(fd, "mediaCredit"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const p = parsed.data;
  if (fd.get("noPatientData") !== "on") return { error: "Confirm that no patient or participant can be identified from this post." };
  if (p.kind === "video" && !p.mediaUrl) return { error: "Add your video, or pick another format." };
  if (p.doi && p.limitations.length < 15) return { error: "Say what the study can't show, in at least a sentence. Readers need the caveats as much as the finding." };
  const conflicts = noConflict(p.conflicts) ? "None declared" : p.conflicts;

  let sourceId: string | null = null;
  if (p.doi) {
    const s = await resolveSource(p.doi);
    if ("error" in s) return { error: s.error };
    sourceId = s.id;
  }
  const held = needsModeration(p.title, p.body, p.limitations, p.mediaCredit, conflicts);
  const [post] = await db.transaction(async (tx) => {
    const inserted = await tx.insert(schema.posts).values({
      authorId: user.id, kind: p.kind, title: p.title, body: p.body, sourceId, status: held ? "held" : "visible",
      questionId: p.questionId || null, topicId: p.topicId === "" ? null : p.topicId, aiAssisted: p.ai, studyType: p.studyType || null, mediaUrl: p.mediaUrl || null,
      conflicts, limitations: p.limitations || null, mediaCredit: p.mediaCredit || null,
    }).returning({ id: schema.posts.id });
    await audit(tx, { actorId: user.id, entityType: "post", entityId: inserted[0].id, action: "post.created", after: { title: p.title, sourceId, mediaUrl: p.mediaUrl || null, conflicts, held } });
    if (held) await tx.insert(schema.reports).values({ postId: inserted[0].id, reporterId: user.id, reason: "auto_filter", details: "Held automatically before publishing: the text matched the content filter." });
    return inserted;
  });
  if (held) return { error: "Your post is waiting for a moderator before it appears, because some words matched our content filter. You'll get a notification when it's reviewed." };
  revalidatePath("/");
  redirect(`/p/${post.id}`);
}

export async function toggleReactionAction(postId: string, kind: "like" | "insightful") {
  const user = await requireUser(`/p/${postId}`);
  if (!uuid.safeParse(postId).success) return;
  const where = and(eq(schema.reactions.userId, user.id), eq(schema.reactions.postId, postId), eq(schema.reactions.kind, kind));
  const deleted = await db.delete(schema.reactions).where(where).returning();
  if (!deleted.length) await db.insert(schema.reactions).values({ userId: user.id, postId, kind }).onConflictDoNothing();
  revalidatePath("/", "layout");
}

export async function toggleSaveAction(postId: string) {
  const user = await requireUser(`/p/${postId}`);
  if (!uuid.safeParse(postId).success) return;
  const deleted = await db.delete(schema.saves).where(and(eq(schema.saves.userId, user.id), eq(schema.saves.postId, postId))).returning();
  if (!deleted.length) await db.insert(schema.saves).values({ userId: user.id, postId }).onConflictDoNothing();
  revalidatePath("/", "layout");
}

export async function respondAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const postId = str(fd, "postId");
  const text = str(fd, "response");
  if (text.length < 10) return { error: "Write a response of at least 10 characters." };
  const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).limit(1);
  if (!post || post.authorId !== user.id) return { error: "Only the author can respond to reviewers." };
  const now = new Date();
  const published = await db.transaction(async (tx) => {
    await tx.update(schema.posts).set({ authorResponse: text, updatedAt: now }).where(eq(schema.posts.id, postId));
    await audit(tx, { actorId: user.id, entityType: "post", entityId: postId, action: "post.author_response", before: post.authorResponse, after: text });
    // The author has replied, so reviews still in their private window go public together with the response.
    const opened = await tx.update(schema.reviews).set({ publicAt: now })
      .where(and(eq(schema.reviews.postId, postId), eq(schema.reviews.status, "completed"), sql`${schema.reviews.publicAt} > ${now}`))
      .returning({ id: schema.reviews.id, reviewerId: schema.reviews.reviewerId });
    for (const r of opened) {
      await audit(tx, { actorId: user.id, entityType: "review", entityId: r.id, action: "review.published", after: { via: "author_response" } });
      await notify(tx, r.reviewerId, `Your review of “${post.title.slice(0, 60)}” is now public, with the author's response.`, `/p/${postId}#review-${r.id}`);
    }
    return opened.length;
  });
  revalidatePath(`/p/${postId}`);
  revalidatePath("/");
  return { ok: published ? "Response published. The reviews are now public together with your response." : "Response published." };
}

/* ---------------------------------------------------------- discussion */
const contributionSchema = z.object({
  postId: uuid,
  parentId: z.union([uuid, z.literal("")]),
  type: z.enum(schema.contributionTypeEnum.enumValues),
  body: z.string().min(3, "Write something first.").max(4000),
  doi: z.string().max(300),
});

export async function addContributionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = contributionSchema.safeParse({ postId: str(fd, "postId"), parentId: str(fd, "parentId"), type: str(fd, "type"), body: str(fd, "body"), doi: str(fd, "doi") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your contribution." };
  const c = parsed.data;
  const doi = c.doi ? normalizeDoi(c.doi) : null;
  if (c.doi && !doi) return { error: "That DOI doesn't look right. It should start with 10." };
  if (c.type === "evidence" && !doi) return { error: "Evidence needs a source. Add a DOI, or choose another type." };
  if ((c.type === "objection" || c.type === "correction") && !doi && !/https?:\/\/\S+/.test(c.body)) {
    return { error: "Objections and corrections need evidence: add a DOI or a link. To ask without evidence, choose “question”." };
  }
  const [post] = await db.select({ id: schema.posts.id, authorId: schema.posts.authorId, title: schema.posts.title }).from(schema.posts).where(eq(schema.posts.id, c.postId)).limit(1);
  if (!post) return { error: "This post no longer exists." };
  if (await blockedBetween(user.id, post.authorId)) return { error: "You can't reply to this post." };
  if (doi) await resolveSource(doi); // store the cited paper's metadata so the thread can show a preview

  const held = needsModeration(c.body);
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.contributions).values({ postId: c.postId, parentId: c.parentId || null, authorId: user.id, type: c.type, body: c.body, sourceDoi: doi, status: held ? "held" : "visible" }).returning({ id: schema.contributions.id });
    await audit(tx, { actorId: user.id, entityType: "contribution", entityId: row.id, action: "contribution.created", after: { type: c.type, held } });
    if (held) await tx.insert(schema.reports).values({ postId: c.postId, contributionId: row.id, reporterId: user.id, reason: "auto_filter", details: "Held automatically before publishing: the text matched the content filter." });
    else if (post.authorId !== user.id) await notify(tx, post.authorId, `${user.displayName} added ${c.type === "evidence" ? "evidence" : `a ${c.type}`} to “${post.title.slice(0, 60)}”.`, `/p/${post.id}`);
  });
  revalidatePath(`/p/${c.postId}`);
  return held ? { ok: "Sent. A moderator will check it before others see it, because some words matched our content filter." } : { ok: "Posted." };
}

/* ---------------------------------------------------------------- review */
const REPLY_HOURS = Math.max(0, Number(process.env.REVIEW_REPLY_HOURS ?? 48)) || 48;
const RECS = ["Sound", "Sound with caveats", "Faithful to source", "Major concerns", "Not faithful to source"] as const;
const LEVELS = ["High", "Moderate", "Low"] as const;
const AI_USES = ["none", "language", "assist"] as const;
const reviewSchema = z.object({
  postId: uuid,
  type: z.enum(schema.reviewTypeEnum.enumValues),
  checklist: z.array(z.string()).min(2, "Complete at least two checklist items so readers know what you checked."),
  summary: z.string().min(30, "Write a summary of at least 30 characters.").max(6000),
  recommendation: z.enum(RECS),
  conflicts: z.string().min(1, "Declare your conflicts of interest, or write “None”.").max(500),
  signed: z.boolean(),
  aiUse: z.enum(AI_USES, { message: "Say whether you used AI tools for this review." }),
  coReviewer: z.string().max(60),
});
const ratingsSchema = z.object({
  rigor: z.enum(LEVELS), bias: z.enum(["Low", "Moderate", "High"]), relevance: z.enum(LEVELS),
  reproducibility: z.enum(["Data available", "Pending further evidence", "Not reproducible"]),
});

export async function submitReviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!isReviewer(user)) return { error: "Only verified reviewers can publish reviews." };
  const parsed = reviewSchema.safeParse({
    postId: str(fd, "postId"), type: str(fd, "type"), checklist: fd.getAll("checklist").map(String),
    summary: str(fd, "summary"), recommendation: str(fd, "recommendation"), conflicts: str(fd, "conflicts"), signed: fd.get("signed") === "on",
    aiUse: str(fd, "aiUse"), coReviewer: str(fd, "coReviewer"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the review form." };
  const r = parsed.data;
  let ratings: z.infer<typeof ratingsSchema> | null = null;
  if (r.type === "methodological") {
    const rp = ratingsSchema.safeParse({ rigor: str(fd, "rigor"), bias: str(fd, "bias"), relevance: str(fd, "relevance"), reproducibility: str(fd, "reproducibility") });
    if (!rp.success) return { error: "Rate all four study-quality dimensions." };
    ratings = rp.data;
  }

  const [post] = await db.select({ post: schema.posts, source: schema.sources }).from(schema.posts)
    .leftJoin(schema.sources, eq(schema.sources.id, schema.posts.sourceId)).where(eq(schema.posts.id, r.postId)).limit(1);
  if (!post) return { error: "This post no longer exists." };
  if (post.post.authorId === user.id) return { error: "You can't review your own post." };
  if (!post.source) return { error: "Posts without a source can't be reviewed." };
  if (post.source.provenance.provider === "unresolved") return { error: "This post's DOI hasn't been verified yet, so it can't be reviewed." };

  // Mentored review: the co-reviewer is named by handle and credited only after they confirm.
  let coReviewer: { id: string; displayName: string } | null = null;
  const coHandle = r.coReviewer.trim().replace(/^@/, "").toLowerCase();
  if (coHandle) {
    const [u] = await db.select({ id: schema.users.id, displayName: schema.users.displayName, deletedAt: schema.users.deletedAt }).from(schema.users).where(sql`lower(${schema.users.handle}) = ${coHandle}`).limit(1);
    if (!u || u.deletedAt) return { error: `There's no Lyncei member with the handle @${coHandle}.` };
    if (u.id === user.id) return { error: "Name someone else as co-reviewer, or leave it empty." };
    if (u.id === post.post.authorId) return { error: "The post's author can't co-review their own post." };
    if (await blockedBetween(user.id, u.id)) return { error: `You can't name @${coHandle} as co-reviewer.` };
    coReviewer = u;
  }

  try {
    // Right of reply: the author reads the review first. It goes public after REVIEW_REPLY_HOURS, or as soon as the author responds.
    const now = new Date();
    const publicAt = new Date(now.getTime() + REPLY_HOURS * 3_600_000);
    await db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.reviews).values({
        postId: r.postId, reviewerId: user.id, type: r.type, status: "completed", recommendation: r.recommendation, summary: r.summary,
        checklist: Object.fromEntries(r.checklist.map((k) => [k, true])), ratings, conflicts: noConflict(r.conflicts) ? "None declared" : r.conflicts,
        isSigned: r.signed, postVersion: post.post.version, completedAt: now, publicAt, aiUse: r.aiUse, coReviewerId: coReviewer?.id ?? null,
      }).returning({ id: schema.reviews.id });
      await audit(tx, { actorId: user.id, entityType: "review", entityId: row.id, action: "review.completed", after: { postId: r.postId, type: r.type, recommendation: r.recommendation, publicAt, aiUse: r.aiUse, coReviewerId: coReviewer?.id ?? null } });
      if (coReviewer) await notify(tx, coReviewer.id, `${user.displayName} named you as co-reviewer of “${post.post.title.slice(0, 60)}”. Confirm to have it credited on your profile.`, `/p/${r.postId}#review-${row.id}`);
      await notify(tx, post.post.authorId, `${r.signed ? user.displayName : "A reviewer"} completed a ${REVIEW_TYPE_LABELS[r.type].toLowerCase()} on “${post.post.title.slice(0, 60)}”. You see it first: it goes public in ${REPLY_HOURS} hours, or as soon as you reply.`, `/p/${r.postId}#review-${row.id}`);
    });
    revalidatePath(`/p/${r.postId}`);
    revalidatePath("/");
    return { ok: `Review saved and credited on your profile. The author reads it first; it becomes public in ${REPLY_HOURS} hours or when they reply.` };
  } catch (e) {
    if (String(e).includes("reviews_one_per_type_uq")) return { error: "You've already published this type of review on this post." };
    throw e;
  }
}

/**
 * The post's author says how useful a review was (1–5) and whether it led them to change the post.
 * This, not the number of reviews, is what builds a reviewer's reputation.
 */
export async function rateReviewAction(fd: FormData) {
  const user = await requireUser();
  const reviewId = str(fd, "reviewId");
  const helpfulness = Number(str(fd, "helpfulness"));
  if (!uuid.safeParse(reviewId).success || !Number.isInteger(helpfulness) || helpfulness < 1 || helpfulness > 5) return;
  const ledToRevision = fd.get("ledToRevision") === "on";
  const [row] = await db.select({ review: schema.reviews, post: schema.posts }).from(schema.reviews)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.reviews.postId)).where(eq(schema.reviews.id, reviewId)).limit(1);
  if (!row || row.post.authorId !== user.id || row.review.status !== "completed") return;
  const firstRevision = ledToRevision && !row.review.ledToRevision;
  await db.transaction(async (tx) => {
    await tx.update(schema.reviews).set({ helpfulness, ledToRevision, authorRatedAt: new Date() }).where(eq(schema.reviews.id, reviewId));
    await audit(tx, { actorId: user.id, entityType: "review", entityId: reviewId, action: "review.rated", before: { helpfulness: row.review.helpfulness, ledToRevision: row.review.ledToRevision }, after: { helpfulness, ledToRevision } });
    const title = row.post.title.slice(0, 60);
    if (firstRevision) await notify(tx, row.review.reviewerId, `Your review changed a post: the author revised “${title}” because of it.`, `/p/${row.post.id}#review-${reviewId}`);
    else if (helpfulness >= 4 && !row.review.helpfulness) await notify(tx, row.review.reviewerId, `The author found your review of “${title}” ${helpfulness === 5 ? "very useful" : "useful"}.`, `/p/${row.post.id}#review-${reviewId}`);
  });
  revalidatePath(`/p/${row.post.id}`);
  revalidatePath("/");
}

/**
 * The person named as co-reviewer confirms (credit on their profile and in the review's citation) or declines (their name is removed).
 * Nobody is credited, or named, on a review they didn't agree to.
 */
export async function coReviewAction(fd: FormData) {
  const user = await requireUser();
  const reviewId = str(fd, "reviewId");
  const decision = str(fd, "decision");
  if (!uuid.safeParse(reviewId).success || (decision !== "confirm" && decision !== "decline")) return;
  const [row] = await db.select({ review: schema.reviews, post: schema.posts }).from(schema.reviews)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.reviews.postId)).where(eq(schema.reviews.id, reviewId)).limit(1);
  if (!row || row.review.coReviewerId !== user.id) return;
  if (decision === "confirm" && row.review.coReviewerConfirmedAt) return;
  const title = row.post.title.slice(0, 60);
  await db.transaction(async (tx) => {
    if (decision === "confirm") {
      await tx.update(schema.reviews).set({ coReviewerConfirmedAt: new Date() }).where(eq(schema.reviews.id, reviewId));
      await notify(tx, row.review.reviewerId, `${user.displayName} confirmed co-reviewing “${title}” with you.`, `/p/${row.post.id}#review-${reviewId}`);
    } else {
      await tx.update(schema.reviews).set({ coReviewerId: null, coReviewerConfirmedAt: null }).where(eq(schema.reviews.id, reviewId));
      await notify(tx, row.review.reviewerId, `${user.displayName} declined to be named as co-reviewer of “${title}”. Their name was removed from the review.`, `/p/${row.post.id}#review-${reviewId}`);
    }
    await audit(tx, { actorId: user.id, entityType: "review", entityId: reviewId, action: decision === "confirm" ? "review.coreviewer_confirmed" : "review.coreviewer_declined", after: { coReviewerId: user.id } });
  });
  revalidatePath(`/p/${row.post.id}`);
  revalidatePath(`/u/${user.handle}`);
}

/* ------------------------------------------------------------ moderation */
const REPORT_REASONS = ["misrepresents_source", "source_corrected_or_retracted", "unsafe_medical_advice", "harassment", "offensive", "spam", "undisclosed_ai", "other"] as const;

/** Reports a post, or one comment on it when contributionId is given. Moderators are emailed. */
export async function reportPostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const postId = str(fd, "postId");
  const contributionId = str(fd, "contributionId") || null;
  const reason = z.enum(REPORT_REASONS).safeParse(str(fd, "reason"));
  if (!uuid.safeParse(postId).success || !reason.success || (contributionId && !uuid.safeParse(contributionId).success)) return { error: "Choose a reason for the report." };
  if (contributionId) {
    const [c] = await db.select({ id: schema.contributions.id }).from(schema.contributions).where(and(eq(schema.contributions.id, contributionId), eq(schema.contributions.postId, postId))).limit(1);
    if (!c) return { error: "That comment no longer exists." };
  }
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.reports).values({ postId, contributionId, reporterId: user.id, reason: reason.data, details: str(fd, "details").slice(0, 2000) }).returning({ id: schema.reports.id });
    await audit(tx, { actorId: user.id, entityType: "report", entityId: row.id, action: "report.created", after: { postId, contributionId, reason: reason.data } });
  });
  notifyAdmins(`Lyncei: new report (${reason.data.replace(/_/g, " ")})`, [`A ${contributionId ? "comment" : "post"} was reported.`, `Reason: ${reason.data.replace(/_/g, " ")}`, "Open the moderation queue to review it within 24 hours."]);
  return { ok: "Report sent. A moderator will review it within 24 hours." };
}

export async function moderateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("/moderation");
  if (!isModerator(user)) return { error: "Only moderators can act on reports." };
  const reportId = str(fd, "reportId");
  const decision = z.enum(["dispute", "dismiss", "clear", "remove", "approve"]).safeParse(str(fd, "decision"));
  const rationale = str(fd, "rationale");
  if (!decision.success) return { error: "Choose a decision." };
  if (rationale.length < 10) return { error: "Explain the decision in at least 10 characters. Authors and readers can see it." };
  const [report] = await db.select().from(schema.reports).where(eq(schema.reports.id, reportId)).limit(1);
  if (!report) return { error: "Report not found." };
  const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, report.postId)).limit(1);

  // Removing or approving content (a post, or one comment), including items the filter held back.
  if (decision.data === "remove" || decision.data === "approve") {
    const status = decision.data === "remove" ? "removed" : "visible";
    await db.transaction(async (tx) => {
      if (report.contributionId) {
        const [c] = await tx.update(schema.contributions).set({ status }).where(eq(schema.contributions.id, report.contributionId)).returning({ authorId: schema.contributions.authorId });
        if (c) await notify(tx, c.authorId, decision.data === "remove" ? `A moderator removed your comment on “${post.title.slice(0, 60)}”: ${rationale}` : `Your comment on “${post.title.slice(0, 60)}” was approved and is now visible.`, `/p/${post.id}`);
      } else {
        await tx.update(schema.posts).set({ status, updatedAt: new Date() }).where(eq(schema.posts.id, post.id));
        await notify(tx, post.authorId, decision.data === "remove" ? `A moderator removed your post “${post.title.slice(0, 60)}”: ${rationale}` : `Your post “${post.title.slice(0, 60)}” was approved and is now visible.`, `/p/${post.id}`);
      }
      await tx.update(schema.reports).set({ status: "actioned" }).where(eq(schema.reports.id, reportId));
      await tx.insert(schema.moderationActions).values({ reportId, postId: post.id, moderatorId: user.id, action: report.contributionId ? `comment.${decision.data}` : decision.data, rationale });
      await audit(tx, { actorId: user.id, entityType: report.contributionId ? "contribution" : "post", entityId: report.contributionId ?? post.id, action: `moderation.${decision.data}`, after: { rationale } });
    });
    revalidatePath("/moderation");
    revalidatePath(`/p/${post.id}`);
    revalidatePath("/");
    return { ok: "Decision recorded." };
  }
  if (report.contributionId && decision.data !== "dismiss") return { error: "For a comment, choose Remove or Dismiss." };

  await db.transaction(async (tx) => {
    const disputedReason = decision.data === "dispute" ? rationale : decision.data === "clear" ? null : post.disputedReason;
    if (disputedReason !== post.disputedReason) {
      await tx.update(schema.posts).set({ disputedReason, updatedAt: new Date() }).where(eq(schema.posts.id, post.id));
      await audit(tx, { actorId: user.id, entityType: "post", entityId: post.id, action: "label.changed", before: post.disputedReason ? "disputed" : "not_disputed", after: disputedReason ? "disputed" : "not_disputed" });
      await notify(tx, post.authorId, disputedReason ? `Your post “${post.title.slice(0, 60)}” was marked Disputed: ${rationale}` : `The dispute on “${post.title.slice(0, 60)}” was cleared.`, `/p/${post.id}`);
    }
    await tx.update(schema.reports).set({ status: decision.data === "dismiss" ? "dismissed" : "actioned" }).where(eq(schema.reports.id, reportId));
    await tx.insert(schema.moderationActions).values({ reportId, postId: post.id, moderatorId: user.id, action: decision.data, rationale });
    await audit(tx, { actorId: user.id, entityType: "report", entityId: reportId, action: `report.${decision.data}`, after: { rationale } });
  });
  revalidatePath("/moderation");
  revalidatePath(`/p/${post.id}`);
  return { ok: "Decision recorded." };
}

/* ------------------------------------------------------ follows, questions */
export async function toggleFollowAction(targetType: "user" | "question" | "topic", targetId: string) {
  const user = await requireUser();
  if (targetType === "user" && targetId === user.id) return;
  if (targetType === "user" && (await blockedBetween(user.id, targetId))) return;
  const where = and(eq(schema.follows.userId, user.id), eq(schema.follows.targetType, targetType), eq(schema.follows.targetId, targetId));
  const deleted = await db.delete(schema.follows).where(where).returning();
  if (!deleted.length) await db.insert(schema.follows).values({ userId: user.id, targetType, targetId }).onConflictDoNothing();
  revalidatePath("/", "layout");
}

export async function createQuestionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("/questions");
  const text = str(fd, "text");
  if (text.length < 15 || !text.endsWith("?")) return { error: "Write a full question of at least 15 characters, ending with a question mark." };
  if (text.length > 300) return { error: "Keep the question under 300 characters." };
  const topicId = Number(str(fd, "topicId")) || null;
  const base = slugify(text) || "question";
  let slug = base;
  for (let i = 2; (await db.select({ id: schema.questions.id }).from(schema.questions).where(eq(schema.questions.slug, slug)).limit(1)).length; i++) slug = `${base}-${i}`;
  await db.transaction(async (tx) => {
    const [q] = await tx.insert(schema.questions).values({ slug, text, topicId, createdBy: user.id }).returning({ id: schema.questions.id });
    await tx.insert(schema.follows).values({ userId: user.id, targetType: "question", targetId: q.id });
    await audit(tx, { actorId: user.id, entityType: "question", entityId: q.id, action: "question.created", after: { text } });
  });
  redirect(`/q/${slug}`);
}

/* ---------------------------------------------------------------- profile */
export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("/settings");
  const parsed = z.object({
    displayName: z.string().min(2, "Your name needs at least 2 characters.").max(80),
    field: z.string().max(120), bio: z.string().max(600), currentWork: z.string().max(200),
  }).safeParse({ displayName: str(fd, "displayName"), field: str(fd, "field"), bio: str(fd, "bio"), currentWork: str(fd, "currentWork") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your profile." };
  await db.update(schema.users).set(parsed.data).where(eq(schema.users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: "Profile saved." };
}

export async function markNotificationsReadAction() {
  const user = await requireUser("/notifications");
  await db.update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.recipientId, user.id), sql`${schema.notifications.readAt} is null`));
  revalidatePath("/", "layout");
}

/* ---------------------------------------------------------------- account */
/**
 * Deletes the signed-in account. The profile and posts disappear; reviews and comments stay
 * (the review record matters to other people) but now show "Deleted account". Email, bio and
 * ORCID iD are erased, so the address can't sign in or be contacted again.
 */
export async function deleteAccountAction(fd: FormData) {
  const user = await requireUser("/settings");
  if (str(fd, "confirm").trim().toUpperCase() !== "DELETE") redirect("/settings?delete=confirm");
  await db.transaction(async (tx) => {
    await tx.update(schema.posts).set({ status: "removed" }).where(eq(schema.posts.authorId, user.id));
    await tx.update(schema.users).set({
      deletedAt: new Date(), email: `deleted+${user.id}@invalid`, displayName: "Deleted account", handle: `deleted-${user.id.slice(0, 8)}`,
      bio: "", currentWork: "", field: "", orcidId: null, passwordHash: null,
    }).where(eq(schema.users.id, user.id));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
    await tx.delete(schema.deviceTokens).where(eq(schema.deviceTokens.userId, user.id));
    await tx.delete(schema.blocks).where(sql`${schema.blocks.blockerId} = ${user.id} or ${schema.blocks.blockedId} = ${user.id}`);
    // Direct messages: the text they sent is erased. The other person keeps the conversation, shown as "Deleted account".
    await tx.update(schema.messages).set({ body: "", deletedAt: new Date() }).where(eq(schema.messages.senderId, user.id));
    await tx.update(schema.conversationMembers).set({ state: "declined", clearedAt: new Date() }).where(eq(schema.conversationMembers.userId, user.id));
    await audit(tx, { actorId: user.id, entityType: "user", entityId: user.id, action: "account.deleted" });
  });
  await endSession();
  redirect("/welcome");
}

/* ---------------------------------------------------------------- safety */
/** Blocks or unblocks someone. Blocking also ends follows in both directions. */
export async function toggleBlockAction(targetId: string) {
  const user = await requireUser();
  if (!uuid.safeParse(targetId).success || targetId === user.id) return;
  const removed = await db.delete(schema.blocks).where(and(eq(schema.blocks.blockerId, user.id), eq(schema.blocks.blockedId, targetId))).returning();
  if (!removed.length) {
    await db.transaction(async (tx) => {
      await tx.insert(schema.blocks).values({ blockerId: user.id, blockedId: targetId }).onConflictDoNothing();
      await tx.delete(schema.follows).where(and(eq(schema.follows.targetType, "user"), sql`(${schema.follows.userId} = ${user.id} and ${schema.follows.targetId} = ${targetId}) or (${schema.follows.userId} = ${targetId} and ${schema.follows.targetId} = ${user.id})`));
      await audit(tx, { actorId: user.id, entityType: "user", entityId: targetId, action: "user.blocked" });
    });
  }
  revalidatePath("/", "layout");
}

/** Contact form on /support. Emails the team; the person's address goes in the message so the team can reply. */
export async function supportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({
    email: z.string().email("Enter a valid email so we can reply.").max(254),
    topic: z.enum(["account", "report", "privacy", "bug", "other"]),
    message: z.string().min(10, "Tell us a bit more (at least 10 characters).").max(4000),
  }).safeParse({ email: str(fd, "email"), topic: str(fd, "topic") || "other", message: str(fd, "message") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (str(fd, "website")) return { ok: "Thanks. We'll reply by email." }; // honeypot
  const ip = await clientIp();
  if ((await attemptsSince("support_ip", ip, 60)) >= 5) return { error: "Too many messages from this network. Try again in an hour." };
  await recordAttempt("support_ip", ip);
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === "production") return { error: "The contact form isn't available right now." };
  notifyAdmins(`Lyncei: support request (${parsed.data.topic})`, [`From: ${parsed.data.email}`, `Topic: ${parsed.data.topic}`, `Message: ${parsed.data.message.replace(/\s+/g, " ")}`]);
  return { ok: "Thanks. We read every message and reply by email, usually within 2 business days." };
}
