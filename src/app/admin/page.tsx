import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isPlatformAdmin, loadSignups, STAGE_LABELS } from "@/lib/admin-data";
import { timeAgo } from "@/lib/text";
import { grantAccessAction } from "./actions";

export const metadata = { title: "Sign-ups", robots: { index: false } };
export const dynamic = "force-dynamic";
const ago = (d: Date) => { const t = timeAgo(d); return t === "now" ? "just now" : `${t} ago`; };

export default async function Admin() {
  const user = await requireUser("/admin");
  if (!isPlatformAdmin(user)) notFound();
  const { reviewers, waitlist, users, statusOf } = await loadSignups();
  const individuals = waitlist.filter((w) => w.interest === "individual");
  const partners = waitlist.filter((w) => w.interest === "institutional");

  return (
    <main className="main admin" id="main" style={{ maxWidth: 1000 }}>
      <h1 className="pg">Sign-ups</h1>
      <p className="pgsub">Everyone who left their details on lyncei.com. Lyncei is invite-only: people can sign in once you give them access here. Only the founding team can see this page.</p>
      <form action={grantAccessAction} className="ainvite">
        <label className="f">Invite someone by email<input type="email" name="email" placeholder="name@university.edu" required /></label>
        <label className="f">Field <small>for reviewers</small><input type="text" name="field" placeholder="e.g. Cardiology" maxLength={120} /></label>
        <label className="ainv-chk"><input type="checkbox" name="asReviewer" /> Verified reviewer</label>
        <button className="btn pri">Give access and email invite</button>
      </form>
      <div className="stats">
        <div><b>{reviewers.length}</b><span>Reviewer applications</span></div>
        <div><b>{individuals.length}</b><span>Waitlist</span></div>
        <div><b>{partners.length}</b><span>Partnership requests</span></div>
        <div><b>{users.length}</b><span>Accounts</span></div>
      </div>

      <Section title="Founding reviewer applications" csv="reviewers" count={reviewers.length}>
        <table className="atbl">
          <thead><tr><th>Name</th><th>Field</th><th>Institution</th><th>Stage</th><th>Reviews/mo</th><th>ORCID</th><th>When</th><th>Access</th></tr></thead>
          <tbody>{reviewers.map((r) => (
            <tr key={r.id}>
              <td><b>{r.name}</b><small>{r.email}</small></td><td>{r.field}</td><td>{r.institution}</td>
              <td>{STAGE_LABELS[r.careerStage] ?? r.careerStage}</td><td className="num">{r.reviewsPerMonth}</td>
              <td className="when">{r.orcidId ? <a href={`https://orcid.org/${r.orcidId}`} target="_blank" rel="noopener noreferrer">{r.orcidId}</a> : "—"}</td>
              <td className="when">{ago(r.createdAt)}</td>
              <td>{statusOf(r.email) === "reviewer" ? <span className="astat ok">Approved reviewer</span> : (
                <form action={grantAccessAction}><input type="hidden" name="email" value={r.email} /><input type="hidden" name="field" value={r.field} /><input type="hidden" name="asReviewer" value="1" /><button className="btn sm pri">Approve as reviewer</button></form>)}</td>
            </tr>))}</tbody>
        </table>
      </Section>

      <Section title="Partnership requests" csv="partners" count={partners.length}>
        <table className="atbl">
          <thead><tr><th>Email</th><th>Organization</th><th>Type</th><th>When</th></tr></thead>
          <tbody>{partners.map((w) => (
            <tr key={w.id}><td>{w.email}</td><td>{w.organization ?? "—"}</td><td>{w.partnerType ?? "—"}</td><td className="when">{ago(w.createdAt)}</td></tr>))}</tbody>
        </table>
      </Section>

      <Section title="Waitlist" csv="waitlist" count={individuals.length}>
        <table className="atbl">
          <thead><tr><th>Email</th><th>When</th><th>Access</th></tr></thead>
          <tbody>{individuals.map((w) => (
            <tr key={w.id}><td>{w.email}</td><td className="when">{ago(w.createdAt)}</td>
              <td>{statusOf(w.email) ? <span className="astat ok">{statusOf(w.email) === "reviewer" ? "Approved reviewer" : statusOf(w.email) === "account" ? "Has an account" : "Has access"}</span> : (
                <form action={grantAccessAction}><input type="hidden" name="email" value={w.email} /><button className="btn sm">Give access</button></form>)}</td>
            </tr>))}</tbody>
        </table>
      </Section>

      <Section title="Accounts" csv="accounts" count={users.length}>
        <table className="atbl">
          <thead><tr><th>Name</th><th>Email</th><th>Field</th><th>Joined</th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.handle}><td><Link href={`/u/${u.handle}`}>{u.displayName}</Link></td><td>{u.email}</td><td>{u.field || "—"}</td><td className="when">{ago(u.createdAt)}</td></tr>))}</tbody>
        </table>
      </Section>
    </main>
  );
}

function Section({ title, csv, count, children }: { title: string; csv: string; count: number; children: React.ReactNode }) {
  return (
    <section className="asec">
      <div className="ahead"><h2>{title}</h2>{count > 0 && <a className="btn sm" href={`/admin/export?list=${csv}`}>Download CSV</a>}</div>
      {count > 0 ? <div className="ascroll">{children}</div> : <p className="hint">Nothing yet.</p>}
    </section>
  );
}
