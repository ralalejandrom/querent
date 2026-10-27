import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { appUrl, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const back = (s: string) => NextResponse.redirect(new URL(`/settings?orcid=${s}`, appUrl()));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings", appUrl()));
  const jar = await cookies();
  const state = jar.get("orcid_state")?.value;
  jar.delete("orcid_state");
  const code = req.nextUrl.searchParams.get("code");
  if (!code || !state || state !== req.nextUrl.searchParams.get("state")) return back("error");

  const res = await fetch(`${process.env.ORCID_BASE_URL ?? "https://orcid.org"}/oauth/token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.ORCID_CLIENT_ID ?? "", client_secret: process.env.ORCID_CLIENT_SECRET ?? "",
      grant_type: "authorization_code", code, redirect_uri: `${appUrl()}/auth/orcid/callback`,
    }),
  }).catch(() => null);
  if (!res?.ok) return back("error");
  const data = (await res.json()) as { orcid?: string };
  if (!data.orcid || !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(data.orcid)) return back("error");

  const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.orcidId, data.orcid)).limit(1);
  if (taken && taken.id !== user.id) return back("taken");
  await db.update(schema.users).set({ orcidId: data.orcid }).where(eq(schema.users.id, user.id));
  await audit(db, { actorId: user.id, entityType: "user", entityId: user.id, action: "orcid.linked", after: { orcid: data.orcid } });
  return back("linked");
}
