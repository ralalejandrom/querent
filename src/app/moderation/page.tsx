import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isModerator, requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/text";
import { ActionForm, Submit } from "@/components/client";
import { Empty } from "@/components/ui";
import { moderateAction } from "@/app/actions";

export const metadata = { title: "Moderation" };
const REASONS: Record<string, string> = {
  misrepresents_source: "Misrepresents its source", source_corrected_or_retracted: "Source corrected or retracted",
  unsafe_medical_advice: "Unsafe medical advice", harassment: "Harassment", undisclosed_ai: "Undisclosed AI content",
};

export default async function Moderation() {
  const user = await requireUser("/moderation");
  if (!isModerator(user)) return <main className="main" id="main"><Empty title="Moderators only">This queue is visible to moderators and integrity admins.</Empty></main>;
  const reports = await db.select({ r: schema.reports, post: schema.posts, reporter: schema.users })
    .from(schema.reports).innerJoin(schema.posts, eq(schema.posts.id, schema.reports.postId)).innerJoin(schema.users, eq(schema.users.id, schema.reports.reporterId))
    .where(eq(schema.reports.status, "open")).orderBy(desc(schema.reports.createdAt));
  return (
    <main className="main" id="main" style={{ maxWidth: 820 }}>
      <h1 className="pg">Moderation</h1>
      <p className="pgsub">Every decision is logged with its rationale and shown to the author. Nothing is silently deleted.</p>
      {reports.length ? reports.map(({ r, post, reporter }) => (
        <div className="card" key={r.id}>
          <div className="rtype">{REASONS[r.reason] ?? r.reason}</div>
          <h2 className="ptitle" style={{ fontSize: 18, marginTop: 4 }}><Link href={`/p/${post.id}`}>{post.title}</Link></h2>
          <p className="hint">Reported by {reporter.displayName} · {timeAgo(r.createdAt)} ago{post.disputedReason ? " · Currently disputed" : ""}</p>
          {r.details && <p style={{ color: "var(--ink-2)" }}>{r.details}</p>}
          <ActionForm action={moderateAction}>
            <input type="hidden" name="reportId" value={r.id} />
            <div className="chips">
              <label className="chip"><input type="radio" name="decision" value="dispute" defaultChecked />Mark Disputed</label>
              <label className="chip"><input type="radio" name="decision" value="dismiss" />Dismiss</label>
              {post.disputedReason && <label className="chip"><input type="radio" name="decision" value="clear" />Clear dispute</label>}
            </div>
            <label className="f">Rationale <small>Shown to the author and, for disputes, to readers.</small><textarea name="rationale" rows={2} /></label>
            <Submit className="btn pri sm">Record decision</Submit>
          </ActionForm>
        </div>
      )) : <Empty title="No open reports">The queue is clear.</Empty>}
    </main>
  );
}
