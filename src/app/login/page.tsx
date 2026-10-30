import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ActionForm, PasswordInput, Submit } from "@/components/client";
import { demoLoginAction, requestLoginAction } from "@/app/actions";
import { passwordLoginAction } from "@/app/auth-actions";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  invalid: "That sign-in link is invalid or has expired. Sign in with your password, or request a new link.",
  confirm: "That confirmation link is invalid or has expired. Sign in to get a new one.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  const next = sp.next ?? "/";
  return (
    <main className="main" id="main">
      <div className="auth">
        <h1 className="pg">Sign in</h1>
        <p className="pgsub">Welcome back to Lyncei.</p>
        {sp.error && ERRORS[sp.error] && <div className="msg err" style={{ marginBottom: 14 }}>{ERRORS[sp.error]}</div>}
        <ActionForm action={passwordLoginAction}>
          <input type="hidden" name="next" value={next} />
          <label className="f">Email<input type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" placeholder="you@university.edu" required /></label>
          <label className="f"><span className="frow">Password<Link href="/forgot" className="flink">Forgot password?</Link></span><PasswordInput name="password" autoComplete="current-password" /></label>
          <Submit>Sign in</Submit>
        </ActionForm>
        <p className="authalt">New to Lyncei? <Link href={next !== "/" ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>Create an account</Link></p>
        <details className="authmore">
          <summary>Sign in with an email link instead</summary>
          <ActionForm action={requestLoginAction}>
            <input type="hidden" name="next" value={next} />
            <label className="f">Email<input type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" placeholder="you@university.edu" required /></label>
            <Submit>Email me a sign-in link</Submit>
          </ActionForm>
        </details>
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
