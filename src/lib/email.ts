import "server-only";

/**
 * Sends an email through Resend when RESEND_API_KEY is set.
 * Without a key (local development) the message is printed to the server console.
 */
export async function sendEmail(msg: { to: string; subject: string; text: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`\n[email:dev] To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Lyncei <hello@example.com>", to: [msg.to], subject: msg.subject, text: msg.text }),
  });
  if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
}
