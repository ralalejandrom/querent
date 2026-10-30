import Link from "next/link";
import { ActionForm, Submit } from "@/components/client";
import { forgotPasswordAction } from "@/app/auth-actions";

export const metadata = { title: "Reset your password" };

export default function Forgot() {
  return (
    <main className="main" id="main">
      <div className="auth">
        <h1 className="pg">Reset your password</h1>
        <p className="pgsub">Enter the email you use for Lyncei and we'll send you a link to choose a new password.</p>
        <ActionForm action={forgotPasswordAction}>
          <label className="f">Email<input type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" placeholder="you@university.edu" required /></label>
          <Submit>Send reset link</Submit>
        </ActionForm>
        <p className="authalt"><Link href="/login">Back to sign in</Link></p>
      </div>
    </main>
  );
}
