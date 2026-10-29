/** DOI parsing and Crossref metadata lookup. */

const DOI_RE = /^10\.\d{4,9}\/\S+$/;

/** Accepts "10.x/y", "doi:10.x/y" or "https://doi.org/10.x/y" and returns the bare, lower-cased DOI, or null. */
export function normalizeDoi(input: string): string | null {
  let s = input.trim();
  s = s.replace(/^doi:\s*/i, "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  try { s = decodeURIComponent(s); } catch { /* keep as is */ }
  s = s.trim().toLowerCase();
  return DOI_RE.test(s) ? s : null;
}

export interface SourceMetadata {
  doi: string;
  title: string;
  authors: string[];
  venue: string | null;
  publishedYear: number | null;
  sourceType: string | null;
  correctionStatus: "none_known" | "corrected" | "expression_of_concern" | "retracted" | "unknown";
  /** Plain-text abstract, when the publisher deposited one with Crossref. */
  abstract: string | null;
  provider: "crossref" | "manual";
}

interface CrossrefWork {
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  "container-title"?: string[];
  issued?: { "date-parts"?: number[][] };
  type?: string;
  "updated-by"?: { type?: string }[];
  abstract?: string;
}

/** Crossref abstracts are JATS XML. Keeps the text, drops the markup, and caps the length. */
export function abstractToText(jats: string | undefined): string | null {
  if (!jats) return null;
  const text = jats
    .replace(/<jats:title>(.*?)<\/jats:title>/gi, "$1: ")
    .replace(/<\/(jats:)?p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/^Abstract:?\s*/i, "")
    .trim();
  return text.length >= 80 ? text.slice(0, 8000) : null;
}

/** Maps Crossref "updated-by" notices to a correction status. */
export function correctionFromCrossref(work: CrossrefWork): SourceMetadata["correctionStatus"] {
  const types = (work["updated-by"] ?? []).map((u) => (u.type ?? "").toLowerCase());
  if (types.some((t) => t.includes("retraction"))) return "retracted";
  if (types.some((t) => t.includes("expression"))) return "expression_of_concern";
  if (types.some((t) => t.includes("correction") || t.includes("erratum"))) return "corrected";
  return "none_known";
}

export function parseCrossrefWork(doi: string, work: CrossrefWork): SourceMetadata {
  const year = work.issued?.["date-parts"]?.[0]?.[0];
  return {
    doi,
    title: work.title?.[0]?.trim() || doi,
    authors: (work.author ?? []).slice(0, 20).map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean),
    venue: work["container-title"]?.[0] ?? null,
    publishedYear: typeof year === "number" ? year : null,
    sourceType: work.type ?? null,
    correctionStatus: correctionFromCrossref(work),
    abstract: abstractToText(work.abstract),
    provider: "crossref",
  };
}

/** Looks a DOI up in Crossref. Returns null if Crossref doesn't know it or is unreachable. */
export async function fetchCrossref(doi: string, fetchImpl: typeof fetch = fetch): Promise<SourceMetadata | null> {
  const mailto = process.env.CROSSREF_MAILTO;
  try {
    const res = await fetchImpl(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { "User-Agent": `Lyncei/0.1 (https://lyncei.com${mailto ? `; mailto:${mailto}` : ""})` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { message?: CrossrefWork };
    return json.message ? parseCrossrefWork(doi, json.message) : null;
  } catch {
    return null;
  }
}
