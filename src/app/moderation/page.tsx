import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { isModerator, requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/text";
import { ActionForm, Submit } from "@/components/client";
import { Empty } from "@/components/ui";
import { moderateAction } from "@/app/actions";

export const metadata = { title: "Moderation" };
const REASONS: Record<string, string> = {
  misrepresents_source: "Misrepresents its source", source_corrected_or_retracted: "Source corrected or retracted",
  unsafe_medical_advice: "Unsafe medical advice", harassment: "Harassment", offensive: "Offensive content", spam: "Spam",
  undisclosed_ai: "Undisclosed AI content", other: "Something else", auto_filter: "Held by the content filter",
};

export default async function Moderation() {
  const user = await requireUser("/moderation");
  if (!isModerator(user)) return <main className="main" id="main"><Empty title="Moderators only">This queue is visible to moderators and integrity admins.</Empty></main>;
  const reports = await db.select({ r: schema.reports, post: schema.posts, reporter: schema.users })
    .from(schema.reports).innerJoin(schema.posts, eq(schema.posts.id, schema.reports.postId)).innerJoin(schema.users, eq(schema.users.id, schema.reports.reporterId))
    .where(eq(schema.reports.status, "open")).orderBy(desc(schema.reports.createdAt));
  const commentIds = reports.map((x) => x.r.contributionId).filter((id): id is string => !!id);
  const comments = commentIds.length
    ? await db.select({ c: schema.contributions, author: schema.users }).from(schema.contributions).innerJoin(schema.users, eq(schema.users.id, schema.contributions.authorId)).where(inArray(schema.contributions.id, commentIds))
    : [];
  const byId = new Map(comments.map((x) => [x.c.id, x]));
  return (
    <main className="main" id="main" style={{ maxWidth: 820 }}>
      <h1 className="pg">Moderation</h1>
      <p className="pgsub">Act on every report within 24 hours. Each decision is logged with its rationale and sent to the author.</p>
      {reports.length ? reports.map(({ r, post, reporter }) => {
        const comment = r.contributionId ? byId.get(r.contributionId) : undefined;
        const held = r.reason === "auto_filter";
        const target = comment ? comment.c.status : post.status;
        return (
          <div className="card" key={r.id}>
            <div className="rtype">{REASONS[r.reason] ?? r.reason} · {comment ? "comment" : "post"}{target === "held" ? " · waiting, not public" : ""}</div>
            <h2 className="ptitle" style={{ fontSize: 18, marginTop: 4 }}><Link href={`/p/${post.id}`}>{post.title}</Link></h2>
            {comment && <blockquote className="modquote"><b>{comment.author.displayName}:</b> {comment.c.body}</blockquote>}
            {!comment && held && <blockquote className="modquote">{post.body.slice(0, 600)}{post.body.length > 600 ? "…" : ""}</blockquote>}
            <p className="hint">{held ? "Held automatically" : `Reported by ${reporter.displayName}`} · {timeAgo(r.createdAt)} ago{post.disputedReason ? " · Currently disputed" : ""}</p>
            {r.details && !held && <p style={{ color: "var(--ink-2)" }}>{r.details}</p>}
            <ActionForm action={moderateAction}>
              <input type="hidden" name="reportId" value={r.id} />
              <div className="chips">
                {held && <label className="chip"><input type="radio" name="decision" value="approve" defaultChecked />Approve and publish</label>}
                <label className="chip"><input type="radio" name="decision" value="remove" defaultChecked={!held && (!!comment || r.reason === "offensive" || r.reason === "harassment" || r.reason === "spam")} />Remove {comment ? "comment" : "post"}</label>
                {!comment && !held && <label className="chip"><input type="radio" name="decision" value="dispute" defaultChecked={!["offensive", "harassment", "spam"].includes(r.reason)} />Mark Disputed</label>}
                {!held && <label className="chip"><input type="radio" name="decision" value="dismiss" />Dismiss</label>}
                {!comment && post.disputedReason && <label className="chip"><input type="radio" name="decision" value="clear" />Clear dispute</label>}
              </div>
              <label className="f">Rationale <small>Sent to the author; for disputes, also shown to readers.</small><textarea name="rationale" rows={2} /></label>
              <Submit className="btn pri sm">Record decision</Submit>
            </ActionForm>
          </div>
        );
      }) : <Empty title="No open reports">The queue is clear.</Empty>}
    </main>
  );
}
