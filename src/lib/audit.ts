import "server-only";
import { after } from "next/server";
import { db, schema } from "@/db";
import { pushConfigured, sendPush } from "./push";

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

/** In-app notification, plus a push notification on the person's phones when the iOS app is set up. */
export async function notify(tx: Tx | typeof db, recipientId: string, text: string, link: string) {
  await tx.insert(schema.notifications).values({ recipientId, text, link });
  if (pushConfigured()) {
    try {
      after(() => sendPush(recipientId, { body: text, url: link }).catch((err) => console.error("push failed", err)));
    } catch { /* outside a request (seed scripts): no push */ }
  }
}
