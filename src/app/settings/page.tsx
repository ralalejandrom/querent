import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, PasswordInput, Submit } from "@/components/client";
import { changePasswordAction } from "@/app/auth-actions";
import { MIN_PASSWORD } from "@/lib/password";
import { deleteAccountAction, signOutAction, toggleBlockAction, updateProfileAction } from "@/app/actions";
import Link from "next/link";

export const metadata = { title: "Settings" };

export default async function Settings({ searchParams }: { searchParams: Promise<{ orcid?: string; welcome?: string; delete?: string; password?: string }> }) {
  const user = await requireUser("/settings");
  const sp = await searchParams;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  const blocked = await db.select({ id: schema.users.id, name: schema.users.displayName, handle: schema.users.handle })
    .from(schema.blocks).innerJoin(schema.users, eq(schema.users.id, schema.blocks.blockedId)).where(eq(schema.blocks.blockerId, user.id));
  const orcidReady = !!process.env.ORCID_CLIENT_ID;
  return (
    <main className="main" id="main" style={{ maxWidth: 680 }}>
      <div className="pghead"><h1 className="pg">Settings</h1><form action={signOutAction}><button className="btn">Sign out</button></form></div>
      <p className="hint" style={{ marginTop: -4 }}>Signed in as {u.email}</p>
      {sp.welcome === "1" && <div className="msg ok" style={{ marginBottom: 16 }}>Welcome to Lyncei. Your account is ready. Add your field and a short bio so people know who you are.</div>}
      {sp.password === "reset" && <div className="msg ok" style={{ marginBottom: 16 }}>Your new password is saved. You're signed in here, and other devices were signed out.</div>}
      <div className="sec"><h2>Profile</h2></div>
      <ActionForm action={updateProfileAction}>
        <label className="f">Name<input type="text" name="displayName" defaultValue={u.displayName} maxLength={80} /></label>
        <label className="f">Field <small>For example: Neuroscience · PhD student</small><input type="text" name="field" defaultValue={u.field} maxLength={120} /></label>
        <label className="f">Bio<textarea name="bio" rows={3} defaultValue={u.bio} maxLength={600} /></label>
        <label className="f">What you're working on<input type="text" name="currentWork" defaultValue={u.currentWork} maxLength={200} /></label>
        <Submit>Save profile</Submit>
      </ActionForm>
      <div className="sec"><h2>Password</h2></div>
      {!u.passwordHash && <p className="hint">You've been signing in with email links. Set a password to sign in with your email and password, including in the app.</p>}
      <ActionForm action={changePasswordAction} resetOnOk>
        <input type="email" name="username" autoComplete="username" value={u.email} readOnly hidden />
        {u.passwordHash && <label className="f">Current password<PasswordInput name="current" autoComplete="current-password" /></label>}
        <label className="f">New password <small>At least {MIN_PASSWORD} characters.</small><PasswordInput name="password" autoComplete="new-password" minLength={MIN_PASSWORD} /></label>
        <label className="f">Type it again<PasswordInput name="confirm" autoComplete="new-password" minLength={MIN_PASSWORD} /></label>
        <Submit>{u.passwordHash ? "Change password" : "Set password"}</Submit>
      </ActionForm>
      <div className="sec"><h2>ORCID</h2></div>
      {sp.orcid === "linked" && <div className="msg ok">ORCID iD connected.</div>}
      {sp.orcid === "error" && <div className="msg err">We couldn't connect your ORCID iD. Try again.</div>}
      {sp.orcid === "taken" && <div className="msg err">That ORCID iD is already connected to another account.</div>}
      <div className="box">
        {u.orcidId ? <p style={{ margin: 0 }}>Connected: <a href={`https://orcid.org/${u.orcidId}`} target="_blank" rel="noopener noreferrer">{u.orcidId}</a></p>
          : orcidReady ? <><p style={{ marginTop: 0 }}>Connect your ORCID iD to show it on your profile and link your reviews. Connecting proves you own the iD; it doesn't grant reviewer status on its own.</p><a className="btn pri" href="/auth/orcid/start">Connect ORCID</a></>
          : <p className="hint" style={{ margin: 0 }}>ORCID sign-in isn't configured on this server yet (set ORCID_CLIENT_ID and ORCID_CLIENT_SECRET).</p>}
      </div>
      <div className="sec"><h2>Blocked accounts</h2></div>
      {blocked.length ? (
        <div className="blocklist">
          {blocked.map((b) => (
            <div className="row" key={b.id}><Link href={`/u/${b.handle}`}>{b.name}</Link><form action={toggleBlockAction.bind(null, b.id)}><button className="btn sm">Unblock</button></form></div>
          ))}
        </div>
      ) : <p className="hint">You haven't blocked anyone. To block someone, open their profile and choose ··· then Block.</p>}
      <div className="sec"><h2>Help</h2></div>
      <p className="hint">Questions, a problem with your account, or something you want removed? <Link href="/support">Contact us</Link>. Read the <Link href="/guidelines">community rules</Link>, <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy policy</Link>.</p>
      <div className="sec"><h2>Your data</h2></div>
      <p className="hint">Download everything you've posted, reviewed and contributed as JSON.</p>
      <a className="btn" href="/api/v1/me/export">Export my data</a>
      <div className="sec"><h2>Delete account</h2></div>
      <p className="hint">Your profile and posts are removed and your email is erased. Reviews and comments you wrote stay, shown as "Deleted account", because other people rely on the review record. This can't be undone.</p>
      {sp.delete === "confirm" && <div className="msg err" style={{ marginBottom: 10 }}>Type DELETE to confirm.</div>}
      <form action={deleteAccountAction} className="delacct">
        <label className="f">Type DELETE to confirm<input type="text" name="confirm" autoComplete="off" required /></label>
        <button className="btn danger">Delete my account</button>
      </form>
    </main>
  );
}
