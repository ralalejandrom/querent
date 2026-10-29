import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { cityName, deviceOf, isBot, sourceOf, visitorHash } from "@/lib/visits";

/**
 * Cookieless visit counter. The page sends its path and referrer; location comes from Vercel's
 * IP lookup headers. No IP address or cookie is stored. The founding team's own visits aren't counted.
 */
const recent = new Map<string, number[]>();
const throttled = (ip: string) => {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > 60;
};

export async function POST(req: Request) {
  const done = () => new Response(null, { status: 204 });
  const host = req.headers.get("host") ?? "";
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== host) return done();
  const ua = req.headers.get("user-agent") ?? "";
  if (isBot(ua)) return done();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!ip || throttled(ip)) return done();

  let body: { p?: unknown; r?: unknown };
  try { body = JSON.parse(await req.text()); } catch { return done(); }
  const p = typeof body.p === "string" ? body.p : "";
  if (!p.startsWith("/") || p.startsWith("//") || p.startsWith("/api/") || p.startsWith("/_next/")) return done();
  const pageUrl = new URL(p, "https://lyncei.com");

  const viewer = await getCurrentUser();
  if (viewer?.roles.has("platform_admin")) return done();

  const day = new Date().toISOString().slice(0, 10);
  await db.insert(schema.pageViews).values({
    path: pageUrl.pathname.slice(0, 200),
    referrerHost: sourceOf(pageUrl, typeof body.r === "string" ? body.r : "", host),
    country: req.headers.get("x-vercel-ip-country")?.slice(0, 2) ?? null,
    region: req.headers.get("x-vercel-ip-country-region")?.slice(0, 10) ?? null,
    city: cityName(req.headers.get("x-vercel-ip-city")),
    device: deviceOf(ua),
    visitor: visitorHash(ip, ua, day),
  }).catch((err) => console.error("visit insert failed", err));
  return done();
}
