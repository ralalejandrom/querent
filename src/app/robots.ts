import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/auth";

/** What search engines may crawl. Pre-launch, app pages carry noindex (root layout), so only the teaser at /welcome is indexed; they stay crawlable so engines can see the noindex and drop old entries. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/moderation", "/settings", "/messages", "/notifications", "/library", "/new", "/auth/", "/reset", "/forgot", "/start"],
    }],
    sitemap: `${appUrl()}/sitemap.xml`,
    host: appUrl(),
  };
}
