import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getConversation, markRead, REQUEST_MESSAGE_LIMIT } from "@/lib/dm";
import { Avatar, Icon } from "@/components/ui";
import { AutoRefresh, MessageComposer, ReportMessage, ScrollToEnd } from "@/components/client";
import { acceptRequestAction, clearConversationAction, declineRequestAction, deleteMessageAction } from "@/app/dm-actions";
import { toggleBlockAction } from "@/app/actions";

export const metadata = { title: "Messages" };

const time = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export default async function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/messages/${id}`);
  const c = await getConversation(id, user.id);
  if (!c) notFound();
  await markRead(id, user.id);
  const o = c.otherUser;
  const isRequest = c.me.state === "request";
  const pendingTheirs = c.other.state === "request";
  const declined = c.other.state === "declined";
  const leftForRequest = Math.max(0, REQUEST_MESSAGE_LIMIT - c.sentByMe);
  const canSend = !c.blocked && !o.deleted && !declined && !(pendingTheirs && leftForRequest === 0);

  return (
    <main className="main dmmain" id="main" style={{ maxWidth: 760 }}>
      <AutoRefresh seconds={4} />
      <div className="dmhead">
        <Link className="back" href={isRequest ? "/messages?box=requests" : "/messages"} aria-label="Back to messages"><Icon name="left" /></Link>
        <Avatar name={o.displayName} handle={o.handle} size="sm" />
        <div className="dmhead-who">
          {o.deleted ? <b>Deleted account</b> : <Link href={`/u/${o.handle}`}><b>{o.displayName}</b></Link>}
          {o.field && <span className="hint">{o.field}</span>}
        </div>
        <details className="moremenu dmmenu">
          <summary className="btn sm" aria-label="Conversation options">···</summary>
          <div className="moremenu-body">
            <form action={clearConversationAction.bind(null, id)}><button className="btn sm">Delete chat</button></form>
            <p className="hint">Removes the chat from your inbox. {o.displayName.split(" ")[0]} keeps their copy.</p>
            {!o.deleted && <form action={toggleBlockAction.bind(null, o.id)}><button className="btn sm danger">{c.blocked ? "Unblock" : "Block"} {o.displayName}</button></form>}
            <p className="hint">To report a message, choose Report under it.</p>
          </div>
        </details>
      </div>

      {isRequest && (
        <div className="notice dmrequest">
          <b>{o.displayName} wants to message you.</b> You don't follow them. They can't see whether you've read this until you reply or accept.
          <div className="row" style={{ marginTop: 10 }}>
            <form action={acceptRequestAction.bind(null, id)}><button className="btn pri sm">Accept</button></form>
            <form action={declineRequestAction.bind(null, id)}><button className="btn sm">Delete</button></form>
            <form action={toggleBlockAction.bind(null, o.id)}><button className="btn sm danger">Block</button></form>
          </div>
        </div>
      )}

      <div className="dmthread" aria-live="polite">
        {c.messages.length === 0 && <p className="hint dmempty">{pendingTheirs ? `Say hello. ${o.displayName} doesn't follow you, so your first messages arrive as a request.` : "No messages yet. Say hello."}</p>}
        {c.messages.map((m) => {
          const mine = m.senderId === user.id;
          const gone = !!m.deletedAt || !!m.removedAt;
          return (
            <div key={m.id} className={`dmmsg ${mine ? "mine" : "theirs"}`}>
              <div className={`dmbubble ${gone ? "gone" : ""}`}>
                {m.removedAt ? "This message was removed by a moderator." : m.deletedAt ? "Message deleted." : m.body}
              </div>
              <div className="dmmeta">
                <span>{time(m.createdAt)}</span>
                {mine && !gone && <form action={deleteMessageAction.bind(null, m.id)}><button className="dmlink">Delete</button></form>}
                {!mine && !gone && <ReportMessage messageId={m.id} />}
              </div>
            </div>
          );
        })}
        <ScrollToEnd count={c.messages.length} />
      </div>

      {c.blocked ? <div className="notice">You can't message each other. {o.displayName} is blocked, or has blocked you.</div>
        : o.deleted ? <div className="notice">This account was deleted.</div>
        : declined ? <div className="notice">{o.displayName} isn't accepting your messages.</div>
        : pendingTheirs && leftForRequest === 0 ? <div className="notice">Your request is waiting. You can send more once {o.displayName} accepts.</div>
        : null}
      {canSend && (
        <>
          {pendingTheirs && c.sentByMe > 0 && <p className="hint dmhint">Message request sent. You can send {leftForRequest} more until {o.displayName} accepts.</p>}
          <MessageComposer conversationId={id} placeholder={isRequest ? "Reply to accept…" : "Write a message…"} />
        </>
      )}
    </main>
  );
}
