import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser, hashToken } from "@/lib/auth";

/**
 * The iOS app registers its APNs device token here after the person allows notifications (POST),
 * and removes it when they sign out (DELETE). The session cookie identifies the account.
 */
const tokenOk = (t: unknown): t is string => typeof t === "string" && /^[0-9a-fA-F]{32,200}$/.test(t);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!tokenOk(body.token)) return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  const session = (await cookies()).get("querent_session")?.value;
  const sessionHash = session ? hashToken(session) : null;
  await db.insert(schema.deviceTokens).values({ token: body.token, userId: user.id, platform: "ios", sessionHash })
    .onConflictDoUpdate({ target: schema.deviceTokens.token, set: { userId: user.id, sessionHash, lastSeenAt: new Date() } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  if (!user || !tokenOk(body.token)) return NextResponse.json({ ok: true });
  await db.delete(schema.deviceTokens).where(and(eq(schema.deviceTokens.token, body.token), eq(schema.deviceTokens.userId, user.id)));
  return NextResponse.json({ ok: true });
}
