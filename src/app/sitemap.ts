import type { MetadataRoute } from "next";
import { and, desc, eq, isNull, notLike, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { appUrl } from "@/lib/auth";

export const revalidate = 3600;

/**
 * The pages Google should know about: the product story, the public sections, and every public post,
 * question and profile from real accounts. Fictional example accounts and their posts are left out.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const fixed: MetadataRoute.Sitemap = [
    { url: `${base}/welcome`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/questions`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/reviews`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/guidelines`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/support`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
  try {
    const { posts, users, questions } = schema;
    const real = and(isNull(users.deletedAt), notLike(users.email, "%@example.com"));
    const [postRows, people, qs] = await Promise.all([
      db.select({ id: posts.id, at: posts.updatedAt }).from(posts).innerJoin(users, eq(users.id, posts.authorId))
        .where(and(eq(posts.status, "visible"), real)).orderBy(desc(posts.updatedAt)).limit(5000),
      db.select({ handle: users.handle, at: users.createdAt }).from(users)
        .where(and(real, sql`exists (select 1 from ${posts} p where p.author_id = ${users.id} and p.status = 'visible')`)).limit(5000),
      db.select({ slug: questions.slug, at: questions.updatedAt }).from(questions).where(isNull(questions.mergedInto)).limit(5000),
    ]);
    return [
      ...fixed,
      ...postRows.map((p) => ({ url: `${base}/p/${p.id}`, lastModified: p.at, changeFrequency: "weekly" as const, priority: 0.8 })),
      ...qs.map((q) => ({ url: `${base}/q/${q.slug}`, lastModified: q.at, changeFrequency: "weekly" as const, priority: 0.6 })),
      ...people.map((u) => ({ url: `${base}/u/${u.handle}`, lastModified: u.at, changeFrequency: "weekly" as const, priority: 0.5 })),
    ];
  } catch {
    return fixed;
  }
}
