import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isReviewer, requireUser } from "@/lib/auth";
import { getPostDetail } from "@/lib/queries";
import { ActionForm, ReviewFields, Submit } from "@/components/client";
import { Empty, Icon } from "@/components/ui";
import { submitReviewAction } from "@/app/actions";

export const metadata = { title: "Write a review" };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/p/${id}/review`);
  const d = await getPostDetail(id, user.id);
  if (!d) notFound();
  const mine = await db.select({ type: schema.reviews.type }).from(schema.reviews).where(and(eq(schema.reviews.postId, id), eq(schema.reviews.reviewerId, user.id)));
  return (
    <main className="main" id="main" style={{ maxWidth: 760 }}>
      <Link className="back" href={`/p/${id}`}><Icon name="left" />Back to post</Link>
      <h1 className="pg">Write an open review</h1>
      <p className="pgsub">{d.post.title}</p>
      {!isReviewer(user) ? <Empty title="Reviewer access needed">Only verified reviewers can publish reviews. An integrity admin grants reviewer status after checking your field of expertise.</Empty>
        : d.post.author.id === user.id ? <Empty title="This is your post">You can't review your own work.</Empty>
        : !d.post.source ? <Empty title="No source linked">Posts need a source before they can be reviewed.</Empty>
        : (
          <ActionForm action={submitReviewAction}>
            <input type="hidden" name="postId" value={id} />
            <ReviewFields taken={mine.map((m) => m.type)} />
            <label className="f">Summary of your assessment<textarea name="summary" rows={5} placeholder="What did you check, what holds up, and what should readers keep in mind?" /></label>
            <label className="f">Recommendation<select name="recommendation"><option>Sound</option><option>Sound with caveats</option><option>Faithful to source</option><option>Major concerns</option><option>Not faithful to source</option></select></label>
            <label className="f">Conflicts of interest <small>Required. Write “None” if you have none.</small><input type="text" name="conflicts" placeholder="e.g. None, or: consulted for a company that makes this drug" /></label>
            <div className="checks"><label><input type="checkbox" name="signed" defaultChecked /> Sign this review with my name (open review)</label></div>
            <div className="row"><Submit>Publish review</Submit><Link className="btn" href={`/p/${id}`}>Cancel</Link></div>
          </ActionForm>
        )}
    </main>
  );
}
