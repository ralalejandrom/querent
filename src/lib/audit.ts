import "server-only";
import { db, schema } from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Writes an append-only audit event. Use for anything that affects labels, reviews, moderation or edits. */
export async function audit(
  tx: Tx | typeof db,
  e: { actorId: string | null; entityType: string; entityId: string; action: string; before?: unknown; after?: unknown },
) {
  await tx.insert(schema.auditEvents).values({
    actorId: e.actorId, entityType: e.entityType, entityId: e.entityId, action: e.action,
    before: (e.before ?? null) as never, after: (e.after ?? null) as never,
  });
}

export async function notify(tx: Tx | typeof db, recipientId: string, text: string, link: string) {
  await tx.insert(schema.notifications).values({ recipientId, text, link });
}
