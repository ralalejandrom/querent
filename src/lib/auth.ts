import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { slugify } from "./text";
import { sendEmail } from "./email";
import { emailHtml } from "./email-layout";
import { adminEmailList, applyGrant, canSignIn } from "./access";
import { burnPasswordCheck, verifyPassword } from "./password";

const SESSION_COOKIE = "querent_session";
const SESSION_DAYS = 30;
const LOGIN_TOKEN_MINUTES = 15;

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
export const appUrl = () => (process.env.SITE_URL ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type Role = (typeof schema.roleEnum.enumValues)[number];
export interface CurrentUser {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  orcidId: string | null;
  field: string;
  roles: Set<Role>;
}

const MAX_LINKS_PER_EMAIL = 5; // per 15-minute window, per purpose

/** One-time email tokens. "login" signs in, "verify" confirms a new account, "reset" sets a new password. */
export type TokenPurpose = "login" | "verify" | "reset";
const TOKEN_MINUTES: Record<TokenPurpose, number> = { login: LOGIN_TOKEN_MINUTES, verify: 24 * 60, reset: 30 };

/** Creates a token, or returns null when this address already asked for too many in the last 15 minutes. */
async function issueEmailToken(email: string, purpose: TokenPurpose): Promise<string | null> {
  const address = email.toLowerCase();
  const since = new Date(Date.now() - 15 * 60_000);
  const [{ n }] = await db.select({ n: count() }).from(schema.loginTokens)
    .where(and(eq(schema.loginTokens.email, address), eq(schema.loginTokens.purpose, purpose), gt(schema.loginTokens.createdAt, since)));
  if (n >= MAX_LINKS_PER_EMAIL) return null;
  const token = newToken();
  await db.insert(schema.loginTokens).values({
    tokenHash: hashToken(token), email: address, purpose,
    expiresAt: new Date(Date.now() + TOKEN_MINUTES[purpose] * 60_000),
  });
  return token;
}

/** The email of an unused, unexpired token (without using it up), or null. */
export async function peekEmailToken(token: string, purpose: TokenPurpose): Promise<string | null> {
  if (!token) return null;
  const [row] = await db.select({ email: schema.loginTokens.email }).from(schema.loginTokens)
    .where(and(eq(schema.loginTokens.tokenHash, hashToken(token)), eq(schema.loginTokens.purpose, purpose), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, new Date())))
    .limit(1);
  return row?.email ?? null;
}

/** Uses up a token and returns its email, or null when it's invalid, used or expired. */
export async function consumeEmailToken(token: string, purpose: TokenPurpose): Promise<string | null> {
  const now = new Date();
  const [row] = await db.update(schema.loginTokens).set({ usedAt: now })
    .where(and(eq(schema.loginTokens.tokenHash, hashToken(token)), eq(schema.loginTokens.purpose, purpose), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, now)))
    .returning({ email: schema.loginTokens.email });
  return row?.email ?? null;
}

const safePath = (next: string) => (next.startsWith("/") && !next.startsWith("//") ? next : "/");

/** Confirmation email for a new account. Silently does nothing past the rate limit. */
export async function sendVerifyEmail(email: string, next = "/"): Promise<void> {
  const token = await issueEmailToken(email, "verify");
  if (!token) return;
  const link = `${appUrl()}/auth/confirm?token=${encodeURIComponent(token)}&next=${encodeURIComponent(safePath(next))}`;
  await sendEmail({
    to: email,
    subject: "Confirm your Lyncei account",
    text: `Welcome to Lyncei. Confirm your email to finish creating your account:\n\n${link}\n\nThe link expires in 24 hours. If you didn't sign up, you can ignore this email.`,
    html: emailHtml({
      heading: "Confirm your email",
      preview: "One step left to finish creating your Lyncei account.",
      paragraphs: ["Welcome to Lyncei. Confirm your email to finish creating your account. The link expires in 24 hours."],
      button: { label: "Confirm my email", href: link },
      footnote: "If you didn't sign up for Lyncei, you can ignore this email and no account will be created.",
    }),
  });
}

/** Password reset email. Silently does nothing past the rate limit. */
export async function sendResetEmail(email: string): Promise<void> {
  const token = await issueEmailToken(email, "reset");
  if (!token) return;
  const link = `${appUrl()}/reset?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: "Reset your Lyncei password",
    text: `Choose a new password for Lyncei:\n\n${link}\n\nThe link works once and expires in 30 minutes. If you didn't ask for this, you can ignore this email; your password stays the same.`,
    html: emailHtml({
      heading: "Reset your password",
      preview: "Choose a new password. The link expires in 30 minutes.",
      paragraphs: ["Use the button below to choose a new password. The link works once and expires in 30 minutes."],
      button: { label: "Choose a new password", href: link },
      footnote: "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
    }),
  });
}

/** Sent when someone signs up with an email that already has an account, instead of revealing that on screen. */
export async function sendAccountExistsEmail(email: string): Promise<void> {
  const token = await issueEmailToken(email, "reset");
  if (!token) return;
  const link = `${appUrl()}/reset?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: "You already have a Lyncei account",
    text: `Someone tried to create a Lyncei account with this email, but you already have one. Sign in at ${appUrl()}/login, or choose a new password here:\n\n${link}\n\nIf it wasn't you, you can ignore this email.`,
    html: emailHtml({
      heading: "You already have an account",
      preview: "Sign in, or choose a new password if you forgot it.",
      paragraphs: ["Someone tried to create a Lyncei account with this email, but you already have one. Sign in as usual, or choose a new password if you forgot it."],
      button: { label: "Choose a new password", href: link },
      footnote: "If it wasn't you, you can ignore this email. Nothing has changed on your account.",
    }),
  });
}

function loginEmailHtml(link: string): string {
  return emailHtml({
    heading: "Your sign-in link",
    preview: `Sign in to Lyncei. The link works once and expires in ${LOGIN_TOKEN_MINUTES} minutes.`,
    paragraphs: [`Use the button below to sign in. It works once and expires in ${LOGIN_TOKEN_MINUTES} minutes.`],
    button: { label: "Sign in to Lyncei", href: link },
    footnote: "If you didn't ask for this email, you can ignore it. Nobody can sign in without the link.",
  });
}

/**
 * Sends a one-time sign-in link. Always succeeds from the caller's view so emails can't be enumerated.
 * Quietly stops sending after MAX_LINKS_PER_EMAIL requests per window for the same address.
 */
export async function sendLoginLink(email: string, next = "/"): Promise<void> {
  const address = email.toLowerCase();
  const token = await issueEmailToken(address, "login");
  if (!token) return;
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const link = `${appUrl()}/auth/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(safeNext)}`;
  await sendEmail({
    to: address,
    subject: "Your Lyncei sign-in link",
    text: `Sign in to Lyncei:\n\n${link}\n\nThis link works once and expires in ${LOGIN_TOKEN_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`,
    html: loginEmailHtml(link),
  });
}

/** Emails listed in ADMIN_EMAILS (comma-separated) get the founding team's roles when they sign in. */
const FOUNDER_ROLES = ["member", "reviewer", "moderator", "integrity_admin", "platform_admin"] as const;
async function grantFounderRoles(userId: string, email: string): Promise<void> {
  if (!adminEmailList().includes(email.toLowerCase())) return;
  const added = await db.insert(schema.userRoles)
    .values(FOUNDER_ROLES.map((role) => ({ userId, role })))
    .onConflictDoNothing()
    .returning({ role: schema.userRoles.role });
  if (added.length) {
    await db.insert(schema.auditEvents).values({ actorId: null, entityType: "user", entityId: userId, action: "role.granted", after: { roles: added.map((a) => a.role), via: "ADMIN_EMAILS" } as never });
  }
}

async function uniqueHandle(base: string): Promise<string> {
  const root = slugify(base, 24).replace(/-/g, "") || "member";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}${i + 1}`;
    const taken = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.handle}) = ${candidate}`).limit(1);
    if (!taken.length) return candidate;
  }
  return `${root}${randomBytes(3).toString("hex")}`;
}

/** Consumes a sign-in token, creating the account on first sign-in. Returns the user or null if invalid. */
export async function consumeLoginToken(token: string): Promise<{ id: string; isNew: boolean; email: string } | null> {
  const now = new Date();
  const [row] = await db
    .update(schema.loginTokens)
    .set({ usedAt: now })
    .where(and(eq(schema.loginTokens.tokenHash, hashToken(token)), eq(schema.loginTokens.purpose, "login"), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, now)))
    .returning();
  if (!row) return null;

  const [existing] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${row.email}`).limit(1);
  if (existing) {
    if (existing.deletedAt) return null;
    if (!existing.emailVerifiedAt) await db.update(schema.users).set({ emailVerifiedAt: now }).where(eq(schema.users.id, existing.id));
    await grantFounderRoles(existing.id, row.email);
    await applyGrant(existing.id, row.email);
    return { id: existing.id, isNew: false, email: row.email };
  }
  if (!(await canSignIn(row.email))) return null; // invite-only mode: only invited emails get a new account
  const id = await createAccount({ email: row.email, verified: true });
  return { id, isNew: true, email: row.email };
}

/** Creates an account with the member role. Verified accounts get founder roles and access grants right away. */
export async function createAccount(input: { email: string; displayName?: string; passwordHash?: string; field?: string; verified: boolean; termsAccepted?: boolean }): Promise<string> {
  const email = input.email.toLowerCase();
  const local = email.split("@")[0] ?? "member";
  const now = new Date();
  const [created] = await db.insert(schema.users).values({
    email, handle: await uniqueHandle(input.displayName || local), displayName: input.displayName || local,
    field: input.field ?? "", emailVerifiedAt: input.verified ? now : null,
    passwordHash: input.passwordHash ?? null, passwordUpdatedAt: input.passwordHash ? now : null,
    termsAcceptedAt: input.termsAccepted ? now : null,
  }).returning({ id: schema.users.id });
  await db.insert(schema.userRoles).values({ userId: created.id, role: "member" }).onConflictDoNothing();
  if (input.verified) await onVerifiedSignIn(created.id, email);
  return created.id;
}

/** Roles that depend on the email: the founding team's, and reviewer access granted from /admin. */
export async function onVerifiedSignIn(userId: string, email: string): Promise<void> {
  await grantFounderRoles(userId, email);
  await applyGrant(userId, email);
}

export const findUserByEmail = async (email: string) =>
  (await db.select().from(schema.users).where(and(sql`lower(${schema.users.email}) = ${email.toLowerCase()}`, isNull(schema.users.deletedAt))).limit(1))[0] ?? null;

export type PasswordSignIn = { ok: true; id: string } | { ok: false; reason: "invalid" | "unverified"; email?: string };

/** Checks an email and password. Takes the same time whether or not the account exists. */
export async function passwordSignIn(email: string, password: string): Promise<PasswordSignIn> {
  const user = await findUserByEmail(email);
  if (!user?.passwordHash) {
    await burnPasswordCheck(password);
    return { ok: false, reason: "invalid" };
  }
  if (!(await verifyPassword(password, user.passwordHash))) return { ok: false, reason: "invalid" };
  if (!user.emailVerifiedAt) return { ok: false, reason: "unverified", email: user.email };
  await onVerifiedSignIn(user.id, user.email);
  return { ok: true, id: user.id };
}

export async function startSession(userId: string): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Signs the account out everywhere except this device (after a password change). */
export async function endOtherSessions(userId: string): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const keep = token ? hashToken(token) : "";
  await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, userId), sql`${schema.sessions.tokenHash} <> ${keep}`));
  await db.delete(schema.deviceTokens).where(and(eq(schema.deviceTokens.userId, userId), sql`coalesce(${schema.deviceTokens.sessionHash}, '') <> ${keep}`));
}

export async function endAllSessions(userId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  await db.delete(schema.deviceTokens).where(eq(schema.deviceTokens.userId, userId));
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
    await db.delete(schema.deviceTokens).where(eq(schema.deviceTokens.sessionHash, hashToken(token))); // this phone stops getting notifications
  }
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: schema.users, role: schema.userRoles.role })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .leftJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
    .where(and(eq(schema.sessions.tokenHash, hashToken(token)), gt(schema.sessions.expiresAt, new Date()), isNull(schema.users.deletedAt)));
  if (!rows.length) return null;
  const u = rows[0].user;
  return {
    id: u.id, handle: u.handle, displayName: u.displayName, email: u.email, orcidId: u.orcidId, field: u.field,
    roles: new Set(rows.map((r) => r.role).filter((r): r is Role => !!r)),
  };
});

export async function requireUser(next = "/"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export const isReviewer = (u: CurrentUser | null) => !!u && (u.roles.has("reviewer") || u.roles.has("integrity_admin"));
export const isModerator = (u: CurrentUser | null) => !!u && (u.roles.has("moderator") || u.roles.has("integrity_admin") || u.roles.has("platform_admin"));
