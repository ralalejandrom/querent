import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser, isReviewer } from "@/lib/auth";
import { getPostDetail } from "@/lib/queries";
import { REVIEW_TYPE_LABELS, type ReviewType } from "@/lib/rigor";
import { timeAgo } from "@/lib/text";
import { Avatar, Empty, Icon, PostCard, Name } from "@/components/ui";
import { ActionForm, ComposerFields, ReplyToggle, Submit } from "@/components/client";
import { Rail } from "@/components/rail";
import { addContributionAction, reportPostAction, respondAction } from "@/app/actions";
import { after } from "next/server";
import { ensureSourceSummary, loadSourcePreviews, needsSummary } from "@/lib/source-preview";
import { RefPreview } from "@/components/ref-preview";
import { ShareButton } from "@/components/client";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const d = await getPostDetail((await params).id, null);
  if (!d) return { title: "Post" };
  const desc = `${d.post.rigor.label} on Lyncei · ${d.post.author.displayName}`;
  return { title: d.post.title, description: desc, openGraph: { title: d.post.title, description: desc, type: "article" }, twitter: { card: "summary_large_image", title: d.post.title, description: desc } };
}

export default async function PostPage({ params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  const d = await getPostDetail(id, user?.id ?? null);
  if (!d) notFound();
  const { post, reviews, comments } = d;
  const isAuthor = user?.id === post.author.id;
  // Cited papers: the post's source and any DOIs cited in the discussion.
  const citedDois = [post.source?.doi, ...comments.flatMap(({ c, replies }) => [c.sourceDoi, ...replies.map((r) => r.c.sourceDoi)])].filter((d): d is string => !!d);
  const previews = await loadSourcePreviews(citedDois);
  for (const s of previews.values()) if (needsSummary(s)) after(() => ensureSourceSummary(s.id));
  const preview = (doi: string | null | undefined) => (doi ? previews.get(doi.toLowerCase()) : undefined);
  const postSource = preview(post.source?.doi);
  const canReview = isReviewer(user) && !isAuthor && !!post.source && post.rigor.key !== "unreviewed";
  const methodological = reviews.find((r) => r.review.type === "methodological" && r.review.status === "completed" && r.review.ratings);
  const lvl = (v: string) => (/high|low|available/i.test(v) ? "" : /moderate|pending/i.test(v) ? "mid" : "low");

  const quality = (
    <div className="box">
      <h3>Study quality</h3>
      {methodological?.review.ratings ? (
        <>
          <div className="qi"><i className={lvl(methodological.review.ratings.rigor)} /><span>Methodological rigor<b>{methodological.review.ratings.rigor}</b></span></div>
          <div className="qi"><i className={methodological.review.ratings.bias === "Low" ? "" : methodological.review.ratings.bias === "Moderate" ? "mid" : "low"} /><span>Risk of bias<b>{methodological.review.ratings.bias}</b></span></div>
          <div className="qi"><i className={methodological.review.ratings.relevance === "High" ? "" : "mid"} /><span>Clinical relevance<b>{methodological.review.ratings.relevance}</b></span></div>
          <div className="qi"><i className={lvl(methodological.review.ratings.reproducibility)} /><span>Reproducibility<b>{methodological.review.ratings.reproducibility}</b></span></div>
          <p className="hint" style={{ margin: "6px 0 0" }}>From {methodological.review.isSigned ? methodological.reviewer.displayName : "a reviewer"}'s methodological review.</p>
        </>
      ) : <p className="hint" style={{ margin: 0 }}>No methodological review yet. Quality ratings appear once a qualified reviewer assesses the study.</p>}
    </div>
  );

  const composer = (parentId?: string) => (
    <ActionForm action={addContributionAction} className="composer" resetOnOk>
      <input type="hidden" name="postId" value={post.id} />
      <input type="hidden" name="parentId" value={parentId ?? ""} />
      <ComposerFields id={parentId ?? "root"} />
    </ActionForm>
  );

  return (
    <>
      <main className="main" id="main">
        <Link className="back" href="/?tab=foryou"><Icon name="left" />Back to feed</Link>
        {post.author.example && <p className="exnote"><b>Fictional example.</b> The people, study, DOI and reviews on this page are made up to show how Lyncei works.</p>}
        <PostCard p={post} full signedIn={!!user} />
        <div className="sharebar"><ShareButton url={`/p/${post.id}`} title={post.title} /></div>
        {postSource && (postSource.aiSummary || postSource.correctionStatus === "retracted" || postSource.correctionStatus === "expression_of_concern") && <RefPreview source={postSource} />}

        <div className="sec">
          <h2>Reviews ({reviews.length})</h2>
          <div className="row">
            {canReview && <Link className="btn pri sm" href={`/p/${post.id}/review`}><Icon name="review" />Write a review</Link>}
          </div>
        </div>
        <p className="hint" style={{ marginTop: -4 }}>{post.rigor.description}</p>
        {reviews.length ? reviews.map(({ review: r, reviewer }) => (
          <div className="review" key={r.id}>
            <div className="row">
              {r.isSigned ? <><Avatar name={reviewer.displayName} handle={reviewer.handle} size="sm" /><div><Link href={`/u/${reviewer.handle}`}><b><Name name={reviewer.displayName} verified /></b></Link> <span className="hint">· {reviewer.field}</span></div></> : <div><b>Verified reviewer</b> <span className="hint">· identity protected</span></div>}
              <span style={{ marginLeft: "auto" }} className={`pillst ${r.status === "completed" ? "done" : ""}`}>{r.status === "completed" ? "Completed" : "In progress"}</span>
            </div>
            <div className="rtype" style={{ marginTop: 8 }}>{REVIEW_TYPE_LABELS[r.type as ReviewType]}{r.recommendation ? ` · ${r.recommendation}` : ""}</div>
            {r.summary ? <p>{r.summary}</p> : <p className="muted">Review underway.</p>}
            {Object.keys(r.checklist).length > 0 && <ul className="hint" style={{ margin: "8px 0 0", paddingLeft: 18 }}>{Object.keys(r.checklist).map((c) => <li key={c}>{c}</li>)}</ul>}
            <div className="meta">{r.isSigned ? "Signed review" : "Identity verified by Lyncei and protected"} · Conflicts: {r.conflicts} · Reviewed version {r.postVersion}{r.completedAt ? ` · ${timeAgo(r.completedAt)} ago` : ""}</div>
          </div>
        )) : <Empty title="No reviews yet">{!post.source ? "Posts need a source before they can be reviewed." : isReviewer(user) ? "Be the first to review this post." : "Verified reviewers in this field can review it."}</Empty>}

        {post.authorResponse && <div className="review"><div className="row"><Avatar name={post.author.displayName} handle={post.author.handle} size="sm" /><b>Author response</b></div><p>{post.authorResponse}</p></div>}
        {isAuthor && reviews.some((r) => r.review.status === "completed") && (
          <details className="box"><summary className="btn sm">{post.authorResponse ? "Update your response" : "Respond to reviewers"}</summary>
            <ActionForm action={respondAction}>
              <input type="hidden" name="postId" value={post.id} />
              <label className="f" style={{ marginTop: 12 }}>Your response<textarea name="response" rows={4} defaultValue={post.authorResponse ?? ""} /></label>
              <Submit>Publish response</Submit>
            </ActionForm>
          </details>
        )}

        <div className="sec" id="discussion"><h2>Discussion ({comments.reduce((n, c) => n + 1 + c.replies.length, 0)})</h2></div>
        {user ? composer() : <div className="notice"><Link href={`/login?next=/p/${post.id}`}>Sign in</Link> to join the discussion.</div>}
        {comments.length ? comments.map(({ c, author, replies }) => (
          <div className="cmt" key={c.id}>
            <div className="ph" style={{ margin: 0 }}><Avatar name={author.displayName} handle={author.handle} size="sm" /><div className="who"><Link href={`/u/${author.handle}`}>{author.displayName}</Link><small>{author.field} · {timeAgo(c.createdAt)}</small></div><span className={`tag ${c.type}`} style={{ marginLeft: "auto" }}>{c.type}</span></div>
            <div className="body">{c.body}{c.sourceDoi && (preview(c.sourceDoi) ? <RefPreview source={preview(c.sourceDoi)!} compact /> : <a className="study" style={{ margin: "8px 0 0" }} href={`https://doi.org/${c.sourceDoi}`} target="_blank" rel="noopener noreferrer"><div><b>Cited evidence</b><span className="doi">doi:{c.sourceDoi}</span></div></a>)}</div>
            {replies.map(({ c: r, author: ra }) => (
              <div className="cmt reply" key={r.id}>
                <div className="ph" style={{ margin: 0 }}><Avatar name={ra.displayName} handle={ra.handle} size="sm" /><div className="who"><Link href={`/u/${ra.handle}`}>{ra.displayName}</Link><small>{ra.field} · {timeAgo(r.createdAt)}</small></div><span className={`tag ${r.type}`} style={{ marginLeft: "auto" }}>{r.type}</span></div>
                <div className="body">{r.body}{r.sourceDoi && (preview(r.sourceDoi) ? <RefPreview source={preview(r.sourceDoi)!} compact /> : <span className="doi" style={{ display: "block", marginTop: 6 }}>doi:{r.sourceDoi}</span>)}</div>
              </div>
            ))}
            {user && <div style={{ marginLeft: 30 }}><ReplyToggle>{composer(c.id)}</ReplyToggle></div>}
          </div>
        )) : <p className="muted">Start the discussion with a question or evidence.</p>}

        {user && !isAuthor && (
          <details className="box" style={{ marginTop: 24 }}>
            <summary className="btn sm"><Icon name="flag" />Report this post</summary>
            <ActionForm action={reportPostAction}>
              <input type="hidden" name="postId" value={post.id} />
              <div className="checks" style={{ marginTop: 12 }}>
                {[["misrepresents_source", "The post misrepresents its source"], ["source_corrected_or_retracted", "The source has been corrected or retracted"], ["unsafe_medical_advice", "Unsafe medical advice"], ["harassment", "Harassment or personal attack"], ["undisclosed_ai", "Undisclosed AI-generated content"]].map(([v, l], i) => (
                  <label key={v}><input type="radio" name="reason" value={v} defaultChecked={i === 0} /> {l}</label>
                ))}
              </div>
              <label className="f">Details <small>Optional</small><textarea name="details" rows={3} /></label>
              <p className="hint" style={{ margin: 0 }}>A moderator reviews every report. If a post is marked Disputed, the reason and full history stay visible.</p>
              <Submit>Send report</Submit>
            </ActionForm>
          </details>
        )}
      </main>
      <Rail>{quality}</Rail>
    </>
  );
}
