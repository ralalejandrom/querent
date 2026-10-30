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
      <h1 className="pg">Write a review</h1>
      <p className="pgsub">Review what the post claims and how it uses its source.</p>
      {/* Metrics-free view of the post: likes, views and follower counts are hidden here so popularity doesn't color the review. */}
      <article className="card" aria-label="Post under review">
        <div className="ph"><div className="who"><b>{d.post.author.displayName}</b><small>{d.post.author.field}</small></div></div>
        <h2 className="ptitle">{d.post.title}</h2>
        {d.post.body && <p className="pbody">{d.post.body}</p>}
        {d.post.source ? (
          <a className="study" href={d.post.source.doi ? `https://doi.org/${d.post.source.doi}` : "#"} target="_blank" rel="noopener noreferrer">
            <span className="thumb" />
            <div style={{ minWidth: 0 }}>
              <b>{d.post.source.title}</b>
              <span>{[d.post.source.venue, d.post.source.publishedYear].filter(Boolean).join(" · ") || "Source"}</span>
              {d.post.source.doi && <span className="doi">doi:{d.post.source.doi}</span>}
            </div>
          </a>
        ) : <div className="study missing">No source linked</div>}
      </article>
      <p className="hint" style={{ margin: "10px 0 18px" }}>Likes, views and follower counts are hidden while you review, so the assessment rests on the content and its source.</p>
      {!isReviewer(user) ? <Empty title="Reviewer access needed">Only verified reviewers can publish reviews. An integrity admin grants reviewer status after checking your field of expertise.</Empty>
        : d.post.author.id === user.id ? <Empty title="This is your post">You can't review your own work.</Empty>
        : !d.post.source ? <Empty title="No source linked">Posts need a source before they can be reviewed.</Empty>
        : (
          <ActionForm action={submitReviewAction}>
            <input type="hidden" name="postId" value={id} />
            <ReviewFields taken={mine.map((m) => m.type)} />
            <label className="f">Summary of your assessment<textarea name="summary" rows={5} placeholder="What did you check, what holds up, and what should readers keep in mind?" /></label>
            <label className="f">Recommendation<select name="recommendation"><option>Sound</option><option>Sound with caveats</option><option>Faithful to source</option><option>Major concerns</option><option>Not faithful to source</option></select></label>
            <label className="f">Conflicts of interest <small>Required. Include any payment for this review, from anyone. Write “None” if you have none.</small><input type="text" name="conflicts" placeholder="e.g. None, or: consulted for a company that makes this drug" /></label>
            <fieldset className="checks" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="hint" style={{ marginBottom: 6 }}>Did you use AI tools for this review? <b>Required.</b> AI can help with language or with checking, but the judgment has to be yours.</legend>
              <label><input type="radio" name="aiUse" value="none" required /> No</label>
              <label><input type="radio" name="aiUse" value="language" /> Only for language (wording, translation)</label>
              <label><input type="radio" name="aiUse" value="assist" /> To help check (finding references, recalculating numbers)</label>
            </fieldset>
            <label className="f">Co-reviewer <small>Optional. Training someone? Name the student or early-career colleague who reviewed this with you. They're credited once they confirm.</small><input type="text" name="coReviewer" maxLength={60} placeholder="@handle" autoComplete="off" /></label>
            <div className="notice" style={{ margin: 0 }}><b>Your identity is protected.</b> Readers and the author see “Verified reviewer · identity protected”. Lyncei verifies your credentials and conflicts privately, and the review is credited to your reviewer record.</div>
            <div className="checks"><label><input type="checkbox" name="signed" /> Publish this review under my name</label></div>
            <p className="hint" style={{ margin: 0 }}>The author reads your review first; it becomes public in 48 hours or when they reply. See the <Link href="/guidelines">review guidelines</Link>.</p>
            <div className="row"><Submit>Publish review</Submit><Link className="btn" href={`/p/${id}`}>Cancel</Link></div>
          </ActionForm>
        )}
    </main>
  );
}
