"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appUrl, requireUser } from "@/lib/auth";
import { grantAccess } from "@/lib/access";
import { isPlatformAdmin } from "@/lib/admin-data";
import { sendEmail } from "@/lib/email";
import { isExampleEmail } from "@/lib/examples";

const Grant = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  asReviewer: z.boolean(),
  field: z.string().trim().max(120),
});

function inviteEmail(asReviewer: boolean) {
  const link = `${appUrl()}/login`;
  const lead = asReviewer
    ? "You've been approved as a founding reviewer on Lyncei. Your reviewer badge appears on your profile as soon as you sign in."
    : "Your early access to Lyncei is ready.";
  const text = `${lead}\n\nSign in with this email address here (no password needed):\n${link}\n\nLyncei is a social network for science with expert review built in.`;
  const html = `<!doctype html><html><body style="margin:0;background:#F4F6F8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16141F">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #E5E7EB;border-radius:6px;padding:28px">
<tr><td style="font-size:22px;font-weight:600;padding-bottom:14px">Lyncei</td></tr>
<tr><td style="font-size:16px;line-height:1.5;padding-bottom:22px">${lead}</td></tr>
<tr><td style="padding-bottom:22px"><a href="${link}" style="display:inline-block;background:#16141F;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px">Sign in to Lyncei</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#6B6878">Sign in with this same email address. No password needed.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: asReviewer ? "You're a founding reviewer on Lyncei" : "Your Lyncei early access is ready", text, html };
}

/** Founding team only: let an email in (optionally as a verified reviewer) and email them an invitation. */
export async function grantAccessAction(fd: FormData): Promise<void> {
  const admin = await requireUser("/admin");
  if (!isPlatformAdmin(admin)) return;
  const parsed = Grant.safeParse({ email: fd.get("email"), asReviewer: fd.get("asReviewer") === "on" || fd.get("asReviewer") === "1", field: fd.get("field") ?? "" });
  if (!parsed.success || isExampleEmail(parsed.data.email)) return;
  const { email, asReviewer, field } = parsed.data;
  await grantAccess({ email, asReviewer, fields: field ? [field] : [], grantedBy: admin.id });
  const msg = inviteEmail(asReviewer);
  try {
    await sendEmail({ to: email, ...msg });
  } catch (err) {
    console.error("invite email failed", err);
  }
  revalidatePath("/admin");
}
