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

const MAX_LINKS_PER_EMAIL = 5; // per LOGIN_TOKEN_MINUTES window

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  const since = new Date(Date.now() - LOGIN_TOKEN_MINUTES * 60_000);
  const [{ n }] = await db.select({ n: count() }).from(schema.loginTokens)
    .where(and(eq(schema.loginTokens.email, address), gt(schema.loginTokens.createdAt, since)));
  if (n >= MAX_LINKS_PER_EMAIL) return;

  const token = newToken();
  await db.insert(schema.loginTokens).values({
    tokenHash: hashToken(token),
    email: address,
    expiresAt: new Date(Date.now() + LOGIN_TOKEN_MINUTES * 60_000),
  });
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
    .where(and(eq(schema.loginTokens.tokenHash, hashToken(token)), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, now)))
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
  if (!(await canSignIn(row.email))) return null; // early access: only invited emails get a new account
  const local = row.email.split("@")[0] ?? "member";
  const [created] = await db
    .insert(schema.users)
    .values({ email: row.email, handle: await uniqueHandle(local), displayName: local, emailVerifiedAt: now })
    .returning({ id: schema.users.id });
  await db.insert(schema.userRoles).values({ userId: created.id, role: "member" }).onConflictDoNothing();
  await grantFounderRoles(created.id, row.email);
  await applyGrant(created.id, row.email);
  return { id: created.id, isNew: true, email: row.email };
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

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
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
