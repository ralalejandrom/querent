import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { databaseUrl } from "./url";

async function main() {
  if (!process.env.DATABASE_URL && (process.env.VERCEL || process.env.CI)) {
    throw new Error("DATABASE_URL is not set. On Vercel, add a Postgres database (Storage → Neon) to this project, then redeploy.");
  }
  const pool = new Pool({ connectionString: databaseUrl() });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
