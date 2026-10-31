import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/auth";

/** What search engines may crawl: the public product story, posts, questions, reviews and profiles; nothing private. */
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
