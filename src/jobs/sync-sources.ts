/**
 * Nightly job: re-checks every cited DOI against Crossref.
 * - Resolves DOIs that couldn't be verified when they were posted.
 * - Updates correction status (corrections, expressions of concern, retractions).
 * Every change is written to the audit log, and followers of affected posts' authors are notified.
 * Schedule with cron, e.g.:  0 3 * * *  npm run jobs:sync-sources
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, isNotNull } from "drizzle-orm";
import * as schema from "../db/schema";
import { fetchCrossref } from "../lib/doi";
import { databaseUrl } from "../db/url";

const pool = new Pool({ connectionString: databaseUrl() });
const db = drizzle(pool, { schema });

async function main() {
  const rows = await db.select().from(schema.sources).where(isNotNull(schema.sources.doi));
  let resolved = 0, changed = 0, failed = 0;
  for (const s of rows) {
    if (s.provenance.provider === "seed") continue;
    const meta = await fetchCrossref(s.doi!);
    if (!meta) { failed++; continue; }
    const wasUnresolved = s.provenance.provider === "unresolved";
    const statusChanged = meta.correctionStatus !== s.correctionStatus;
    await db.update(schema.sources).set({
      title: meta.title, authors: meta.authors, venue: meta.venue, publishedYear: meta.publishedYear, sourceType: meta.sourceType,
      correctionStatus: meta.correctionStatus, provenance: { provider: "crossref", fetchedAt: new Date().toISOString() }, lastSyncedAt: new Date(),
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
  console.log(`Checked ${rows.length} sources: ${resolved} newly resolved, ${changed} correction changes, ${failed} unreachable.`);
}

main().then(() => pool.end()).catch((e) => { console.error(e); pool.end(); process.exit(1); });
