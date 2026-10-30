import { NextResponse } from "next/server";

/**
 * apple-app-site-association (served at /.well-known/apple-app-site-association by a rewrite):
 * lets lyncei.com links in Mail and Messages, such as sign-in and password reset links, open in
 * the Lyncei app when it's installed. Needs APPLE_TEAM_ID (from the Apple Developer account).
 */
export function GET() {
  const team = process.env.APPLE_TEAM_ID;
  const bundle = process.env.APNS_BUNDLE_ID || "com.lyncei.app";
  if (!team) return NextResponse.json({ error: "not_configured" }, { status: 404 });
  return NextResponse.json({
    applinks: { details: [{ appIDs: [`${team}.${bundle}`], components: [{ "/": "/welcome*", exclude: true, comment: "The marketing page stays on the web" }, { "/": "*" }] }] },
    webcredentials: { apps: [`${team}.${bundle}`] },
  }, { headers: { "cache-control": "public, max-age=3600" } });
}
