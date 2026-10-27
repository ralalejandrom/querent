import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { loadPosts } from "@/lib/queries";
import { compact } from "@/lib/text";
import { Empty, Icon, PostCard } from "@/components/ui";
import { Rail } from "@/components/rail";
import { toggleFollowAction } from "@/app/actions";

export default async function QuestionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const [q] = await db.select().from(schema.questions).where(eq(schema.questions.slug, slug)).limit(1);
  if (!q) notFound();
  const [list, [{ n: followers }], following] = await Promise.all([
    loadPosts({ where: eq(schema.posts.questionId, q.id), viewerId: user?.id ?? null }),
    db.select({ n: count() }).from(schema.follows).where(and(eq(schema.follows.targetType, "question"), eq(schema.follows.targetId, q.id))),
    user ? db.select().from(schema.follows).where(and(eq(schema.follows.userId, user.id), eq(schema.follows.targetType, "question"), eq(schema.follows.targetId, q.id))).then((r) => r.length > 0) : false,
  ]);
  const reviewed = list.filter((p) => p.rigor.key === "expert_reviewed" || p.rigor.key === "source_checked").length;
  const contributions = list.reduce((n, p) => n + p.commentCount, 0);
  return (
    <>
      <main className="main" id="main">
        <Link className="back" href="/questions"><Icon name="left" />All questions</Link>
        <div className="qcard" style={{ marginBottom: 12 }}><span className="qmark">?</span><div><h1 className="pg" style={{ margin: "0 0 6px" }}>{q.text}</h1><div className="hint">{compact(Number(followers))} following</div></div></div>
        <div className="row" style={{ marginBottom: 16 }}>
          {user && <form action={toggleFollowAction.bind(null, "question", q.id)}><button className={`btn ${following ? "" : "pri"}`}>{following ? "Following" : "Follow question"}</button></form>}
          <Link className="btn" href={`/new?q=${q.id}`}><Icon name="plus" />Post to this question</Link>
        </div>
        <div className="box"><h3>Where the evidence stands</h3><p className="hint" style={{ margin: 0 }}>{list.length} post{list.length === 1 ? "" : "s"} linked · {reviewed} with a completed review · {contributions} contributions in discussion.</p></div>
        {list.length ? list.map((p) => <PostCard key={p.id} p={p} signedIn={!!user} />) : <Empty title="No posts yet">Be the first to share evidence on this question.</Empty>}
      </main>
      <Rail />
    </>
  );
}
