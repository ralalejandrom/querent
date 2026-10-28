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
  return (
    <main className="main" id="main">
      <div className="auth">
        <Link className="brand" href="/" style={{ padding: "0 0 24px" }}><Mark /><span className="word">Lyncei</span></Link>
        <h1 className="pg">Sign in</h1>
        <p className="pgsub">We'll email you a link. No password needed.</p>
        {sp.error && <div className="msg err" style={{ marginBottom: 14 }}>That sign-in link is invalid or has expired. Request a new one.</div>}
        <ActionForm action={requestLoginAction}>
          <input type="hidden" name="next" value={sp.next ?? "/"} />
          <label className="f">Email<input type="email" name="email" autoComplete="email" placeholder="you@university.edu" required /></label>
          <Submit>Email me a sign-in link</Submit>
        </ActionForm>
        {process.env.DEMO_ACCOUNTS === "1" && (
          <div className="box" style={{ marginTop: 24 }}>
            <h3>Try a demo account</h3>
            <p className="hint" style={{ marginTop: 0 }}>Fictional people with sample data. Anyone can use these, so don't post anything private.</p>
            <div className="checks">
              {[["admin", "Moderator + reviewer", "Lyncei Admin"], ["emilycarter", "Verified reviewer", "Dr. Emily Carter"], ["sofiamendes", "Member · PhD student", "Sofia Mendes"]].map(([h, role, name]) => (
                <form key={h} action={demoLoginAction.bind(null, h)}><button className="btn" style={{ width: "100%", justifyContent: "space-between" }}><span>{name}</span><span className="hint">{role}</span></button></form>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
