import Link from "next/link";
import { isExampleEmail, showExamples } from "@/lib/examples";
import type { ReactNode } from "react";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Avatar, Name } from "./ui";
import { compact } from "@/lib/text";

export async function Rail({ children }: { children?: ReactNode }) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [trending, reviewers] = await Promise.all([
    db.select({
      slug: schema.questions.slug, text: schema.questions.text,
      n: sql<number>`(select count(*) from ${schema.follows} f where f.target_type = 'question' and f.target_id = ${schema.questions.id}::text)`.mapWith(Number),
    }).from(schema.questions).orderBy(desc(sql`3`)).limit(3),
    db.select({ handle: schema.users.handle, name: schema.users.displayName, field: schema.users.field, email: schema.users.email, n: count() })
      .from(schema.reviews).innerJoin(schema.users, eq(schema.users.id, schema.reviews.reviewerId))
      .where(and(eq(schema.reviews.status, "completed"), eq(schema.reviews.isSigned, true), gt(schema.reviews.completedAt, since)))
      .groupBy(schema.users.handle, schema.users.displayName, schema.users.field, schema.users.email).orderBy(desc(count())).limit(8)
      .then((rows) => rows.filter((r) => showExamples() || !isExampleEmail(r.email)).slice(0, 4)),
  ]);
  return (
    <aside className="rail" aria-label="Context">
      {children}
      {trending.length > 0 && (
        <div className="box"><h3>Trending questions</h3>
          {trending.map((q) => <div className="li" key={q.slug}><Link href={`/q/${q.slug}`}>{q.text}<small>{compact(q.n)} following</small></Link></div>)}
        </div>
      )}
      {reviewers.length > 0 && (
        <div className="box"><h3>Top reviewers this month</h3>
          {reviewers.map((r) => (
            <div className="li" key={r.handle}><Avatar name={r.name} handle={r.handle} size="sm" /><div><Link href={`/u/${r.handle}`}><Name name={r.name} verified /></Link><small>{r.field}{isExampleEmail(r.email) ? " · Example" : ""}</small></div><span className="x muted">{Number(r.n)} review{Number(r.n) > 1 ? "s" : ""}</span></div>
          ))}
        </div>
      )}
      <div className="box"><h3>Reach and rigor</h3>
        <div className="checks" style={{ gap: 6 }}>
          {[["unreviewed", "Unreviewed"], ["source_linked", "Source-linked"], ["source_checked", "Source-checked"], ["expert_reviewed", "Expert-reviewed"], ["disputed", "Disputed"]].map(([k, l]) => (
            <span key={k}><span className={`state rigor-${k}`}><i />{l}</span></span>
          ))}
          <p className="hint" style={{ margin: "4px 0 0" }}>Likes and shares show reach. Only reviews and documented corrections change these labels.</p>
        </div>
      </div>
    </aside>
  );
}
