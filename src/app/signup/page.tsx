import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ActionForm, PasswordInput, Submit } from "@/components/client";
import { signUpAction } from "@/app/auth-actions";
import { MIN_PASSWORD } from "@/lib/password";

export const metadata = { title: "Create your account" };

export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  return (
    <main className="main" id="main">
      <div className="auth">
        <h1 className="pg">Create your account</h1>
        <p className="pgsub">Share research with the evidence attached, and review in the open.</p>
        <ActionForm action={signUpAction} resetOnOk>
          <input type="hidden" name="next" value={sp.next ?? "/"} />
          <label className="f">Name<input type="text" name="name" autoComplete="name" placeholder="Dr. Ana Ruiz" maxLength={80} required /></label>
          <label className="f">Email<input type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" placeholder="you@university.edu" required /></label>
          <label className="f">Password <small>At least {MIN_PASSWORD} characters. A short phrase works well.</small><PasswordInput name="password" autoComplete="new-password" minLength={MIN_PASSWORD} /></label>
          <label className="f">Field <small>Optional. For example: Cardiology · Resident</small><input type="text" name="field" maxLength={120} /></label>
          <label className="check terms">
            <input type="checkbox" name="terms" required />
            <span>I agree to the <Link href="/terms" target="_blank">Terms</Link> and <Link href="/guidelines" target="_blank">community rules</Link>, and I've read the <Link href="/privacy" target="_blank">Privacy policy</Link>. Lyncei has no tolerance for abusive or objectionable content, and I won't post anything that could identify a patient.</span>
          </label>
          <Submit>Create account</Submit>
        </ActionForm>
        <p className="authalt">Already have an account? <Link href="/login">Sign in</Link></p>
        <p className="hint" style={{ marginTop: 18 }}>Anyone can join. Reviewing posts takes a separate approval, so reviews come from people with expertise in the field.</p>
      </div>
    </main>
  );
}
