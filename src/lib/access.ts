import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { isExampleEmail } from "./examples";

/**
 * Early access. With ACCESS_MODE=open anyone can create an account; otherwise (the default)
 * only these emails can sign in: the founding team (ADMIN_EMAILS), people who already have an
 * account, and emails the team granted access to from /admin.
 */
export const accessIsOpen = () => process.env.ACCESS_MODE === "open";

export function adminEmailList(): string[] {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export async function canSignIn(email: string): Promise<boolean> {
  const address = email.trim().toLowerCase();
  if (isExampleEmail(address)) return false;
  if (accessIsOpen() || adminEmailList().includes(address)) return true;
  const [user] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(and(sql`lower(${schema.users.email}) = ${address}`, isNull(schema.users.deletedAt))).limit(1);
  if (user) return true;
  const [grant] = await db.select({ id: schema.accessGrants.id }).from(schema.accessGrants)
    .where(sql`lower(${schema.accessGrants.email}) = ${address}`).limit(1);
  return !!grant;
}

/** Gives a signed-in account what its grant promised: the reviewer role, for the fields it was approved in. */
export async function applyGrant(userId: string, email: string): Promise<void> {
  const [grant] = await db.select().from(schema.accessGrants)
    .where(sql`lower(${schema.accessGrants.email}) = ${email.toLowerCase()}`).limit(1);
  if (!grant?.asReviewer) return;
  const added = await db.insert(schema.userRoles)
    .values({ userId, role: "reviewer", fields: grant.fields, grantedBy: grant.grantedBy })
    .onConflictDoNothing()
    .returning({ role: schema.userRoles.role });
  if (added.length) {
    await db.insert(schema.auditEvents).values({ actorId: grant.grantedBy, entityType: "user", entityId: userId, action: "role.granted", after: { roles: ["reviewer"], fields: grant.fields, via: "access_grant" } as never });
  }
}

/** Records a grant (or upgrades it to reviewer). Returns true when the email had no grant before. */
export async function grantAccess(input: { email: string; asReviewer: boolean; fields: string[]; grantedBy: string }): Promise<boolean> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select().from(schema.accessGrants).where(sql`lower(${schema.accessGrants.email}) = ${email}`).limit(1);
  if (existing) {
    if (input.asReviewer && !existing.asReviewer) {
      await db.update(schema.accessGrants).set({ asReviewer: true, fields: input.fields, grantedBy: input.grantedBy }).where(eq(schema.accessGrants.id, existing.id));
    }
  } else {
    await db.insert(schema.accessGrants).values({ email, asReviewer: input.asReviewer, fields: input.fields, grantedBy: input.grantedBy });
  }
  // Someone who already has an account gets the reviewer role right away.
  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
  if (user) await applyGrant(user.id, email);
  return !existing;
}
