/**
 * Shared look for every email Lyncei sends: the Lyncei logo, DM Sans (Lyncei's typeface) where the
 * mail app supports web fonts, with a close system fallback where it doesn't (Gmail), and the brand colors.
 */
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = `'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const site = () => (process.env.SITE_URL ?? process.env.APP_URL ?? "https://lyncei.com").replace(/\/$/, "");

export interface EmailContent {
  heading: string;
  /** Plain-text paragraphs; escaped here. */
  paragraphs: string[];
  button?: { label: string; href: string };
  /** Small print under the button. */
  footnote?: string;
  /** Hidden preview line shown in the inbox list. */
  preview?: string;
}

export function emailHtml(c: EmailContent): string {
  const base = site();
  const p = c.paragraphs.map((t) => `<tr><td style="font-family:${FONT};font-size:15px;line-height:1.6;color:#374151;padding:0 0 14px">${esc(t)}</td></tr>`).join("");
  const button = c.button
    ? `<tr><td style="padding:8px 0 22px"><a href="${esc(c.button.href)}" style="display:inline-block;background:#16141F;color:#ffffff;text-decoration:none;font-family:${FONT};font-weight:600;font-size:15px;line-height:1;padding:14px 24px;border-radius:999px">${esc(c.button.label)}</a></td></tr>`
    : "";
  const foot = c.footnote ? `<tr><td style="font-family:${FONT};font-size:13px;line-height:1.5;color:#6B7280;padding:0">${esc(c.footnote)}</td></tr>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<title>${esc(c.heading)}</title></head>
<body style="margin:0;padding:0;background:#F4F6F8">
${c.preview ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preview)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px">
<tr><td style="padding:0 4px 18px"><a href="${base}" style="text-decoration:none"><img src="${base}/email/lyncei-logo.png" width="137" height="36" alt="Lyncei" style="display:block;border:0;width:137px;height:36px"></a></td></tr>
<tr><td style="background:#ffffff;border:1px solid #E5E7EB;border-radius:8px;padding:30px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font-family:${FONT};font-size:24px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:#16141F;padding:0 0 14px">${esc(c.heading)}</td></tr>
${p}${button}${foot}
</table></td></tr>
<tr><td style="font-family:${FONT};font-size:12px;line-height:1.5;color:#6B7280;padding:16px 4px 0">Lyncei · the social network for science, with expert review built in · <a href="${base}" style="color:#6B7280">lyncei.com</a></td></tr>
</table></td></tr></table></body></html>`;
}
