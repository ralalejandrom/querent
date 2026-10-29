import type { SourcePreview } from "@/lib/source-preview";
import { CORRECTION_LABELS, DESIGN_LABELS, isPreprint } from "@/lib/study";

// Surname particles that belong to the family name ("Mc Causland", "van der Berg", "de la Cruz").
const PARTICLES = new Set(["mc", "mac", "van", "von", "der", "den", "de", "da", "das", "do", "dos", "del", "della", "di", "du", "la", "le", "st", "st.", "ter", "ten", "bin", "al", "el"]);
export const authorLine = (a: string[]) => {
  const short = a.slice(0, 3).map((n) => {
    const parts = n.trim().split(/\s+/);
    if (parts.length < 2) return n;
    const family = [parts.pop()!];
    while (parts.length > 1 && PARTICLES.has(parts[parts.length - 1].toLowerCase())) family.unshift(parts.pop()!);
    return `${family.join(" ")} ${parts.map((p) => p[0]).join("")}`;
  });
  return short.join(", ") + (a.length > 3 ? ", et al." : "");
};

/**
 * Preview of a cited paper. Metadata comes from Crossref; the bullet points are an AI-assisted
 * restatement of the published abstract and are always labeled as such.
 */
export function RefPreview({ source, compact = false }: { source: SourcePreview; compact?: boolean }) {
  const ai = source.aiSummary;
  const meta = [source.venue, source.publishedYear, isPreprint(source.sourceType) ? "Preprint · not peer-reviewed" : null].filter(Boolean).join(" · ");
  const correction = CORRECTION_LABELS[source.correctionStatus];
  return (
    <div className={`refp${compact ? " compact" : ""}`}>
      <div className="refp-h">
        <span className="spark" aria-hidden="true">✦</span>Reference preview
        {ai && <span className="refp-tag">AI-assisted</span>}
      </div>
      {correction && <div className={`refp-warn ${source.correctionStatus}`}>This paper has been {correction.toLowerCase()}. Check the notice before relying on it.</div>}
      {meta && <small className="refp-meta">{meta}</small>}
      <b className="refp-t">{source.title}</b>
      {source.authors.length > 0 && <small className="refp-a">{authorLine(source.authors)}</small>}
      {ai && (
        <>
          {ai.design && <small className="refp-design">Study design (AI-suggested): {DESIGN_LABELS[ai.design] ?? ai.design}</small>}
          <ul>{ai.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </>
      )}
      {source.doi && <a className="refp-doi" href={`https://doi.org/${source.doi}`} target="_blank" rel="noopener noreferrer">doi:{source.doi} ↗</a>}
      {ai ? <p className="refp-note">AI summary of the published abstract. Always check the source.</p>
        : !source.abstract && source.provenance.provider !== "seed" ? <p className="refp-note">No abstract available from the publisher, so there&apos;s no summary.</p> : null}
    </div>
  );
}
