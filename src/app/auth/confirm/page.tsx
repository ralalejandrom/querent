import Link from "next/link";
import { confirmEmailAction } from "@/app/auth-actions";

export const metadata = { title: "Confirm your email", robots: { index: false } };

/** Confirmation links land here and only confirm after a click, so mail scanners that open links can't use them up. */
export default async function ConfirmEmail({ searchParams }: { searchParams: Promise<{ token?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="main" id="main">
      <div className="auth">
        <h1 className="pg">Confirm your email</h1>
        {sp.token ? (
          <>
            <p className="pgsub">One tap to finish creating your Lyncei account.</p>
            <form action={confirmEmailAction} className="form">
              <input type="hidden" name="token" value={sp.token} />
              <input type="hidden" name="next" value={sp.next ?? "/"} />
              <button className="btn pri" type="submit">Confirm and continue</button>
            </form>
          </>
        ) : (
          <p className="pgsub">This link is incomplete. <Link href="/login">Sign in</Link> to get a new confirmation link.</p>
        )}
      </div>
    </main>
  );
}
