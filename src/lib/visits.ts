import "server-only";
import { createHash } from "node:crypto";

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|vercel|headless|lighthouse|playwright|puppeteer|curl|wget|python|node-fetch|axios/i;

export const isBot = (ua: string) => !ua || BOT.test(ua);

export function deviceOf(ua: string): "mobile" | "tablet" | "desktop" {
  if (/iPad|Tablet|Nexus 7|Nexus 10|SM-T/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "mobile";
  return "desktop";
}

/** Same visitor on the same day gives the same value; nothing ties it to the next day or to an IP. */
export function visitorHash(ip: string, ua: string, day: string): string {
  const salt = createHash("sha256").update(`${process.env.DATABASE_URL ?? ""}|lyncei-visits`).digest("hex");
  return createHash("sha256").update(`${salt}|${day}|${ip}|${ua}`).digest("hex").slice(0, 16);
}

/** Where a visit came from: another site's host name, or the campaign tag in the link (?ref= or utm_source). */
export function sourceOf(pageUrl: URL, referrer: string, ownHost: string): string | null {
  const tag = pageUrl.searchParams.get("ref") || pageUrl.searchParams.get("utm_source");
  if (tag) return `link: ${tag.slice(0, 40)}`;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "").replace(/^(l|lm|m)\.facebook\.com$/, "facebook.com").replace(/^(l\.)?instagram\.com$/, "instagram.com");
    if (!host || host === ownHost.replace(/^www\./, "") || host.endsWith("lyncei.com") || host.endsWith("lyncei.app")) return null;
    return host.slice(0, 80);
  } catch {
    return null;
  }
}

export const cityName = (raw: string | null) => {
  if (!raw) return null;
  try { return decodeURIComponent(raw).slice(0, 80); } catch { return raw.slice(0, 80); }
};
