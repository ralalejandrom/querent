import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser, isReviewer } from "@/lib/auth";
import { getReviewQueue } from "@/lib/queries";
import { REVIEW_TYPE_LABELS, type ReviewType } from "@/lib/rigor";
import { Avatar, Empty, RigorChip, Name } from "@/components/ui";
import { Rail } from "@/components/rail";

export const metadata = { title: "Reviews" };

export default async function Reviews() {
  const user = await getCurrentUser();
  if (!isReviewer(user)) {
    return (
      <>
        <main className="main" id="main">
          <h1 className="pg">Reviews</h1>
          <p className="pgsub">Verified, scoped and credited peer review. The review is public; the reviewer’s identity is protected.</p>
          <Empty title="Reviewer access needed">Verified reviewers see posts in their fields that are waiting for review. {user ? "An integrity admin grants reviewer status after checking your expertise." : <Link href="/login?next=/reviews">Sign in</Link>}</Empty>
        </main>
        <Rail />
      </>
    );
  }
  const [queue, mine] = await Promise.all([
    getReviewQueue(user!.id),
    db.select({ r: schema.reviews, title: schema.posts.title }).from(schema.reviews).innerJoin(schema.posts, eq(schema.posts.id, schema.reviews.postId)).where(eq(schema.reviews.reviewerId, user!.id)).orderBy(desc(schema.reviews.createdAt)),
  ]);
  return (
    <>
      <main className="main" id="main">
        <h1 className="pg">Reviews</h1>
        <p className="pgsub">Posts waiting for a review. Every review you complete is credited on your profile.</p>
        <div className="sec"><h2>Waiting for review ({queue.length})</h2></div>
        {queue.length ? queue.map((p) => (
          <div className="card" key={p.id}>
            <div className="ph"><Avatar name={p.author.displayName} handle={p.author.handle} size="sm" /><div className="who"><Link href={`/u/${p.author.handle}`}><Name name={p.author.displayName} verified={p.author.verified} /></Link><small>{p.topic ?? "General"}</small></div><span className="t"><RigorChip rigor={p.rigor} /></span></div>
            <h2 className="ptitle" style={{ fontSize: 18 }}><Link href={`/p/${p.id}`}>{p.title}</Link></h2>
            <div className="row"><Link className="btn pri sm" href={`/p/${p.id}/review`}>Write a review</Link><Link className="btn sm" href={`/p/${p.id}`}>Open post</Link></div>
          </div>
        )) : <Empty title="All caught up">No posts are waiting for review right now.</Empty>}
        <div className="sec"><h2>Your reviews ({mine.length})</h2></div>
        {mine.length ? mine.map(({ r, title }) => (
          <div className="card" key={r.id}><div className="rtype">{REVIEW_TYPE_LABELS[r.type as ReviewType]} · {r.recommendation}</div><h2 className="ptitle" style={{ fontSize: 17, marginTop: 4 }}><Link href={`/p/${r.postId}`}>{title}</Link></h2><p className="hint" style={{ margin: 0 }}>{r.summary.slice(0, 200)}</p></div>
        )) : <p className="muted">Reviews you write will appear here and on your profile.</p>}
      </main>
      <Rail />
    </>
  );
}
