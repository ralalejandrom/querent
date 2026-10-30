import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { dmCounts, listConversations } from "@/lib/dm";
import { timeAgo } from "@/lib/text";
import { Avatar, Empty } from "@/components/ui";
import { AutoRefresh } from "@/components/client";

export const metadata = { title: "Messages" };

export default async function Messages({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const user = await requireUser("/messages");
  const box = (await searchParams).box === "requests" ? "requests" : "inbox";
  const [rows, counts] = await Promise.all([listConversations(user.id, box), dmCounts(user.id)]);
  return (
    <main className="main" id="main" style={{ maxWidth: 760 }}>
      <AutoRefresh seconds={10} />
      <h1 className="pg">Messages</h1>
      <div className="tabs" role="tablist">
        <Link href="/messages" className={box === "inbox" ? "on" : ""} aria-current={box === "inbox" ? "page" : undefined}>Inbox{counts.unread > 0 && <span className="ct">{counts.unread}</span>}</Link>
        <Link href="/messages?box=requests" className={box === "requests" ? "on" : ""} aria-current={box === "requests" ? "page" : undefined}>Requests{counts.requests > 0 && <span className="ct">{counts.requests}</span>}</Link>
      </div>
      {box === "requests" && <p className="hint">Messages from people you don't follow. They can't see whether you've read them. Accept to move a conversation to your inbox, or delete it.</p>}
      {rows.length ? (
        <div className="dmlist">
          {rows.map((c) => (
            <Link key={c.id} href={`/messages/${c.id}`} className={`dmrow ${c.unread ? "unread" : ""}`}>
              <Avatar name={c.other.displayName} handle={c.other.handle} size="sm" link={false} />
              <div className="dmrow-main">
                <div className="dmrow-top"><b>{c.other.displayName}</b><span className="hint">{timeAgo(c.lastMessageAt)}</span></div>
                <div className="dmrow-last">{c.last ? (c.last.gone ? <i>Message removed</i> : <>{c.last.mine ? "You: " : ""}{c.last.body.length > 90 ? c.last.body.slice(0, 90) + "…" : c.last.body}</>) : <i>No messages yet</i>}</div>
              </div>
              {c.unread > 0 && <span className="dmdot" aria-label={`${c.unread} unread`}>{c.unread}</span>}
            </Link>
          ))}
        </div>
      ) : box === "inbox"
        ? <Empty title="No messages yet">To message someone, open their profile and choose Message.</Empty>
        : <Empty title="No message requests">Messages from people you don't follow appear here first.</Empty>}
    </main>
  );
}
