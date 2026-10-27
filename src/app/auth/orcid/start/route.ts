import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { appUrl, getCurrentUser } from "@/lib/auth";

/** Starts ORCID OAuth with the /authenticate scope: proves iD ownership only. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings", appUrl()));
  const clientId = process.env.ORCID_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL("/settings?orcid=error", appUrl()));
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("orcid_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  const url = new URL(`${process.env.ORCID_BASE_URL ?? "https://orcid.org"}/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "/authenticate");
  url.searchParams.set("redirect_uri", `${appUrl()}/auth/orcid/callback`);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
