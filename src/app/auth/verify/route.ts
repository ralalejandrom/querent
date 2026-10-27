import { NextResponse, type NextRequest } from "next/server";
import { consumeLoginToken, startSession, appUrl } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const userId = token ? await consumeLoginToken(token) : null;
  if (!userId) return NextResponse.redirect(new URL("/login?error=invalid", appUrl()));
  await startSession(userId);
  return NextResponse.redirect(new URL(safeNext, appUrl()));
}
