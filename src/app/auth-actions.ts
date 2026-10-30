"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import {
  consumeEmailToken, createAccount, endAllSessions, endOtherSessions, findUserByEmail, onVerifiedSignIn,
  passwordSignIn, peekEmailToken, requireUser, sendAccountExistsEmail, sendResetEmail, sendVerifyEmail, startSession,
} from "@/lib/auth";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { attemptsSince, clearAttempts, clientIp, LIMITS, recordAttempt } from "@/lib/ratelimit";
import { canSignIn } from "@/lib/access";
import { isExampleEmail } from "@/lib/examples";
import { notifyAdmins } from "@/lib/notify";
import { audit } from "@/lib/audit";
import type { ActionState } from "./actions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const raw = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const safeNext = (next: string) => (next.startsWith("/") && !next.startsWith("//") ? next : "/");
const emailReady = () => !!process.env.RESEND_API_KEY || process.env.NODE_ENV !== "production";

/* ---------------------------------------------------------------- sign in */
export async function passwordLoginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = z.string().email().max(254).safeParse(str(fd, "email"));
  const password = raw(fd, "password");
  if (!email.success || !password) return { error: "Enter your email and password." };
  const address = email.data.toLowerCase();
  const ip = await clientIp();
  if ((await attemptsSince("login_fail_email", address, LIMITS.loginFailEmail.minutes)) >= LIMITS.loginFailEmail.max
    || (await attemptsSince("login_fail_ip", ip, LIMITS.loginFailIp.minutes)) >= LIMITS.loginFailIp.max) {
    return { error: "Too many attempts. Wait 15 minutes, or reset your password." };
  }
  const result = await passwordSignIn(address, password);
  if (!result.ok) {
    if (result.reason === "unverified") {
      try { await sendVerifyEmail(address, safeNext(str(fd, "next"))); } catch { /* the message below still applies */ }
      return { error: "Confirm your email first. We just sent you a new confirmation link." };
    }
    await recordAttempt("login_fail_email", address);
    await recordAttempt("login_fail_ip", ip);
    return { error: "That email and password don't match. Try again, or reset your password." };
  }
  await clearAttempts("login_fail_email", address);
  await startSession(result.id);
  redirect(safeNext(str(fd, "next")));
}

/* ---------------------------------------------------------------- sign up */
const signUpSchema = z.object({
  name: z.string().trim().min(2, "Add your name (at least 2 characters).").max(80, "Keep your name under 80 characters."),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  field: z.string().trim().max(120),
});

export async function signUpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({ name: str(fd, "name"), email: str(fd, "email"), field: str(fd, "field") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const address = parsed.data.email.toLowerCase();
  const password = raw(fd, "password");
  const problem = passwordProblem(password, address);
  if (problem) return { error: problem };
  if (fd.get("terms") !== "on") return { error: "To create an account, agree to the Terms and the community rules." };
  if (isExampleEmail(address)) return { error: "Use your own email address." };
  if (!emailReady()) return { error: "Sign-up isn't available right now. Try again soon." };

  const ip = await clientIp();
  if ((await attemptsSince("signup_ip", ip, LIMITS.signupIp.minutes)) >= LIMITS.signupIp.max) {
    return { error: "Too many sign-ups from this network. Try again in an hour." };
  }
  await recordAttempt("signup_ip", ip);

  if (!(await canSignIn(address))) {
    const added = await db.insert(schema.waitlist).values({ email: address, interest: "individual" }).onConflictDoNothing().returning({ id: schema.waitlist.id });
    if (added.length) notifyAdmins(`Lyncei: new waitlist sign-up (${address})`, [`Email: ${address}`, "Tried to sign up while Lyncei is invite-only."]);
    return { ok: "Lyncei is invite-only right now. You're on the list, and we'll email you when your account is ready." };
  }

  // The reply is the same whether or not the email already has an account, so the form can't reveal who's on Lyncei.
  try {
    const existing = await findUserByEmail(address);
    if (existing?.emailVerifiedAt) {
      await sendAccountExistsEmail(address);
    } else if (existing) {
      // Never confirmed: whoever confirms the email owns the account, so the newest details win.
      await db.update(schema.users).set({
        displayName: parsed.data.name, field: parsed.data.field || existing.field,
        passwordHash: await hashPassword(password), passwordUpdatedAt: new Date(), termsAcceptedAt: new Date(),
      }).where(eq(schema.users.id, existing.id));
      await sendVerifyEmail(address);
    } else {
      await createAccount({ email: address, displayName: parsed.data.name, field: parsed.data.field, passwordHash: await hashPassword(password), verified: false, termsAccepted: true });
      await sendVerifyEmail(address);
    }
  } catch {
    return { error: "We couldn't send the confirmation email right now. Try again in a minute." };
  }
  return { ok: `Almost done. We sent a confirmation link to ${address}. Open it to finish creating your account (check spam if you don't see it).` };
}

/** Second step of sign-up: runs only when the person clicks "Confirm" on /auth/confirm. */
export async function confirmEmailAction(fd: FormData) {
  const email = await consumeEmailToken(str(fd, "token"), "verify");
  const user = email ? await findUserByEmail(email) : null;
  if (!user) redirect("/login?error=confirm");
  const isNew = !user.emailVerifiedAt;
  if (isNew) await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, user.id));
  await onVerifiedSignIn(user.id, user.email);
  await startSession(user.id);
  if (isNew) notifyAdmins(`Lyncei: new account (${user.email})`, [`Email: ${user.email}`, `Name: ${user.displayName}`, user.field ? `Field: ${user.field}` : "Field: not given", "Confirmed their email."]);
  redirect(isNew ? "/settings?welcome=1" : safeNext(str(fd, "next")));
}

/* ------------------------------------------------------- forgot / reset */
export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = z.string().email().max(254).safeParse(str(fd, "email"));
  if (!email.success) return { error: "Enter a valid email address." };
  if (!emailReady()) return { error: "Password reset isn't available right now. Try again soon." };
  const ip = await clientIp();
  if ((await attemptsSince("reset_ip", ip, LIMITS.resetIp.minutes)) >= LIMITS.resetIp.max) {
    return { error: "Too many requests from this network. Try again in an hour." };
  }
  await recordAttempt("reset_ip", ip);
  const user = await findUserByEmail(email.data);
  if (user) {
    try { await sendResetEmail(user.email); } catch { return { error: "We couldn't send the email right now. Try again in a minute." }; }
  }
  return { ok: "If an account uses this email, we sent a link to choose a new password. It expires in 30 minutes (check spam if you don't see it)." };
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const token = str(fd, "token");
  const password = raw(fd, "password");
  const email = await peekEmailToken(token, "reset");
  if (!email) return { error: "This link has expired or was already used. Ask for a new one." };
  const problem = passwordProblem(password, email);
  if (problem) return { error: problem };
  if (password !== raw(fd, "confirm")) return { error: "The two passwords don't match." };
  if (!(await consumeEmailToken(token, "reset"))) return { error: "This link has expired or was already used. Ask for a new one." };
  const user = await findUserByEmail(email);
  if (!user) return { error: "This link has expired or was already used. Ask for a new one." };
  const now = new Date();
  await db.update(schema.users).set({ passwordHash: await hashPassword(password), passwordUpdatedAt: now, emailVerifiedAt: user.emailVerifiedAt ?? now }).where(eq(schema.users.id, user.id));
  await db.transaction((tx) => audit(tx, { actorId: user.id, entityType: "user", entityId: user.id, action: "password.reset" }));
  await endAllSessions(user.id); // anyone signed in with the old password is signed out
  await clearAttempts("login_fail_email", email);
  await onVerifiedSignIn(user.id, user.email);
  await startSession(user.id);
  redirect("/settings?password=reset");
}

/* --------------------------------------------------------------- settings */
export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser("/settings");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, me.id));
  const next = raw(fd, "password");
  if (u.passwordHash && !(await verifyPassword(raw(fd, "current"), u.passwordHash))) return { error: "Your current password isn't right." };
  const problem = passwordProblem(next, u.email);
  if (problem) return { error: problem };
  if (next !== raw(fd, "confirm")) return { error: "The two new passwords don't match." };
  await db.update(schema.users).set({ passwordHash: await hashPassword(next), passwordUpdatedAt: new Date() }).where(eq(schema.users.id, u.id));
  await db.transaction((tx) => audit(tx, { actorId: u.id, entityType: "user", entityId: u.id, action: u.passwordHash ? "password.changed" : "password.set" }));
  await endOtherSessions(u.id);
  return { ok: u.passwordHash ? "Password changed. Your other devices were signed out." : "Password set. You can now sign in with your email and password." };
}
