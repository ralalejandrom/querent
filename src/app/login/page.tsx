import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ActionForm, Submit } from "@/components/client";
import { Mark } from "@/components/ui";
import { requestLoginAction } from "@/app/actions";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  return (
    <main className="main" id="main">
      <div className="auth">
        <Link className="brand" href="/" style={{ padding: "0 0 24px" }}><Mark />QUERENT</Link>
        <h1 className="pg">Sign in</h1>
        <p className="pgsub">We'll email you a link. No password needed.</p>
        {sp.error && <div className="msg err" style={{ marginBottom: 14 }}>That sign-in link is invalid or has expired. Request a new one.</div>}
        <ActionForm action={requestLoginAction}>
          <input type="hidden" name="next" value={sp.next ?? "/"} />
          <label className="f">Email<input type="email" name="email" autoComplete="email" placeholder="you@university.edu" required /></label>
          <Submit>Email me a sign-in link</Submit>
        </ActionForm>
      </div>
    </main>
  );
}
