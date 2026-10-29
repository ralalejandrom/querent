/** Study design labels, shared by the post form, post cards and AI previews. */
export const DESIGN_LABELS: Record<string, string> = {
  randomized_trial: "Randomized trial", systematic_review: "Systematic review / meta-analysis", cohort: "Cohort study",
  case_control: "Case-control study", cross_sectional: "Cross-sectional study", case_series: "Case report / series",
  animal: "Animal study", in_vitro: "In vitro / lab study", computational: "Computational / modeling", qualitative: "Qualitative study", other: "Other design",
};

export const CORRECTION_LABELS: Record<string, string> = {
  retracted: "Retracted", expression_of_concern: "Expression of concern", corrected: "Corrected",
};

/** Crossref calls preprints "posted-content". */
export const isPreprint = (sourceType: string | null | undefined) => sourceType === "posted-content";
