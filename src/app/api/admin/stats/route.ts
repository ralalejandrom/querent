import { NextResponse } from "next/server";
import { and, desc, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { isPlatformAdmin, loadSignups } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

/** Founding team only: visit counts and sign-ups as JSON, for the dashboard. ?days=30 by default (max 365). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!isPlatformAdmin(user)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86_400_000);
  const pv = schema.pageViews;
  const inRange = gt(pv.at, since);
  const visitors = sql<number>`count(distinct ${pv.visitor})`.mapWith(Number);
  const views = sql<number>`count(*)`.mapWith(Number);
  const top = <T,>(q: Promise<T[]>) => q;

  const [totals, last24, byDay, countries, cities, sources, pages, devices, signups] = await Promise.all([
    db.select({ views, visitors }).from(pv).where(inRange),
    db.select({ views, visitors }).from(pv).where(gt(pv.at, new Date(Date.now() - 86_400_000))),
    db.select({ day: sql<string>`to_char(${pv.at} at time zone 'America/New_York', 'YYYY-MM-DD')`, views, visitors })
      .from(pv).where(inRange).groupBy(sql`1`).orderBy(sql`1`),
    top(db.select({ country: pv.country, visitors }).from(pv).where(inRange).groupBy(pv.country).orderBy(desc(visitors)).limit(30)),
    top(db.select({ city: pv.city, region: pv.region, country: pv.country, visitors }).from(pv).where(and(inRange, sql`${pv.city} is not null`))
      .groupBy(pv.city, pv.region, pv.country).orderBy(desc(visitors)).limit(40)),
    top(db.select({ source: sql<string>`coalesce(${pv.referrerHost}, 'Direct or shared link')`, visitors }).from(pv).where(inRange).groupBy(sql`1`).orderBy(desc(visitors)).limit(20)),
    top(db.select({ path: pv.path, views, visitors }).from(pv).where(inRange).groupBy(pv.path).orderBy(desc(views)).limit(20)),
    db.select({ device: pv.device, visitors }).from(pv).where(inRange).groupBy(pv.device).orderBy(desc(visitors)),
    loadSignups(),
  ]);
  const [firstView] = await db.select({ at: sql<Date>`min(${pv.at})` }).from(pv);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    days,
    countingSince: firstView?.at ?? null,
    visits: { ...totals[0], last24h: last24[0], byDay, countries, cities, sources, pages, devices },
    signups: {
      waitlist: signups.waitlist.filter((w) => w.interest === "individual").map((w) => ({ email: w.email, at: w.createdAt, access: signups.statusOf(w.email) })),
      partners: signups.waitlist.filter((w) => w.interest === "institutional").map((w) => ({ email: w.email, organization: w.organization, type: w.partnerType, at: w.createdAt })),
      reviewers: signups.reviewers.map((r) => ({ name: r.name, email: r.email, field: r.field, institution: r.institution, stage: r.careerStage, orcid: r.orcidId, reviewsPerMonth: r.reviewsPerMonth, at: r.createdAt, access: signups.statusOf(r.email) })),
      accounts: signups.users.map((u) => ({ name: u.displayName, email: u.email, handle: u.handle, field: u.field, at: u.createdAt })),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
