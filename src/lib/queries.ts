import "server-only";
import { and, count, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeRigor, type Rigor, type ReviewType } from "./rigor";

const { posts, users, sources, questions, topics, reactions, saves, contributions, reviews, follows } = schema;

export interface PostView {
  id: string;
  kind: (typeof schema.postKindEnum.enumValues)[number];
  title: string;
  body: string;
  createdAt: Date;
  aiAssisted: boolean;
  disputedReason: string | null;
  authorResponse: string | null;
  version: number;
  author: { id: string; handle: string; displayName: string; field: string };
  source: { doi: string | null; title: string; venue: string | null; publishedYear: number | null; correctionStatus: string } | null;
  question: { id: string; slug: string; text: string } | null;
  topic: string | null;
  topicId: number | null;
  likes: number;
  insightful: number;
  viewerLiked: boolean;
  viewerInsightful: boolean;
  saved: boolean;
  commentCount: number;
  reviewTotal: number;
  reviewCompleted: number;
  completedTypes: ReviewType[];
  rigor: Rigor;
  why?: string;
}

/** Loads posts with author, source, question, reach and rigor in a fixed number of queries. */
export async function loadPosts(opts: { where?: SQL; viewerId?: string | null; limit?: number; ids?: string[] }): Promise<PostView[]> {
  const conds: SQL[] = [eq(posts.status, "visible")];
  if (opts.where) conds.push(opts.where);
  if (opts.ids) {
    if (!opts.ids.length) return [];
    conds.push(inArray(posts.id, opts.ids));
  }
  const rows = await db
    .select({ post: posts, author: users, source: sources, question: questions, topic: topics })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(sources, eq(sources.id, posts.sourceId))
    .leftJoin(questions, eq(questions.id, posts.questionId))
    .leftJoin(topics, eq(topics.id, posts.topicId))
    .where(and(...conds))
    .orderBy(desc(posts.createdAt))
    .limit(opts.limit ?? 50);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.post.id);

  const [reactRows, viewerReacts, viewerSaves, commentRows, reviewRows] = await Promise.all([
    db.select({ postId: reactions.postId, kind: reactions.kind, n: count() }).from(reactions).where(inArray(reactions.postId, ids)).groupBy(reactions.postId, reactions.kind),
    opts.viewerId ? db.select({ postId: reactions.postId, kind: reactions.kind }).from(reactions).where(and(inArray(reactions.postId, ids), eq(reactions.userId, opts.viewerId))) : Promise.resolve([]),
    opts.viewerId ? db.select({ postId: saves.postId }).from(saves).where(and(inArray(saves.postId, ids), eq(saves.userId, opts.viewerId))) : Promise.resolve([]),
    db.select({ postId: contributions.postId, n: count() }).from(contributions).where(and(inArray(contributions.postId, ids), eq(contributions.status, "visible"))).groupBy(contributions.postId),
    db.select({ postId: reviews.postId, type: reviews.type, status: reviews.status }).from(reviews).where(inArray(reviews.postId, ids)),
  ]);

  const key = (a: string, b: string) => `${a}:${b}`;
  const reactMap = new Map(reactRows.map((r) => [key(r.postId, r.kind), Number(r.n)]));
  const mine = new Set(viewerReacts.map((r) => key(r.postId, r.kind)));
  const saved = new Set(viewerSaves.map((r) => r.postId));
  const comments = new Map(commentRows.map((r) => [r.postId, Number(r.n)]));

  return rows.map(({ post, author, source, question, topic }) => {
    const rv = reviewRows.filter((r) => r.postId === post.id);
    const completedTypes = rv.filter((r) => r.status === "completed").map((r) => r.type);
    return {
      id: post.id, kind: post.kind, title: post.title, body: post.body, createdAt: post.createdAt,
      aiAssisted: post.aiAssisted, disputedReason: post.disputedReason, authorResponse: post.authorResponse, version: post.version,
      author: { id: author.id, handle: author.handle, displayName: author.displayName, field: author.field },
      source: source ? { doi: source.doi, title: source.title, venue: source.venue, publishedYear: source.publishedYear, correctionStatus: source.correctionStatus } : null,
      question: question ? { id: question.id, slug: question.slug, text: question.text } : null,
      topic: topic?.label ?? null, topicId: topic?.id ?? null,
      likes: reactMap.get(key(post.id, "like")) ?? 0,
      insightful: reactMap.get(key(post.id, "insightful")) ?? 0,
      viewerLiked: mine.has(key(post.id, "like")),
      viewerInsightful: mine.has(key(post.id, "insightful")),
      saved: saved.has(post.id),
      commentCount: comments.get(post.id) ?? 0,
      reviewTotal: rv.length,
      reviewCompleted: completedTypes.length,
      completedTypes,
      rigor: computeRigor({ hasSource: !!source && source.provenance.provider !== "unresolved", sourceUnverified: source?.provenance.provider === "unresolved", disputedReason: post.disputedReason, correctionStatus: source?.correctionStatus, completedReviewTypes: completedTypes }),
    };
  });
}

export type FeedTab = "foryou" | "following" | "reviewed" | "questions";

/**
 * Feed ranking v0: transparent heuristic from the technical spec.
 * Likes and shares are NOT inputs; every item explains why it was shown.
 */
export async function getFeed(viewerId: string | null, tab: FeedTab, search?: string): Promise<PostView[]> {
  const where = search?.trim()
    ? sql`to_tsvector('english', ${posts.title} || ' ' || ${posts.body}) @@ plainto_tsquery('english', ${search.trim()})`
    : undefined;
  const list = await loadPosts({ where, viewerId, limit: 200 });

  const followed = viewerId ? await db.select().from(follows).where(eq(follows.userId, viewerId)) : [];
  const fUsers = new Set(followed.filter((f) => f.targetType === "user").map((f) => f.targetId));
  const fQuestions = new Set(followed.filter((f) => f.targetType === "question").map((f) => f.targetId));
  const fTopics = new Set(followed.filter((f) => f.targetType === "topic").map((f) => f.targetId));

  let filtered = list;
  if (tab === "following") filtered = list.filter((p) => fUsers.has(p.author.id) || (p.question && fQuestions.has(p.question.id)) || p.author.id === viewerId);
  if (tab === "reviewed") filtered = list.filter((p) => p.rigor.key === "expert_reviewed" || p.rigor.key === "source_checked");
  if (tab === "questions") filtered = list.filter((p) => p.kind === "open_question" || !!p.question);

  const now = Date.now();
  const scored = filtered.map((p) => {
    const reasons: string[] = [];
    let s = 0;
    if (p.question && fQuestions.has(p.question.id)) { s += 3; reasons.push("you follow this question"); }
    if (fUsers.has(p.author.id)) { s += 2; reasons.push(`you follow ${p.author.displayName}`); }
    if (p.topicId && fTopics.has(String(p.topicId))) { s += 1.5; reasons.push(`you follow ${p.topic}`); }
    const provenance = p.source ? (p.reviewCompleted ? 1 : 0.6) : 0;
    s += provenance;
    if (provenance === 1) reasons.push("it has a completed review");
    s += Math.log1p(p.commentCount);
    if (p.commentCount >= 3) reasons.push("active discussion");
    const ageDays = (now - p.createdAt.getTime()) / 86_400_000;
    s *= Math.pow(0.5, ageDays / 14);
    s += Math.pow(0.5, ageDays / 3); // freshness so new posts surface
    return { ...p, score: s, why: reasons.length ? `Shown because ${reasons.join(", ")}.` : "Shown because it's recent." };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, 50);
}

export async function getPostDetail(id: string, viewerId: string | null) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [post] = await loadPosts({ ids: [id], viewerId });
  if (!post) return null;
  const [reviewRows, commentRows] = await Promise.all([
    db.select({ review: reviews, reviewer: users }).from(reviews).innerJoin(users, eq(users.id, reviews.reviewerId)).where(eq(reviews.postId, id)).orderBy(reviews.createdAt),
    db.select({ c: contributions, author: users }).from(contributions).innerJoin(users, eq(users.id, contributions.authorId))
      .where(and(eq(contributions.postId, id), ne(contributions.status, "removed"))).orderBy(contributions.createdAt),
  ]);
  type C = (typeof commentRows)[number] & { replies: (typeof commentRows)[number][] };
  const top: C[] = [];
  const byId = new Map<string, C>();
  for (const r of commentRows) {
    const node = { ...r, replies: [] } as C;
    byId.set(r.c.id, node);
    if (r.c.parentId && byId.has(r.c.parentId)) byId.get(r.c.parentId)!.replies.push(r);
    else top.push(node);
  }
  return { post, reviews: reviewRows, comments: top };
}

export async function getQuestions(viewerId: string | null) {
  const rows = await db
    .select({
      q: questions, topic: topics.label,
      posts: sql<number>`(select count(*) from ${posts} where ${posts.questionId} = ${questions.id} and ${posts.status} = 'visible')`.mapWith(Number),
      followers: sql<number>`(select count(*) from ${follows} where ${follows.targetType} = 'question' and ${follows.targetId} = ${questions.id}::text)`.mapWith(Number),
      following: viewerId
        ? sql<boolean>`exists(select 1 from ${follows} where ${follows.userId} = ${viewerId} and ${follows.targetType} = 'question' and ${follows.targetId} = ${questions.id}::text)`
        : sql<boolean>`false`,
    })
    .from(questions)
    .leftJoin(topics, eq(topics.id, questions.topicId))
    .orderBy(desc(questions.createdAt));
  return rows;
}

export async function getReviewQueue(viewerId: string) {
  const mine = await db.select({ postId: reviews.postId }).from(reviews).where(eq(reviews.reviewerId, viewerId));
  const done = new Set(mine.map((r) => r.postId));
  const list = await loadPosts({ viewerId, limit: 200, where: sql`${posts.sourceId} is not null and ${posts.authorId} <> ${viewerId} and ${posts.disputedReason} is null` });
  return list.filter((p) => !done.has(p.id) && p.rigor.key !== "expert_reviewed" && p.rigor.key !== "unreviewed");
}
