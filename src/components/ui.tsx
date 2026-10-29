import Link from "next/link";
import type { ReactNode } from "react";
import type { PostView } from "@/lib/queries";
import { compact, initials, timeAgo } from "@/lib/text";
import { toggleReactionAction, toggleSaveAction } from "@/app/actions";
import { CORRECTION_LABELS, DESIGN_LABELS, isPreprint } from "@/lib/study";
import { ReelVideo } from "@/components/client";

const PATHS: Record<string, ReactNode> = {
  home: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  q: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4M12 16.6h.01" /></>,
  review: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  book: <path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z" />,
  user: <><circle cx="12" cy="9" r="4" /><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" /></>,
  bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20h4" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  bookmark: <path d="M6 4h12v16l-6-4-6 4z" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  left: <path d="M15 5l-7 7 7 7" />,
  shield: <path d="M12 3l7 3v5c0 5-3.2 8.3-7 10-3.8-1.7-7-5-7-10V6z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  play: <><rect x="3.5" y="5" width="17" height="14" rx="3" /><path d="M10.5 9.3v5.4l4.3-2.7z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></>,
};

export function Icon({ name, className = "i" }: { name: keyof typeof PATHS | string; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{PATHS[name]}</svg>;
}

export function Mark({ size = 34 }: { size?: number }) {
  // A Q with a dot in the middle, like a pupil looking straight at you.
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" fill="none" strokeLinecap="round">
      <circle cx="46" cy="46" r="30" stroke="currentColor" strokeWidth="10" />
      <circle cx="46" cy="46" r="9" fill="currentColor" />
      <path d="M66 66l18 18" stroke="var(--gold)" strokeWidth="10" />
    </svg>
  );
}

const AV_COLORS = ["#B5654A", "#4C6E9E", "#6E8B5A", "#8A5A9E", "#4E8C8A", "#A2803C", "#5A6FB5", "#9E5A6E"];
// Portrait photos for the fictional example accounts only (Unsplash license). Real accounts keep initials.
const DEMO_PHOTOS: Record<string, string> = {
  sarahwhitfield: "photo-1758691737587-7630b4d31d16",
  michaelbrennan: "photo-1560250097-0b93528c311a",
  rafaelgomez: "photo-1686063165043-45243dab25ab",
  danielhoffman: "photo-1771904866914-93f97b30db88",
  emilycarter: "photo-1679560307941-3a8af87a5c16",
  sofiamendes: "photo-1765005204058-10418f5123c5",
};
const demoPhoto = (handle: string) =>
  process.env.DEMO_ACCOUNTS === "1" && DEMO_PHOTOS[handle]
    ? `https://images.unsplash.com/${DEMO_PHOTOS[handle]}?w=144&h=144&fit=facearea&facepad=2.4&q=75&fm=jpg`
    : null;

export function Avatar({ name, handle, size = "" }: { name: string; handle: string; size?: "" | "sm" | "lg" }) {
  const color = AV_COLORS[[...handle].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];
  const photo = demoPhoto(handle);
  if (photo) {
    return (
      <Link href={`/u/${handle}`} className={`av ${size}`} style={{ background: color }} aria-label={name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" loading="lazy" decoding="async" />
      </Link>
    );
  }
  return <Link href={`/u/${handle}`} className={`av ${size}`} style={{ background: color }} aria-label={name}>{initials(name)}</Link>;
}

/** Blue seal shown next to the names of verified reviewers (users with the reviewer role). */
export function Verified() {
  return (
    <svg className="vf" viewBox="0 0 24 24" role="img" aria-label="Verified reviewer">
      <title>Verified reviewer</title>
      <path d="M12.00 1.00 L14.38 3.11 L17.50 2.47 L18.51 5.49 L21.53 6.50 L20.89 9.62 L23.00 12.00 L20.89 14.38 L21.53 17.50 L18.51 18.51 L17.50 21.53 L14.38 20.89 L12.00 23.00 L9.62 20.89 L6.50 21.53 L5.49 18.51 L2.47 17.50 L3.11 14.38 L1.00 12.00 L3.11 9.62 L2.47 6.50 L5.49 5.49 L6.50 2.47 L9.62 3.11Z" fill="#2B3FD8" stroke="#2B3FD8" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 12.4l2.7 2.7 5.4-5.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A name with the verified seal kept on the same line as its last word. */
export function Name({ name, verified }: { name: string; verified: boolean }) {
  if (!verified) return <>{name}</>;
  const i = name.lastIndexOf(" ");
  return <>{i > 0 ? name.slice(0, i + 1) : ""}<span className="nw">{name.slice(i + 1)}<Verified /></span></>;
}

export function RigorChip({ rigor }: { rigor: PostView["rigor"] }) {
  return (
    <details className="rigor">
      <summary className={`state rigor-${rigor.key}`} title="What does this label mean?"><i />{rigor.label}</summary>
      <div className="pop" role="note">{rigor.description} Reach (likes, shares) never changes this label.</div>
    </details>
  );
}

export const KIND_LABELS: Record<PostView["kind"], string> = {
  video: "Video explainer", visual: "Visual", thread: "Thread", behind_the_paper: "Behind the Paper", open_question: "Open Question",
};

function ReviewStrip({ p }: { p: PostView }) {
  if (p.rigor.key === "disputed" || p.rigor.key === "retracted") return <div className="disputed"><b>{p.rigor.label}</b> · {p.rigor.description}</div>;
  if (!p.reviewTotal) return null;
  if (p.rigor.key === "expert_reviewed")
    return <div className="reviewed"><span className="chk"><Icon name="check" className="" /></span><div><b>Human expert review completed</b><span className="muted">{p.reviewCompleted} review{p.reviewCompleted > 1 ? "s" : ""}</span></div></div>;
  if (p.reviewCompleted < p.reviewTotal)
    return <div className="progress"><b>Expert review in progress</b><span className="muted">{p.reviewCompleted} of {p.reviewTotal}</span><span className="bar"><i style={{ width: `${Math.round((p.reviewCompleted / p.reviewTotal) * 100)}%` }} /></span></div>;
  return null;
}

export function PostCard({ p, full = false, signedIn }: { p: PostView; full?: boolean; signedIn: boolean }) {
  const body = full || p.body.length <= 220 ? p.body : p.body.slice(0, 220) + "…";
  const like = toggleReactionAction.bind(null, p.id, "like");
  const insight = toggleReactionAction.bind(null, p.id, "insightful");
  const save = toggleSaveAction.bind(null, p.id);
  const doiUrl = p.source?.doi ? `https://doi.org/${p.source.doi}` : null;
  return (
    <article className="card">
      <div className="ph">
        <Avatar name={p.author.displayName} handle={p.author.handle} />
        <div className="who"><Link href={`/u/${p.author.handle}`}><Name name={p.author.displayName} verified={p.author.verified} /></Link><small>{p.author.field}</small></div>
        <span className="t">{timeAgo(p.createdAt)}</span>
      </div>
      <div className="kindrow">
        <span className="kind">{KIND_LABELS[p.kind]}{p.aiAssisted ? " · AI-assisted" : ""}</span>
        {p.studyType && <span className="design">{DESIGN_LABELS[p.studyType] ?? p.studyType}</span>}
        {isPreprint(p.source?.sourceType) && <span className="design pre">Preprint · not peer-reviewed</span>}
        {p.author.example && <span className="design ex" title="This person, study and DOI are made up to show how Lyncei works.">Example · fictional</span>}
      </div>
      <h2 className="ptitle">{full ? p.title : <Link href={`/p/${p.id}`}>{p.title}</Link>}</h2>
      {body && <p className="pbody">{body}</p>}
      {p.mediaUrl && <video className="pvideo" src={p.mediaUrl} poster={posterFor(p.mediaUrl)} controls playsInline preload="metadata" aria-label={`Video: ${p.title}`} />}
      {p.why && !full && <p className="why">{p.why}</p>}
      {p.source ? (
        <a className="study" href={doiUrl ?? "#"} target="_blank" rel="noopener noreferrer">
          <span className="thumb" />
          <div style={{ minWidth: 0 }}>
            <b>{p.source.title}</b>
            <span>{[p.source.venue, p.source.publishedYear].filter(Boolean).join(" · ") || "Source"}</span>
            {p.source.doi && <span className="doi">doi:{p.source.doi}</span>}
            {CORRECTION_LABELS[p.source.correctionStatus] && <span className={`corr ${p.source.correctionStatus}`}>{CORRECTION_LABELS[p.source.correctionStatus]}</span>}
          </div>
        </a>
      ) : <div className="study missing">No source linked</div>}
      {p.question && <Link className="qlink" href={`/q/${p.question.slug}`}><Icon name="q" />{p.question.text}</Link>}
      <ReviewStrip p={p} />
      <div className="signals">
        <div className="acts" aria-label="Reach">
          {signedIn ? (
            <>
              <form action={like}><button className={`act ${p.viewerLiked ? "on" : ""}`} aria-pressed={p.viewerLiked} aria-label="Like"><Icon name="heart" />{compact(p.likes)}</button></form>
              <form action={insight}><button className={`act ${p.viewerInsightful ? "on" : ""}`} aria-pressed={p.viewerInsightful} aria-label="Insightful"><Icon name="bulb" />{compact(p.insightful)}</button></form>
            </>
          ) : (
            <>
              <span className="act"><Icon name="heart" />{compact(p.likes)}</span>
              <span className="act"><Icon name="bulb" />{compact(p.insightful)}</span>
            </>
          )}
          <Link className="act" href={`/p/${p.id}#discussion`}><Icon name="chat" />{p.commentCount}</Link>
          {signedIn && <form action={save}><button className={`act ${p.saved ? "saved" : ""}`} aria-pressed={p.saved} aria-label="Save to library"><Icon name="bookmark" /></button></form>}
        </div>
        <div className="row"><span className="hint">Rigor</span><RigorChip rigor={p.rigor} /></div>
      </div>
    </article>
  );
}

/** Demo videos ship with a poster frame next to them; uploaded videos show their first frame. */
function posterFor(url: string) {
  return url.startsWith("/media/") ? url.replace(/\.mp4$/, ".jpg") : undefined;
}

/** One full-height card in the Videos feed. */
export function ReelCard({ p }: { p: PostView }) {
  return (
    <article className="reelc">
      <ReelVideo src={p.mediaUrl!} poster={posterFor(p.mediaUrl!)} label={`Video: ${p.title}`} />
      <div className="reelc-ov">
        <div className="reelc-who">
          <Avatar name={p.author.displayName} handle={p.author.handle} size="sm" />
          <Link href={`/u/${p.author.handle}`}><Name name={p.author.displayName} verified={p.author.verified} /></Link>
        </div>
        <h2><Link href={`/p/${p.id}`}>{p.title}</Link></h2>
        <div className="reelc-tags">
          {p.author.example && <span className="design ex">Example · fictional</span>}
          <RigorChip rigor={p.rigor} />
          {p.studyType && <span className="design">{DESIGN_LABELS[p.studyType] ?? p.studyType}</span>}
        </div>
        {p.source && <Link className="reelc-src" href={`/p/${p.id}`}><Icon name="book" />{p.source.title}</Link>}
      </div>
    </article>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}
