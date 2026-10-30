import Link from "next/link";
import { ActionForm, PasswordInput, Submit } from "@/components/client";
import { resetPasswordAction } from "@/app/auth-actions";
import { peekEmailToken } from "@/lib/auth";
import { MIN_PASSWORD } from "@/lib/password";

export const metadata = { title: "Choose a new password", robots: { index: false } };

/** Opening this page doesn't use up the link (mail scanners open links too); saving the new password does. */
export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const email = await peekEmailToken(token, "reset");
  return (
    <main className="main" id="main">
      <div className="auth">
        <h1 className="pg">Choose a new password</h1>
        {email ? (
          <>
            <p className="pgsub">For {email}. You'll be signed in on this device and signed out everywhere else.</p>
            <ActionForm action={resetPasswordAction}>
              <input type="hidden" name="token" value={token} />
              <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
              <label className="f">New password <small>At least {MIN_PASSWORD} characters.</small><PasswordInput name="password" autoComplete="new-password" minLength={MIN_PASSWORD} /></label>
              <label className="f">Type it again<PasswordInput name="confirm" autoComplete="new-password" minLength={MIN_PASSWORD} /></label>
              <Submit>Save new password</Submit>
            </ActionForm>
          </>
        ) : (
          <>
            <p className="pgsub">This link has expired or was already used. Reset links work once, for 30 minutes.</p>
            <Link className="btn pri" href="/forgot">Send a new link</Link>
          </>
        )}
      </div>
    </main>
  );
}
