import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { databaseUrl } from "./url";

const globalForDb = globalThis as unknown as { pool?: Pool };

// Reuse one pool across hot reloads in development.
const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: databaseUrl(),
    max: 10,
  });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
