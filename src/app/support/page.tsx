import Link from "next/link";
import { ActionForm, Submit } from "@/components/client";
import { supportAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Support", description: "Contact the Lyncei team about your account, a report, privacy or a bug." };

export default async function Support() {
  const user = await getCurrentUser();
  return (
    <main className="main" id="main" style={{ maxWidth: 640 }}>
      <h1 className="pg">Support</h1>
      <p className="pgsub">Write to the Lyncei team. We read every message and reply by email, usually within 2 business days. Reports about posts or comments are reviewed within 24 hours.</p>
      <ActionForm action={supportAction} resetOnOk>
        <label className="f">Your email<input type="email" name="email" autoComplete="email" defaultValue={user?.email ?? ""} required /></label>
        <label className="f">About
          <select name="topic" defaultValue="account">
            <option value="account">My account or signing in</option>
            <option value="report">Reporting a post, comment or person</option>
            <option value="privacy">Privacy or my data</option>
            <option value="bug">Something isn't working</option>
            <option value="other">Something else</option>
          </select>
        </label>
        <label className="f">Message<textarea name="message" rows={6} required /></label>
        <input type="text" name="website" className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <Submit>Send message</Submit>
      </ActionForm>
      <div className="sec"><h2>Quick answers</h2></div>
      <ul className="faq">
        <li><b>Forgot your password?</b> <Link href="/forgot">Reset it here</Link>.</li>
        <li><b>Delete your account:</b> Settings → Delete account. It takes effect right away.</li>
        <li><b>Block someone:</b> open their profile and choose ··· then Block.</li>
        <li><b>Report a post or comment:</b> use “Report” on the post or under the comment.</li>
        <li><b>Become a reviewer:</b> <a href="/welcome#apply">apply as a reviewer</a>.</li>
      </ul>
    </main>
  );
}
