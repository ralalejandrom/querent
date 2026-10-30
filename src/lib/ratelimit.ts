import "server-only";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@/db";

/**
 * Database-backed rate limits for sign-in, sign-up and password reset. Works across serverless
 * instances, unlike an in-memory counter.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export async function attemptsSince(kind: string, key: string, minutes: number): Promise<number> {
  const since = new Date(Date.now() - minutes * 60_000);
  const [{ n }] = await db.select({ n: count() }).from(schema.authAttempts)
    .where(and(eq(schema.authAttempts.kind, kind), eq(schema.authAttempts.key, key.toLowerCase()), gt(schema.authAttempts.createdAt, since)));
  return Number(n);
}

export async function recordAttempt(kind: string, key: string): Promise<void> {
  await db.insert(schema.authAttempts).values({ kind, key: key.toLowerCase() });
  // Keep the table small: anything older than a day is no longer used by any limit.
  if (Math.random() < 0.05) await db.delete(schema.authAttempts).where(lt(schema.authAttempts.createdAt, new Date(Date.now() - 86_400_000)));
}

export async function clearAttempts(kind: string, key: string): Promise<void> {
  await db.delete(schema.authAttempts).where(and(eq(schema.authAttempts.kind, kind), eq(schema.authAttempts.key, key.toLowerCase())));
}

/** Limits, per window in minutes. */
export const LIMITS = {
  loginFailEmail: { max: 8, minutes: 15 },
  loginFailIp: { max: 30, minutes: 15 },
  signupIp: { max: 6, minutes: 60 },
  resetIp: { max: 10, minutes: 60 },
} as const;
