/**
 * Grants a role to a user by email.
 *   npm run admin:grant -- someone@uni.edu reviewer "Cardiology,Clinical trials"
 * Roles: member, reviewer, moderator, integrity_admin, platform_admin
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

async function main() {
  const [email, role, fields = ""] = process.argv.slice(2);
  const roles = schema.roleEnum.enumValues as readonly string[];
  if (!email || !roles.includes(role)) {
    console.error(`Usage: npm run admin:grant -- <email> <${roles.join("|")}> ["Field A,Field B"]`);
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://querent:querent@localhost:5432/querent" });
  const db = drizzle(pool, { schema });
  const [user] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email.toLowerCase()}`).limit(1);
  if (!user) { console.error(`No user with email ${email}. They need to sign in once first.`); await pool.end(); process.exit(1); }
  const fieldList = fields.split(",").map((f) => f.trim()).filter(Boolean);
  await db.insert(schema.userRoles).values({ userId: user.id, role: role as never, fields: fieldList })
    .onConflictDoUpdate({ target: [schema.userRoles.userId, schema.userRoles.role], set: { fields: fieldList } });
  await db.insert(schema.auditEvents).values({ actorId: null, entityType: "user", entityId: user.id, action: "role.granted", after: { role, fields: fieldList } as never });
  console.log(`Granted ${role} to ${email}${fieldList.length ? ` (${fieldList.join(", ")})` : ""}.`);
  await pool.end();
}
main();
