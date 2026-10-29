import "server-only";
import { desc, not, like } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "./auth";

/** The admin panel is for the founding team: users holding the platform_admin role (granted via ADMIN_EMAILS). */
export const isPlatformAdmin = (u: CurrentUser | null) => !!u && u.roles.has("platform_admin");

export const STAGE_LABELS: Record<string, string> = {
  faculty: "Faculty / PI", clinician: "Clinician", postdoc: "Postdoc / fellow",
  phd_student: "PhD student", industry: "Industry", other: "Other",
};

export async function loadSignups() {
  const [reviewers, waitlist, users] = await Promise.all([
    db.select().from(schema.reviewerApplications).orderBy(desc(schema.reviewerApplications.createdAt)).limit(1000),
    db.select().from(schema.waitlist).orderBy(desc(schema.waitlist.createdAt)).limit(5000),
    db.select({ email: schema.users.email, displayName: schema.users.displayName, handle: schema.users.handle, field: schema.users.field, createdAt: schema.users.createdAt })
      .from(schema.users).where(not(like(schema.users.email, "%@example.com"))).orderBy(desc(schema.users.createdAt)).limit(5000),
  ]);
  return { reviewers, waitlist, users };
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
