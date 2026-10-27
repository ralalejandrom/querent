/**
 * Rigor labels. A post's label is DERIVED from its source and completed reviews,
 * never stored and never influenced by reach (likes, shares, views).
 */
export type ReviewType = "source_fidelity" | "methodological" | "statistical" | "clinical_relevance";
export type RigorKey = "unreviewed" | "source_linked" | "source_checked" | "expert_reviewed" | "disputed" | "retracted";

export interface RigorInput {
  hasSource: boolean;
  /** A DOI was given but could not be verified against Crossref yet. */
  sourceUnverified?: boolean;
  disputedReason: string | null;
  correctionStatus?: "none_known" | "corrected" | "expression_of_concern" | "retracted" | "unknown" | null;
  completedReviewTypes: Iterable<ReviewType>;
}

export interface Rigor {
  key: RigorKey;
  label: string;
  description: string;
}

export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  source_fidelity: "Source fidelity",
  methodological: "Methodological assessment",
  statistical: "Statistical review",
  clinical_relevance: "Clinical relevance",
};

export function computeRigor(input: RigorInput): Rigor {
  if (input.correctionStatus === "retracted") {
    return { key: "retracted", label: "Source retracted", description: "The cited source has been retracted. The post and its history remain visible for transparency." };
  }
  if (input.disputedReason) {
    return { key: "disputed", label: "Disputed", description: input.disputedReason };
  }
  if (!input.hasSource && input.sourceUnverified) {
    return { key: "unreviewed", label: "Unreviewed · source not verified", description: "A DOI was provided but couldn't be verified yet. It can't be reviewed until the source resolves." };
  }
  if (!input.hasSource) {
    return { key: "unreviewed", label: "Unreviewed · no source", description: "No source is linked. Treat this as opinion or an open question." };
  }
  const done = new Set(input.completedReviewTypes);
  if (done.has("methodological") && done.has("statistical")) {
    return { key: "expert_reviewed", label: "Expert-reviewed", description: "Qualified reviewers assessed the methods and statistics. This does not mean the result is settled." };
  }
  if (done.has("source_fidelity")) {
    return { key: "source_checked", label: "Source-checked", description: "A reviewer confirmed the post matches its cited source. The underlying study itself has not been assessed." };
  }
  return { key: "source_linked", label: "Source-linked", description: "A source is linked. No one has checked the interpretation yet." };
}
