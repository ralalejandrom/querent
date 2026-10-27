import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { loadPosts } from "@/lib/queries";
import { Empty, PostCard } from "@/components/ui";
import { Rail } from "@/components/rail";

export const metadata = { title: "My Library" };

export default async function Library() {
  const user = await requireUser("/library");
  const saved = await db.select({ postId: schema.saves.postId }).from(schema.saves).where(eq(schema.saves.userId, user.id)).orderBy(desc(schema.saves.createdAt));
  const list = await loadPosts({ ids: saved.map((s) => s.postId), viewerId: user.id });
  return (
    <>
      <main className="main" id="main">
        <h1 className="pg">My Library</h1>
        <p className="pgsub">Posts and studies you've saved.</p>
        {list.length ? list.map((p) => <PostCard key={p.id} p={p} signedIn />) : <Empty title="Nothing saved yet">Tap the bookmark on any post to keep it here.</Empty>}
      </main>
      <Rail />
    </>
  );
}
