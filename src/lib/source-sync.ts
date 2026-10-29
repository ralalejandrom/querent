import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { fetchCrossref } from "./doi";

/**
 * Re-checks cited DOIs against Crossref: resolves DOIs that couldn't be verified when posted,
 * refreshes abstracts, and records corrections, expressions of concern and retractions.
 * Every status change is written to the audit log and the authors of affected posts are notified.
 */
export async function syncSources(db: NodePgDatabase<typeof schema>, opts: { olderThanHours?: number; limit?: number } = {}) {
  const cutoff = new Date(Date.now() - (opts.olderThanHours ?? 0) * 3_600_000);
  const rows = await db.select().from(schema.sources)
    .where(and(isNotNull(schema.sources.doi), or(isNull(schema.sources.lastSyncedAt), lt(schema.sources.lastSyncedAt, cutoff))))
    .limit(opts.limit ?? 10_000);
  let resolved = 0, changed = 0, failed = 0, checked = 0;
  for (const s of rows) {
    if (s.provenance.provider === "seed") continue;
    checked++;
    const meta = await fetchCrossref(s.doi!);
    if (!meta) { failed++; await db.update(schema.sources).set({ lastSyncedAt: new Date() }).where(eq(schema.sources.id, s.id)); continue; }
    const wasUnresolved = s.provenance.provider === "unresolved";
    const statusChanged = meta.correctionStatus !== s.correctionStatus;
    await db.update(schema.sources).set({
      title: meta.title, authors: meta.authors, venue: meta.venue, publishedYear: meta.publishedYear, sourceType: meta.sourceType,
      correctionStatus: meta.correctionStatus, abstract: meta.abstract ?? s.abstract,
      provenance: { provider: "crossref", fetchedAt: new Date().toISOString() }, lastSyncedAt: new Date(),
    }).where(eq(schema.sources.id, s.id));
    if (wasUnresolved) resolved++;
    if (statusChanged && !wasUnresolved) {
      changed++;
      await db.insert(schema.auditEvents).values({ actorId: null, entityType: "source", entityId: s.id, action: "source.correction_status_changed", before: s.correctionStatus as never, after: meta.correctionStatus as never });
      const affected = await db.select({ id: schema.posts.id, authorId: schema.posts.authorId, title: schema.posts.title }).from(schema.posts).where(eq(schema.posts.sourceId, s.id));
      for (const p of affected) {
        await db.insert(schema.notifications).values({ recipientId: p.authorId, text: `The source cited in “${p.title.slice(0, 60)}” is now marked: ${meta.correctionStatus.replace(/_/g, " ")}.`, link: `/p/${p.id}` });
      }
    }
    await new Promise((r) => setTimeout(r, 120)); // stay well within Crossref's polite rate limits
  }
  return { checked, resolved, changed, failed };
}
