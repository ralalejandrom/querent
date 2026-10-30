import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";

/** Exports the signed-in user's own data (profile, posts, reviews, contributions, follows, saves, messages they sent). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [profile, posts, reviews, contributions, follows, saves, messagesSent] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.id, user.id)),
    db.select().from(schema.posts).where(eq(schema.posts.authorId, user.id)),
    db.select().from(schema.reviews).where(eq(schema.reviews.reviewerId, user.id)),
    db.select().from(schema.contributions).where(eq(schema.contributions.authorId, user.id)),
    db.select().from(schema.follows).where(eq(schema.follows.userId, user.id)),
    db.select().from(schema.saves).where(eq(schema.saves.userId, user.id)),
    db.select({ id: schema.messages.id, conversationId: schema.messages.conversationId, body: schema.messages.body, createdAt: schema.messages.createdAt, deletedAt: schema.messages.deletedAt })
      .from(schema.messages).where(eq(schema.messages.senderId, user.id)),
  ]);
  // Never include the password hash in an export.
  const { passwordHash: _omit, ...profileOut } = profile[0] ?? {};
  void _omit;
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), profile: profileOut, posts, reviews, contributions, follows, saves, messagesSent }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="lyncei-export-${user.handle}.json"` },
  });
}
