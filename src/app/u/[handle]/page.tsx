import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { loadPosts } from "@/lib/queries";
import { REVIEW_TYPE_LABELS, type ReviewType } from "@/lib/rigor";
import { Avatar, Empty, Icon, PostCard } from "@/components/ui";
import { Rail } from "@/components/rail";
import { toggleFollowAction } from "@/app/actions";

export default async function Profile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const viewer = await getCurrentUser();
  const [u] = await db.select().from(schema.users).where(sql`lower(${schema.users.handle}) = ${handle.toLowerCase()}`).limit(1);
  if (!u || u.deletedAt) notFound();
  const isMe = viewer?.id === u.id;
  const [roles, list, reviews, [{ n: followers }], following] = await Promise.all([
    db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, u.id)),
    loadPosts({ where: eq(schema.posts.authorId, u.id), viewerId: viewer?.id ?? null }),
    db.select({ r: schema.reviews, title: schema.posts.title }).from(schema.reviews).innerJoin(schema.posts, eq(schema.posts.id, schema.reviews.postId))
      .where(and(eq(schema.reviews.reviewerId, u.id), eq(schema.reviews.status, "completed"), isMeOrSigned(isMe))).orderBy(desc(schema.reviews.completedAt)),
    db.select({ n: count() }).from(schema.follows).where(and(eq(schema.follows.targetType, "user"), eq(schema.follows.targetId, u.id))),
    viewer && !isMe ? db.select().from(schema.follows).where(and(eq(schema.follows.userId, viewer.id), eq(schema.follows.targetType, "user"), eq(schema.follows.targetId, u.id))).then((r) => r.length > 0) : false,
  ]);
  const reviewer = roles.find((r) => r.role === "reviewer");
  return (
    <>
      <main className="main" id="main">
        <div className="profile-h">
          <Avatar name={u.displayName} handle={u.handle} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1>{u.displayName}</h1>
            <div className="muted">@{u.handle}{u.field ? ` · ${u.field}` : ""}</div>
            <div className="row" style={{ marginTop: 8 }}>
              {reviewer && <span className="badge"><Icon name="check" className="i" />Verified reviewer{reviewer.fields.length ? ` · ${reviewer.fields.join(", ")}` : ""}</span>}
              {u.orcidId && <a className="badge" href={`https://orcid.org/${u.orcidId}`} target="_blank" rel="noopener noreferrer">ORCID {u.orcidId}</a>}
            </div>
          </div>
          {isMe ? <Link className="btn" href="/settings">Edit profile</Link>
            : viewer && <form action={toggleFollowAction.bind(null, "user", u.id)}><button className={`btn ${following ? "" : "pri"}`}>{following ? "Following" : "Follow"}</button></form>}
        </div>
        {u.bio && <p style={{ color: "var(--ink-2)", margin: "14px 0 4px" }}>{u.bio}</p>}
        {u.currentWork && <p className="muted" style={{ margin: 0 }}><b style={{ color: "var(--ink)" }}>Working on:</b> {u.currentWork}</p>}
        <div className="stats">
          <div><b>{list.length}</b><span>Posts</span></div>
          <div><b>{reviews.length}</b><span>Reviews written</span></div>
          <div><b>{Number(followers)}</b><span>Followers</span></div>
          <div><b>{reviews.length * 3 + list.length}</b><span>Contribution credits</span></div>
        </div>
        <div className="sec"><h2>Posts</h2></div>
        {list.length ? list.map((p) => <PostCard key={p.id} p={p} signedIn={!!viewer} />) : <Empty title="No posts yet">{isMe ? "Share your first post: a summary, a figure or an open question." : "Nothing posted yet."}</Empty>}
        <div className="sec"><h2>Reviews written</h2></div>
        {reviews.length ? reviews.map(({ r, title }) => (
          <div className="card" key={r.id}><div className="rtype">{REVIEW_TYPE_LABELS[r.type as ReviewType]} · {r.recommendation}</div><h2 className="ptitle" style={{ fontSize: 17, marginTop: 4 }}><Link href={`/p/${r.postId}`}>{title}</Link></h2><p className="hint" style={{ margin: 0 }}>{r.isSigned ? "Signed" : "Unsigned (visible only to you)"} · Conflicts: {r.conflicts}</p></div>
        )) : <p className="muted">{isMe ? "Reviews you write are credited here." : "No public reviews yet."}</p>}
      </main>
      <Rail />
    </>
  );
}

/** Unsigned reviews count for the reviewer but never appear on their public profile. */
function isMeOrSigned(isMe: boolean) {
  return isMe ? sql`true` : eq(schema.reviews.isSigned, true);
}
