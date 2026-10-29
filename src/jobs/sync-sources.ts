/**
 * Re-checks every cited DOI against Crossref (see src/lib/source-sync.ts).
 * In production this runs daily through Vercel Cron (/api/cron/sync-sources); this script is for manual runs:
 *   npm run jobs:sync-sources
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";
import { databaseUrl } from "../db/url";
import { syncSources } from "../lib/source-sync";

const pool = new Pool({ connectionString: databaseUrl() });
const db = drizzle(pool, { schema });

syncSources(db)
  .then((r) => console.log(`Checked ${r.checked} sources: ${r.resolved} newly resolved, ${r.changed} correction changes, ${r.failed} unreachable.`))
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
