import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/auth";

export const revalidate = 3600;

/** Pre-launch: only the public teaser is listed. Restore the public sections, posts, questions and profiles at launch. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [{ url: `${appUrl()}/welcome`, changeFrequency: "weekly", priority: 1 }];
}
