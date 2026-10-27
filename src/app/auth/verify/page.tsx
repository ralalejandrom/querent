import Link from "next/link";
import { Mark } from "@/components/ui";
import { confirmLoginAction } from "@/app/actions";

export const metadata = { title: "Confirm sign-in", robots: { index: false } };

/**
 * Sign-in links land here and only sign in after a click. University and corporate mail systems
 * often open links automatically to scan them; a confirm step keeps those scans from using up the link.
 */
export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string; next?: string }> }) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  return (
    <main className="main" id="main">
      <div className="auth">
        <Link className="brand" href="/" style={{ padding: "0 0 24px" }}><Mark /><span className="word">Lyncei</span></Link>
        <h1 className="pg">Confirm sign-in</h1>
        {token ? (
          <>
            <p className="pgsub">Continue to sign in to Lyncei on this device.</p>
            <form action={confirmLoginAction} className="form">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="next" value={sp.next ?? "/"} />
              <button className="btn pri" type="submit">Sign in</button>
            </form>
          </>
        ) : (
          <p className="pgsub">This link is incomplete. <Link href="/login">Request a new sign-in link</Link>.</p>
        )}
      </div>
    </main>
  );
}
