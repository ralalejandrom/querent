import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ActionForm, Submit } from "@/components/client";
import { Mark } from "@/components/ui";
import { demoLoginAction, requestLoginAction } from "@/app/actions";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  /* Without an email provider in production, sign-in links can't be delivered: point people to the waitlist instead of a form that fails. */
  const emailReady = !!process.env.RESEND_API_KEY || process.env.NODE_ENV !== "production";
  return (
    <main className="main" id="main">
      <div className="auth">
        <Link className="brand" href="/" style={{ padding: "0 0 24px" }}><Mark /><span className="word">Lyncei</span></Link>
        <h1 className="pg">Sign in</h1>
        {emailReady ? (
          <>
            <p className="pgsub">We'll email you a link. No password needed.</p>
            {sp.error && <div className="msg err" style={{ marginBottom: 14 }}>That sign-in link is invalid or has expired. Request a new one.</div>}
            <ActionForm action={requestLoginAction}>
              <input type="hidden" name="next" value={sp.next ?? "/"} />
              <label className="f">Email<input type="email" name="email" autoComplete="email" placeholder="you@university.edu" required /></label>
              <Submit>Email me a sign-in link</Submit>
            </ActionForm>
          </>
        ) : (
          <>
            <p className="pgsub">Accounts are opening gradually. Ask for early access and we'll email you as soon as you can sign in.</p>
            <Link className="btn pri" href="/welcome#join">Get early access</Link>
          </>
        )}
        {process.env.DEMO_LOGIN === "1" && (
          <div className="box" style={{ marginTop: 24 }}>
            <h3>Try a demo account</h3>
            <p className="hint" style={{ marginTop: 0 }}>Fictional people with sample data. Anyone can use these, so don't post anything private.</p>
            <div className="checks">
              {[["michaelbrennan", "Verified reviewer", "Dr. Michael Brennan"], ["emilycarter", "Verified reviewer", "Dr. Emily Carter"], ["sofiamendes", "Member · PhD student", "Sofia Mendes"]].map(([h, role, name]) => (
                <form key={h} action={demoLoginAction.bind(null, h)}><button className="btn" style={{ width: "100%", justifyContent: "space-between" }}><span>{name}</span><span className="hint">{role}</span></button></form>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
