import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/text";
import { Empty } from "@/components/ui";
import { markNotificationsReadAction } from "@/app/actions";

export const metadata = { title: "Notifications" };

export default async function Notifications() {
  const user = await requireUser("/notifications");
  const list = await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, user.id)).orderBy(desc(schema.notifications.createdAt)).limit(100);
  return (
    <main className="main" id="main" style={{ maxWidth: 760 }}>
      <div className="sec"><h1 className="pg" style={{ margin: 0 }}>Notifications</h1>
        {list.some((n) => !n.readAt) && <form action={markNotificationsReadAction}><button className="btn sm">Mark all read</button></form>}</div>
      {list.length ? list.map((n) => (
        <Link key={n.id} href={n.link} className="card" style={{ display: "block", textDecoration: "none", background: n.readAt ? undefined : "var(--blue-soft)" }}>
          {n.text}<div className="hint">{timeAgo(n.createdAt)} ago</div>
        </Link>
      )) : <Empty title="No notifications yet">You'll hear about reviews, replies and new evidence on questions you follow.</Empty>}
    </main>
  );
}
