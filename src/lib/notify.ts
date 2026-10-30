import "server-only";
import { after } from "next/server";
import { sendEmail } from "./email";
import { emailHtml } from "./email-layout";

/** Addresses in ADMIN_EMAILS (comma-separated): the founding team. */
export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").slice(0, 160);
const line = (s: string) => s.replace(/[\r\n]+/g, " ").slice(0, 4000);

/**
 * Emails the founding team about a new sign-up. Runs after the response is sent,
 * so it never slows down or breaks the visitor's request.
 */
export function notifyAdmins(subject: string, lines: string[]) {
  const to = adminEmails();
  if (!to.length || !process.env.RESEND_API_KEY) return;
  const site = (process.env.SITE_URL ?? process.env.APP_URL ?? "https://lyncei.com").replace(/\/$/, "");
  const text = [...lines.map(line), "", `See all sign-ups: ${site}/admin`].join("\n");
  const html = emailHtml({ heading: oneLine(subject).replace(/^Lyncei:\s*/, ""), paragraphs: lines.map(line), button: { label: "See all sign-ups", href: `${site}/admin` } });
  after(async () => {
    for (const addr of to) {
      try {
        await sendEmail({ to: addr, subject: oneLine(subject), text, html });
      } catch (err) {
        console.error("admin notification failed", err);
      }
    }
  });
}
