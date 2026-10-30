import "server-only";
import { count, desc, eq, isNotNull, not, like, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "./auth";

/** The admin panel is for the founding team: users holding the platform_admin role (granted via ADMIN_EMAILS). */
export const isPlatformAdmin = (u: CurrentUser | null) => !!u && u.roles.has("platform_admin");

export const STAGE_LABELS: Record<string, string> = {
  faculty: "Faculty / PI", clinician: "Clinician", postdoc: "Postdoc / fellow",
  phd_student: "PhD student", industry: "Industry", other: "Other",
};

export async function loadSignups() {
  const [reviewers, waitlist, users, grants, coRows] = await Promise.all([
    db.select().from(schema.reviewerApplications).orderBy(desc(schema.reviewerApplications.createdAt)).limit(1000),
    db.select().from(schema.waitlist).orderBy(desc(schema.waitlist.createdAt)).limit(5000),
    db.select({ email: schema.users.email, displayName: schema.users.displayName, handle: schema.users.handle, field: schema.users.field, createdAt: schema.users.createdAt })
      .from(schema.users).where(not(like(schema.users.email, "%@example.com"))).orderBy(desc(schema.users.createdAt)).limit(5000),
    db.select({ email: schema.accessGrants.email, asReviewer: schema.accessGrants.asReviewer }).from(schema.accessGrants).limit(10000),
    // Confirmed co-reviews per person: part of the record when someone applies to become a reviewer.
    db.select({ email: sql<string>`lower(${schema.users.email})`, n: count() }).from(schema.reviews)
      .innerJoin(schema.users, eq(schema.users.id, schema.reviews.coReviewerId))
      .where(isNotNull(schema.reviews.coReviewerConfirmedAt)).groupBy(sql`lower(${schema.users.email})`),
  ]);
  const coReviews = new Map(coRows.map((r) => [r.email, Number(r.n)]));
  const coReviewsOf = (email: string) => coReviews.get(email.toLowerCase()) ?? 0;
  const access = new Map(grants.map((g) => [g.email.toLowerCase(), g.asReviewer ? "reviewer" as const : "member" as const]));
  const accounts = new Set(users.map((u) => u.email.toLowerCase()));
  /** "reviewer" or "member" when the email was let in, "account" when it already signed up, null when it's still waiting. */
  const statusOf = (email: string) => access.get(email.toLowerCase()) ?? (accounts.has(email.toLowerCase()) ? "account" as const : null);
  return { reviewers, waitlist, users, statusOf, coReviewsOf };
}

/** CSV with every cell quoted; cells that a spreadsheet would run as a formula are prefixed with an apostrophe. */
export function toCsv(header: string[], rows: (string | number | null | undefined | Date)[][]): string {
  const cell = (v: string | number | null | undefined | Date) => {
    let s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
