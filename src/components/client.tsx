"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

const PendingContext = createContext<boolean | null>(null);

export function Submit({ children, className = "btn pri" }: { children: ReactNode; className?: string }) {
  const ctx = useContext(PendingContext);
  const status = useFormStatus();
  const pending = ctx ?? status.pending;
  return <button className={className} type="submit" disabled={pending}>{pending ? "Working…" : children}</button>;
}

/** A form bound to a server action, showing its error or success message. */
export function ActionForm({ action, children, className = "form", resetOnOk = false }: { action: Action; children: ReactNode; className?: string; resetOnOk?: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (resetOnOk && state.ok) ref.current?.reset(); }, [state, resetOnOk]);
  // Submitting through onSubmit (not the form's action prop) keeps what the person typed when the server returns an error.
  return (
    <PendingContext.Provider value={pending}>
      <form ref={ref} className={className} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => formAction(fd)); }}>
        {children}
        {state.error && <div className="msg err" role="alert">{state.error}</div>}
        {state.ok && <div className="msg ok" role="status">{state.ok}</div>}
      </form>
    </PendingContext.Provider>
  );
}

/** Guests' top-bar sign-in button; hidden on the sign-in page itself. */
export function GuestSignIn() {
  const path = usePathname();
  if (path.startsWith("/login")) return null;
  return <Link className="btn sm pri" href="/login">Sign in</Link>;
}

export function NavLink({ href, children, className = "navb", exact = false }: { href: string; children: ReactNode; className?: string; exact?: boolean }) {
  const path = usePathname();
  const base = href.split("?")[0];
  const on = exact ? path === base : path === base || path.startsWith(base + "/");
  return <Link href={href} className={`${className} ${on ? "on" : ""}`} aria-current={on ? "page" : undefined}>{children}</Link>;
}

/* ------------------------------------------------------------ post form */
const DOI_RE = /^(doi:\s*|https?:\/\/(dx\.)?doi\.org\/)?10\.\d{4,9}\/\S+$/i;
export function DoiHint({ kindName = "kind" }: { kindName?: string }) {
  const [doi, setDoi] = useState("");
  const [kind, setKind] = useState("video");
  useEffect(() => {
    const form = document.getElementById("create-post");
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.name === kindName) setKind(t.value);
      if (t.name === "doi") setDoi(t.value);
    };
    form?.addEventListener("input", onChange);
    form?.addEventListener("change", onChange);
    return () => { form?.removeEventListener("input", onChange); form?.removeEventListener("change", onChange); };
  }, [kindName]);
  if (doi.trim() && !DOI_RE.test(doi.trim())) return <div className="warn">That doesn't look like a DOI. DOIs start with 10., like 10.1000/xyz123.</div>;
  if (!doi.trim() && kind !== "open_question") return <div className="warn">Without a source, this post will be labeled “Unreviewed · no source” and can't be reviewed.</div>;
  return null;
}

/* ---------------------------------------------------------- review form */
const CHECKLISTS: Record<string, string[]> = {
  source_fidelity: ["The post states the study's main finding accurately", "Population and design are described correctly", "Limitations mentioned in the paper are not omitted", "No causal claim beyond what the design supports"],
  methodological: ["Design is appropriate for the question", "Comparison groups and blinding are adequate", "Outcomes were prespecified", "Risk of bias is addressed"],
  statistical: ["Sample size and power are reported", "Analysis matches the prespecified plan", "Effect sizes come with confidence intervals", "Multiplicity and subgroups are handled appropriately"],
  clinical_relevance: ["Effect size is clinically meaningful", "Population matches who would be treated", "Harms and costs are considered", "Applicability limits are stated"],
};
const TYPE_LABELS: Record<string, string> = { source_fidelity: "Source fidelity", methodological: "Methodological assessment", statistical: "Statistical review", clinical_relevance: "Clinical relevance" };

export function ReviewFields({ taken }: { taken: string[] }) {
  const first = Object.keys(CHECKLISTS).find((t) => !taken.includes(t)) ?? "source_fidelity";
  const [type, setType] = useState(first);
  return (
    <>
      <fieldset className="chips" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="hint" style={{ marginBottom: 6 }}>What are you reviewing?</legend>
        {Object.entries(TYPE_LABELS).map(([k, l]) => (
          <label key={k} className="chip" title={taken.includes(k) ? "You already reviewed this" : undefined} style={taken.includes(k) ? { opacity: 0.45 } : undefined}>
            <input type="radio" name="type" value={k} checked={type === k} disabled={taken.includes(k)} onChange={() => setType(k)} />{l}
          </label>
        ))}
      </fieldset>
      <fieldset className="checks" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="hint" style={{ marginBottom: 6 }}>Checklist</legend>
        {CHECKLISTS[type].map((c) => <label key={type + c}><input type="checkbox" name="checklist" value={c} /> {c}</label>)}
      </fieldset>
      {type === "methodological" && (
        <div className="grid2">
          <label className="f">Methodological rigor<select name="rigor"><option>High</option><option>Moderate</option><option>Low</option></select></label>
          <label className="f">Risk of bias<select name="bias"><option>Low</option><option>Moderate</option><option>High</option></select></label>
          <label className="f">Clinical relevance<select name="relevance"><option>High</option><option>Moderate</option><option>Low</option></select></label>
          <label className="f">Reproducibility<select name="reproducibility"><option>Data available</option><option>Pending further evidence</option><option>Not reproducible</option></select></label>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------ composer */
const CTYPES = ["question", "evidence", "objection", "interpretation", "correction"];
export function ComposerFields({ id }: { id: string }) {
  return (
    <>
      <fieldset className="chips" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr">Contribution type</legend>
        {CTYPES.map((t, i) => <label key={t} className="chip"><input type="radio" name="type" value={t} defaultChecked={i === 0} />{t[0].toUpperCase() + t.slice(1)}</label>)}
      </fieldset>
      <label className="sr" htmlFor={`body-${id}`}>Your contribution</label>
      <textarea id={`body-${id}`} name="body" rows={2} placeholder="Ask a question, add evidence or raise an objection…" required minLength={3} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <input type="text" name="doi" placeholder="DOI, e.g. 10.1000/xyz123 (needed for evidence and objections)" style={{ maxWidth: 380 }} aria-label="DOI (needed for evidence and objections)" />
        <Submit className="btn pri sm">Post</Submit>
      </div>
    </>
  );
}

export function ReplyToggle({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="act" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Cancel" : "Reply"}</button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </>
  );
}

/** Copies a post's link (or opens the phone's share sheet). The link shows a "Reviewed on Lyncei" card when shared. */
/** Copies a block of text, such as a citation, with a visible confirmation. */
export function CopyText({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState("copied"); } catch { setState("failed"); }
    setTimeout(() => setState("idle"), 2500);
  }
  return <button type="button" className="btn sm" onClick={copy} aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Select the text to copy" : label}</button>;
}

export function ShareButton({ url, title }: { url: string; title: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function share() {
    const full = new URL(url, window.location.origin).toString();
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) { await navigator.share({ title, url: full }); return; }
      await navigator.clipboard.writeText(full);
      setState("copied");
    } catch { setState("failed"); }
    setTimeout(() => setState("idle"), 2500);
  }
  return (
    <button type="button" className="btn sm" onClick={share} aria-live="polite">
      {state === "copied" ? "Link copied" : state === "failed" ? "Copy failed. Use the address bar." : "Share"}
    </button>
  );
}

/**
 * Video picker for new posts: checks type, size and length in the browser, uploads straight to storage
 * with a progress bar, then puts the video's address in a hidden field for the post form.
 */
export function VideoUpload({ maxSeconds, maxBytes, types }: { maxSeconds: number; maxBytes: number; types: string[] }) {
  const [url, setUrl] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!types.includes(file.type)) { setError("Use an MP4, WebM or MOV video."); return; }
    if (file.size > maxBytes) { setError(`That file is over ${Math.round(maxBytes / 1024 / 1024)} MB. Export a shorter or smaller version.`); return; }
    const seconds = await new Promise<number>((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration); };
      v.onerror = () => resolve(0);
      v.src = URL.createObjectURL(file);
    });
    if (seconds > maxSeconds + 1) { setError(`Keep it under ${Math.round(maxSeconds / 60)} minutes. This one is ${Math.round(seconds)} seconds.`); return; }
    try {
      setProgress(0);
      const { upload } = await import("@vercel/blob/client");
      const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
      const blob = await upload(`videos/${safe}`, file, {
        access: "public", handleUploadUrl: "/api/upload", contentType: file.type, multipart: file.size > 20 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      setUrl(blob.url);
    } catch (e) {
      setError(e instanceof Error && /set up/i.test(e.message) ? "Video upload isn't switched on yet." : "The upload didn't finish. Check your connection and try again.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="vup">
      <input type="hidden" name="mediaUrl" value={url} />
      {url ? (
        <div className="vup-done">
          <video src={url} controls playsInline preload="metadata" className="vup-preview" />
          <button type="button" className="btn sm" onClick={() => { setUrl(""); if (inputRef.current) inputRef.current.value = ""; }}>Remove video</button>
        </div>
      ) : (
        <label className="vup-drop">
          <input ref={inputRef} type="file" accept={types.join(",")} onChange={(e) => pick(e.target.files?.[0])} disabled={progress !== null} />
          <b>{progress !== null ? `Uploading… ${progress}%` : "Add a short video"}</b>
          <span>MP4, WebM or MOV, up to {Math.round(maxSeconds / 60)} minutes. Explain your study in your own words.</span>
          {progress !== null && <span className="vup-bar"><i style={{ width: `${progress}%` }} /></span>}
        </label>
      )}
      {error && <p className="msg err" role="alert" style={{ margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}

/** A vertical video in the Videos feed: plays muted while on screen, pauses when scrolled away. */
export function ReelVideo({ src, poster, label }: { src: string; poster?: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio > 0.6 && !reduce) v.play().catch(() => {});
      else v.pause();
    }, { threshold: [0, 0.6, 1] });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} className="reelv" src={src} poster={poster} muted loop playsInline controls preload="metadata" aria-label={label} />;
}
