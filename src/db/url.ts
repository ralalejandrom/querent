/**
 * The Postgres connection string, with the SSL mode made explicit.
 * Hosted providers (Neon on Vercel) hand out `sslmode=require`; current `pg` treats that as
 * `verify-full` and warns that the meaning will change. Asking for `verify-full` directly keeps
 * the same strict certificate check and silences the warning.
 */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL ?? "postgres://querent:querent@localhost:5432/querent";
  return url.replace(/([?&])sslmode=(prefer|require|verify-ca)(?=&|$)/, "$1sslmode=verify-full");
}
