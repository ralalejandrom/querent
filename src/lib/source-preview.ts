import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { aiEnabled, summarizeAbstract } from "./ai";

export type SourcePreview = typeof schema.sources.$inferSelect;

/** Loads stored sources for a set of DOIs (lower-cased), keyed by DOI. */
export async function loadSourcePreviews(dois: string[]): Promise<Map<string, SourcePreview>> {
  const list = [...new Set(dois.map((d) => d.toLowerCase()))];
  if (!list.length) return new Map();
  const rows = await db.select().from(schema.sources).where(inArray(sql`lower(${schema.sources.doi})`, list));
  return new Map(rows.map((r) => [r.doi!.toLowerCase(), r]));
}

/** True when a preview could be generated now: AI is on, there's an abstract, and no recent attempt. */
export function needsSummary(s: SourcePreview) {
  if (!aiEnabled() || s.aiSummary || !s.abstract) return false;
  return !s.aiSummaryAt || Date.now() - s.aiSummaryAt.getTime() > 6 * 3_600_000;
}

/** Generates and stores the AI summary for a source, at most once per 6 hours per source. */
export async function ensureSourceSummary(sourceId: string): Promise<void> {
  const [s] = await db.select().from(schema.sources).where(eq(schema.sources.id, sourceId)).limit(1);
  if (!s || !needsSummary(s)) return;
  await db.update(schema.sources).set({ aiSummaryAt: new Date() }).where(eq(schema.sources.id, s.id));
  const summary = await summarizeAbstract({ title: s.title, venue: s.venue, year: s.publishedYear, abstract: s.abstract! });
  if (summary) await db.update(schema.sources).set({ aiSummary: summary }).where(eq(schema.sources.id, s.id));
}
