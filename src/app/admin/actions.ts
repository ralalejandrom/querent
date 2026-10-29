"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appUrl, requireUser } from "@/lib/auth";
import { grantAccess } from "@/lib/access";
import { isPlatformAdmin } from "@/lib/admin-data";
import { sendEmail } from "@/lib/email";
import { emailHtml } from "@/lib/email-layout";
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
  const html = emailHtml({
    heading: asReviewer ? "Welcome, founding reviewer" : "Your early access is ready",
    preview: lead,
    paragraphs: [lead, "Sign in with this email address. No password needed."],
    button: { label: "Sign in to Lyncei", href: link },
    footnote: "Lyncei is a social network for science with expert review built in.",
  });
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
