import Link from "next/link";
import { isExampleEmail, showExamples } from "@/lib/examples";
import { notFound } from "next/navigation";
import { and, count, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { loadPosts } from "@/lib/queries";
import { REVIEW_TYPE_LABELS, type ReviewType } from "@/lib/rigor";
import { Avatar, Empty, Icon, PostCard, Name } from "@/components/ui";
import { Rail } from "@/components/rail";
import { toggleBlockAction, toggleFollowAction, signOutAction } from "@/app/actions";

export default async function Profile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const viewer = await getCurrentUser();
  const [u] = await db.select().from(schema.users).where(sql`lower(${schema.users.handle}) = ${handle.toLowerCase()}`).limit(1);
  if (!u || u.deletedAt) notFound();
  const example = isExampleEmail(u.email);
  if (example && !showExamples()) notFound();
  const isMe = viewer?.id === u.id;
  const blockRows = viewer && !isMe ? await db.select().from(schema.blocks).where(sql`(${schema.blocks.blockerId} = ${viewer.id} and ${schema.blocks.blockedId} = ${u.id}) or (${schema.blocks.blockerId} = ${u.id} and ${schema.blocks.blockedId} = ${viewer.id})`) : [];
  const iBlocked = blockRows.some((b) => b.blockerId === viewer?.id);
  const blocked = blockRows.length > 0;
  const [roles, list, reviews, [{ n: followers }], following, [{ n: reviewTotal }], [impact], coReviews] = await Promise.all([
    db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, u.id)),
    loadPosts({ where: eq(schema.posts.authorId, u.id), viewerId: viewer?.id ?? null }),
    db.select({ r: schema.reviews, title: schema.posts.title }).from(schema.reviews).innerJoin(schema.posts, eq(schema.posts.id, schema.reviews.postId))
      .where(and(eq(schema.reviews.reviewerId, u.id), eq(schema.reviews.status, "completed"), isMeOrSigned(isMe), isMe ? sql`true` : lte(schema.reviews.publicAt, new Date()))).orderBy(desc(schema.reviews.completedAt)),
    db.select({ n: count() }).from(schema.follows).where(and(eq(schema.follows.targetType, "user"), eq(schema.follows.targetId, u.id))),
    viewer && !isMe ? db.select().from(schema.follows).where(and(eq(schema.follows.userId, viewer.id), eq(schema.follows.targetType, "user"), eq(schema.follows.targetId, u.id))).then((r) => r.length > 0) : false,
    db.select({ n: count() }).from(schema.reviews).where(and(eq(schema.reviews.reviewerId, u.id), eq(schema.reviews.status, "completed"))),
    // What authors say about this person's reviews, and how often this person revised their own posts after review.
    db.select({
      improved: sql<number>`count(*) filter (where ${schema.reviews.reviewerId} = ${u.id} and ${schema.reviews.ledToRevision})`.mapWith(Number),
      useful: sql<number>`count(*) filter (where ${schema.reviews.reviewerId} = ${u.id} and ${schema.reviews.helpfulness} >= 4)`.mapWith(Number),
      revisedOwn: sql<number>`count(distinct ${schema.reviews.postId}) filter (where ${schema.posts.authorId} = ${u.id} and ${schema.reviews.ledToRevision})`.mapWith(Number),
    }).from(schema.reviews).innerJoin(schema.posts, eq(schema.posts.id, schema.reviews.postId))
      .where(and(eq(schema.reviews.status, "completed"), lte(schema.reviews.publicAt, new Date()))),
    // Mentored reviews this person confirmed. Listed publicly only when the lead reviewer signed the review.
    db.select({ r: schema.reviews, title: schema.posts.title, lead: schema.users.displayName }).from(schema.reviews)
      .innerJoin(schema.posts, eq(schema.posts.id, schema.reviews.postId)).innerJoin(schema.users, eq(schema.users.id, schema.reviews.reviewerId))
      .where(and(eq(schema.reviews.coReviewerId, u.id), isNotNull(schema.reviews.coReviewerConfirmedAt), eq(schema.reviews.status, "completed"), isMeOrSigned(isMe), isMe ? sql`true` : lte(schema.reviews.publicAt, new Date())))
      .orderBy(desc(schema.reviews.completedAt)),
  ]);
  const totalReviews = Number(reviewTotal);
  const hiddenReviews = totalReviews - reviews.length;
  const reviewer = roles.find((r) => r.role === "reviewer");
  return (
    <>
      <main className="main" id="main">
        {example && <p className="exnote"><b>Fictional example account.</b> This person doesn't exist. Their posts and reviews show how Lyncei works.</p>}
        <div className="profile-h">
          <Avatar name={u.displayName} handle={u.handle} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1><Name name={u.displayName} verified={!!reviewer} /></h1>
            <div className="muted">@{u.handle}{u.field ? ` · ${u.field}` : ""}</div>
            <div className="row" style={{ marginTop: 8 }}>
              {reviewer && <span className="badge"><Icon name="check" className="i" />Verified reviewer{reviewer.fields.length ? ` · ${reviewer.fields.join(", ")}` : ""}</span>}
              {u.orcidId && <a className="badge" href={`https://orcid.org/${u.orcidId}`} target="_blank" rel="noopener noreferrer">ORCID {u.orcidId}</a>}
              {impact.revisedOwn > 0 && <span className="badge rev" title="Changed their posts after reviewers' feedback">Revised {impact.revisedOwn} {impact.revisedOwn === 1 ? "post" : "posts"} after review</span>}
            </div>
          </div>
          {isMe ? <div className="ownacts"><Link className="btn" href="/settings">Edit profile</Link><form action={signOutAction}><button className="btn">Sign out</button></form></div>
            : viewer && (
              <div className="ownacts">
                {!blocked && <form action={toggleFollowAction.bind(null, "user", u.id)}><button className={`btn ${following ? "" : "pri"}`}>{following ? "Following" : "Follow"}</button></form>}
                {(iBlocked || !blocked) && (
                  <details className="moremenu">
                    <summary className="btn" aria-label="More options">···</summary>
                    <div className="moremenu-body">
                      <form action={toggleBlockAction.bind(null, u.id)}><button className="btn sm danger">{iBlocked ? "Unblock" : "Block"} {u.displayName}</button></form>
                      <p className="hint">{iBlocked ? "You'll see each other's posts and comments again." : "You won't see each other's posts or comments, and they can't reply to you or follow you. They aren't told."}</p>
                    </div>
                  </details>
                )}
              </div>
            )}
        </div>
        {blocked && <div className="notice" style={{ marginTop: 14 }}>{iBlocked ? "You blocked this account. Their posts and comments are hidden from you." : "You can't see this account's posts."}</div>}
        {u.bio && <p style={{ color: "var(--ink-2)", margin: "14px 0 4px" }}>{u.bio}</p>}
        {u.currentWork && <p className="muted" style={{ margin: 0 }}><b style={{ color: "var(--ink)" }}>Working on:</b> {u.currentWork}</p>}
        <div className="stats">
          <div><b>{list.length}</b><span>Posts</span></div>
          <div><b>{totalReviews}</b><span>Reviews written</span></div>
          <div><b>{impact.improved}</b><span>Posts improved by their reviews</span></div>
          <div><b>{impact.useful}</b><span>Reviews rated useful</span></div>
          {coReviews.length > 0 && <div><b>{coReviews.length}</b><span>Co-reviews</span></div>}
          <div><b>{Number(followers)}</b><span>Followers</span></div>
        </div>
        <div className="sec"><h2>Posts</h2></div>
        {list.length ? list.map((p) => <PostCard key={p.id} p={p} signedIn={!!viewer} />) : <Empty title="No posts yet">{isMe ? "Share your first post: a summary, a figure or an open question." : "Nothing posted yet."}</Empty>}
        <div className="sec"><h2>Reviews written</h2></div>
        {reviews.length ? reviews.map(({ r, title }) => (
          <div className="card" key={r.id}><div className="rtype">{REVIEW_TYPE_LABELS[r.type as ReviewType]} · {r.recommendation}</div><h2 className="ptitle" style={{ fontSize: 17, marginTop: 4 }}><Link href={`/p/${r.postId}`}>{title}</Link></h2><p className="hint" style={{ margin: 0 }}>{r.isSigned ? "Signed" : "Identity protected (only you see it here)"} · Conflicts: {r.conflicts}</p></div>
        )) : <p className="muted">{isMe ? "Every review you write is credited here, including those with your identity protected." : hiddenReviews > 0 ? "" : "No reviews yet."}</p>}
        {hiddenReviews > 0 && <p className="muted">{hiddenReviews} more {hiddenReviews === 1 ? "review" : "reviews"} with identity protected, credited but not listed.</p>}
        {coReviews.length > 0 && (
          <>
            <div className="sec"><h2>Co-reviews</h2></div>
            <p className="hint" style={{ marginTop: -4 }}>Reviews written alongside a verified reviewer, as part of learning to review.</p>
            {coReviews.map(({ r, title, lead }) => (
              <div className="card" key={r.id}><div className="rtype">{REVIEW_TYPE_LABELS[r.type as ReviewType]} · {r.recommendation}</div><h2 className="ptitle" style={{ fontSize: 17, marginTop: 4 }}><Link href={`/p/${r.postId}#review-${r.id}`}>{title}</Link></h2><p className="hint" style={{ margin: 0 }}>{r.isSigned ? `With ${lead}` : "With a reviewer whose identity is protected (only you see it here)"}</p></div>
            ))}
          </>
        )}
      </main>
      <Rail />
    </>
  );
}

/** Anonymous reviews count toward the reviewer's record but are never listed on their public profile. */
function isMeOrSigned(isMe: boolean) {
  return isMe ? sql`true` : eq(schema.reviews.isSigned, true);
}
