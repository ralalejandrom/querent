"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { endSession, isModerator, isReviewer, requireUser, sendLoginLink } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { fetchCrossref, normalizeDoi } from "@/lib/doi";
import { computeRigor, REVIEW_TYPE_LABELS, type ReviewType } from "@/lib/rigor";
import { slugify } from "@/lib/text";

export type ActionState = { error?: string; ok?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const uuid = z.string().uuid();

/* ------------------------------------------------------------- sign-in */
export async function requestLoginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = z.string().email().max(254).safeParse(str(fd, "email"));
  if (!email.success) return { error: "Enter a valid email address." };
  try {
    await sendLoginLink(email.data, str(fd, "next") || "/");
  } catch {
    return { error: "We couldn't send the email right now. Try again in a minute." };
  }
  return { ok: "Check your inbox for a sign-in link. It expires in 15 minutes." };
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
        ? { doi, title: meta.title, authors: meta.authors, venue: meta.venue, publishedYear: meta.publishedYear, sourceType: meta.sourceType, correctionStatus: meta.correctionStatus, provenance: { provider: "crossref", fetchedAt: new Date().toISOString() }, lastSyncedAt: new Date() }
        // Never invent metadata: keep the DOI, mark it unresolved, and retry later.
        : { doi, title: doi, correctionStatus: "unknown", provenance: { provider: "unresolved", fetchedAt: new Date().toISOString() } },
    )
    .returning({ id: schema.sources.id });
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
});

export async function createPostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("/new");
  const parsed = postSchema.safeParse({
    kind: str(fd, "kind"), title: str(fd, "title"), body: str(fd, "body"), doi: str(fd, "doi"),
    questionId: str(fd, "questionId"), topicId: str(fd, "topicId"), ai: fd.get("ai") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const p = parsed.data;

  let sourceId: string | null = null;
  if (p.doi) {
    const s = await resolveSource(p.doi);
    if ("error" in s) return { error: s.error };
    sourceId = s.id;
  }
  const [post] = await db.transaction(async (tx) => {
    const inserted = await tx.insert(schema.posts).values({
      authorId: user.id, kind: p.kind, title: p.title, body: p.body, sourceId,
      questionId: p.questionId || null, topicId: p.topicId === "" ? null : p.topicId, aiAssisted: p.ai,
    }).returning({ id: schema.posts.id });
    await audit(tx, { actorId: user.id, entityType: "post", entityId: inserted[0].id, action: "post.created", after: { title: p.title, sourceId } });
    return inserted;
  });
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
  await db.transaction(async (tx) => {
    await tx.update(schema.posts).set({ authorResponse: text, updatedAt: new Date() }).where(eq(schema.posts.id, postId));
    await audit(tx, { actorId: user.id, entityType: "post", entityId: postId, action: "post.author_response", before: post.authorResponse, after: text });
  });
  revalidatePath(`/p/${postId}`);
  return { ok: "Response published." };
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
  const [post] = await db.select({ id: schema.posts.id, authorId: schema.posts.authorId, title: schema.posts.title }).from(schema.posts).where(eq(schema.posts.id, c.postId)).limit(1);
  if (!post) return { error: "This post no longer exists." };

  await db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.contributions).values({ postId: c.postId, parentId: c.parentId || null, authorId: user.id, type: c.type, body: c.body, sourceDoi: doi }).returning({ id: schema.contributions.id });
    await audit(tx, { actorId: user.id, entityType: "contribution", entityId: row.id, action: "contribution.created", after: { type: c.type } });
    if (post.authorId !== user.id) await notify(tx, post.authorId, `${user.displayName} added ${c.type === "evidence" ? "evidence" : `a ${c.type}`} to “${post.title.slice(0, 60)}”.`, `/p/${post.id}`);
  });
  revalidatePath(`/p/${c.postId}`);
  return { ok: "Posted." };
}

/* ---------------------------------------------------------------- review */
const RECS = ["Sound", "Sound with caveats", "Faithful to source", "Major concerns", "Not faithful to source"] as const;
const LEVELS = ["High", "Moderate", "Low"] as const;
const reviewSchema = z.object({
  postId: uuid,
  type: z.enum(schema.reviewTypeEnum.enumValues),
  checklist: z.array(z.string()).min(2, "Complete at least two checklist items so readers know what you checked."),
  summary: z.string().min(30, "Write a summary of at least 30 characters.").max(6000),
  recommendation: z.enum(RECS),
  conflicts: z.string().min(1, "Declare your conflicts of interest, or write “None”.").max(500),
  signed: z.boolean(),
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

  const rigorOf = async (tx: typeof db) => {
    const done = await tx.select({ type: schema.reviews.type }).from(schema.reviews).where(and(eq(schema.reviews.postId, r.postId), eq(schema.reviews.status, "completed")));
    return computeRigor({ hasSource: post.source!.provenance.provider !== "unresolved", disputedReason: post.post.disputedReason, correctionStatus: post.source!.correctionStatus, completedReviewTypes: done.map((d) => d.type as ReviewType) });
  };

  try {
    const changed = await db.transaction(async (tx) => {
      const before = await rigorOf(tx as unknown as typeof db);
      const [row] = await tx.insert(schema.reviews).values({
        postId: r.postId, reviewerId: user.id, type: r.type, status: "completed", recommendation: r.recommendation, summary: r.summary,
        checklist: Object.fromEntries(r.checklist.map((k) => [k, true])), ratings, conflicts: /^none\.?$/i.test(r.conflicts) ? "None declared" : r.conflicts,
        isSigned: r.signed, postVersion: post.post.version, completedAt: new Date(),
      }).returning({ id: schema.reviews.id });
      await audit(tx, { actorId: user.id, entityType: "review", entityId: row.id, action: "review.completed", after: { postId: r.postId, type: r.type, recommendation: r.recommendation } });
      const after = await rigorOf(tx as unknown as typeof db);
      if (before.key !== after.key) await audit(tx, { actorId: user.id, entityType: "post", entityId: r.postId, action: "label.changed", before: before.key, after: after.key });
      await notify(tx, post.post.authorId, `${r.signed ? user.displayName : "A reviewer"} completed a ${REVIEW_TYPE_LABELS[r.type].toLowerCase()} on “${post.post.title.slice(0, 60)}”.`, `/p/${r.postId}`);
      return before.key !== after.key ? `Label changed: ${before.label} → ${after.label}.` : "";
    });
    revalidatePath(`/p/${r.postId}`);
    revalidatePath("/");
    return { ok: `Review published and credited on your profile. ${changed}`.trim() };
  } catch (e) {
    if (String(e).includes("reviews_one_per_type_uq")) return { error: "You've already published this type of review on this post." };
    throw e;
  }
}

/* ------------------------------------------------------------ moderation */
const REPORT_REASONS = ["misrepresents_source", "source_corrected_or_retracted", "unsafe_medical_advice", "harassment", "undisclosed_ai"] as const;

export async function reportPostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const postId = str(fd, "postId");
  const reason = z.enum(REPORT_REASONS).safeParse(str(fd, "reason"));
  if (!uuid.safeParse(postId).success || !reason.success) return { error: "Choose a reason for the report." };
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.reports).values({ postId, reporterId: user.id, reason: reason.data, details: str(fd, "details").slice(0, 2000) }).returning({ id: schema.reports.id });
    await audit(tx, { actorId: user.id, entityType: "report", entityId: row.id, action: "report.created", after: { postId, reason: reason.data } });
  });
  return { ok: "Report sent. A moderator will review it." };
}

export async function moderateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("/moderation");
  if (!isModerator(user)) return { error: "Only moderators can act on reports." };
  const reportId = str(fd, "reportId");
  const decision = z.enum(["dispute", "dismiss", "clear"]).safeParse(str(fd, "decision"));
  const rationale = str(fd, "rationale");
  if (!decision.success) return { error: "Choose a decision." };
  if (rationale.length < 10) return { error: "Explain the decision in at least 10 characters. Authors and readers can see it." };
  const [report] = await db.select().from(schema.reports).where(eq(schema.reports.id, reportId)).limit(1);
  if (!report) return { error: "Report not found." };
  const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, report.postId)).limit(1);

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
