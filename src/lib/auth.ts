import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { slugify } from "./text";
import { sendEmail } from "./email";

const SESSION_COOKIE = "querent_session";
const SESSION_DAYS = 30;
const LOGIN_TOKEN_MINUTES = 15;

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

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

/** Sends a one-time sign-in link. Always succeeds from the caller's view so emails can't be enumerated. */
export async function sendLoginLink(email: string, next = "/"): Promise<void> {
  const token = newToken();
  await db.insert(schema.loginTokens).values({
    tokenHash: hashToken(token),
    email: email.toLowerCase(),
    expiresAt: new Date(Date.now() + LOGIN_TOKEN_MINUTES * 60_000),
  });
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const link = `${appUrl()}/auth/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(safeNext)}`;
  await sendEmail({
    to: email,
    subject: "Your Lyncei sign-in link",
    text: `Sign in to Lyncei:\n\n${link}\n\nThis link expires in ${LOGIN_TOKEN_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`,
  });
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

/** Consumes a sign-in token, creating the account on first sign-in. Returns the user id or null if invalid. */
export async function consumeLoginToken(token: string): Promise<string | null> {
  const now = new Date();
  const [row] = await db
    .update(schema.loginTokens)
    .set({ usedAt: now })
    .where(and(eq(schema.loginTokens.tokenHash, hashToken(token)), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, now)))
    .returning();
  if (!row) return null;

  const [existing] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${row.email}`).limit(1);
  if (existing) {
    if (!existing.emailVerifiedAt) await db.update(schema.users).set({ emailVerifiedAt: now }).where(eq(schema.users.id, existing.id));
    return existing.id;
  }
  const local = row.email.split("@")[0] ?? "member";
  const [created] = await db
    .insert(schema.users)
    .values({ email: row.email, handle: await uniqueHandle(local), displayName: local, emailVerifiedAt: now })
    .returning({ id: schema.users.id });
  await db.insert(schema.userRoles).values({ userId: created.id, role: "member" });
  return created.id;
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
