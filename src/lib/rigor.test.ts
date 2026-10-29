import { describe, expect, it } from "vitest";
import { computeRigor } from "./rigor";
import { normalizeDoi, parseCrossrefWork } from "./doi";
import { slugify } from "./text";

describe("computeRigor", () => {
  const base = { hasSource: true, disputedReason: null, completedReviewTypes: [] as never[] };

  it("is unreviewed without a source, even with reviews", () => {
    expect(computeRigor({ ...base, hasSource: false, completedReviewTypes: ["methodological", "statistical"] }).key).toBe("unreviewed");
  });
  it("flags unverified DOIs instead of claiming there's no source", () => {
    expect(computeRigor({ ...base, hasSource: false, sourceUnverified: true }).label).toBe("Unreviewed · source not verified");
  });
  it("is source-linked with only a source", () => {
    expect(computeRigor(base).key).toBe("source_linked");
  });
  it("is source-checked after a fidelity review", () => {
    expect(computeRigor({ ...base, completedReviewTypes: ["source_fidelity"] }).key).toBe("source_checked");
  });
  it("needs both methodological and statistical reviews to be expert-reviewed", () => {
    expect(computeRigor({ ...base, completedReviewTypes: ["methodological"] }).key).toBe("source_linked");
    expect(computeRigor({ ...base, completedReviewTypes: ["methodological", "statistical"] }).key).toBe("expert_reviewed");
  });
  it("disputes override reviews, retractions override everything", () => {
    expect(computeRigor({ ...base, disputedReason: "x", completedReviewTypes: ["methodological", "statistical"] }).key).toBe("disputed");
    expect(computeRigor({ ...base, disputedReason: "x", correctionStatus: "retracted" }).key).toBe("retracted");
  });
});

describe("normalizeDoi", () => {
  it("accepts bare, prefixed and URL forms", () => {
    expect(normalizeDoi("10.1056/NEJMoa2301234")).toBe("10.1056/nejmoa2301234");
    expect(normalizeDoi("doi: 10.1000/xyz")).toBe("10.1000/xyz");
    expect(normalizeDoi("https://doi.org/10.1000/ABC%2F1")).toBe("10.1000/abc/1");
  });
  it("rejects non-DOIs", () => {
    expect(normalizeDoi("hello")).toBeNull();
    expect(normalizeDoi("11.1000/xyz")).toBeNull();
    expect(normalizeDoi("10.12/x")).toBeNull();
  });
});

describe("parseCrossrefWork", () => {
  it("maps metadata and retractions", () => {
    const m = parseCrossrefWork("10.1/x", {
      title: ["A trial"], author: [{ given: "Ana", family: "Ruiz" }], "container-title": ["J"],
      issued: { "date-parts": [[2025, 3]] }, type: "journal-article", "updated-by": [{ type: "retraction" }],
    });
    expect(m).toMatchObject({ title: "A trial", authors: ["Ana Ruiz"], venue: "J", publishedYear: 2025, correctionStatus: "retracted" });
  });
});

describe("slugify", () => {
  it("makes URL-safe slugs", () => {
    expect(slugify("Does sleep after learning improve memory?")).toBe("does-sleep-after-learning-improve-memory");
    expect(slugify("Ñandú & Café")).toBe("nandu-cafe");
  });
});

describe("computeRigor verdicts", () => {
  const base = { hasSource: true, disputedReason: null, completedReviewTypes: [] as never[] };
  it("never sounds better than the reviewers' verdicts", () => {
    const both = ["methodological", "statistical"] as const;
    expect(computeRigor({ ...base, completedReviewTypes: both, verdicts: ["Sound", "Sound with caveats"] }).key).toBe("expert_reviewed");
    expect(computeRigor({ ...base, completedReviewTypes: both, verdicts: ["Sound", "Major concerns"] }).key).toBe("contested");
    expect(computeRigor({ ...base, completedReviewTypes: both, verdicts: ["Major concerns", "Major concerns"] }).label).toBe("Major concerns");
    expect(computeRigor({ ...base, completedReviewTypes: ["source_fidelity"], verdicts: ["Not faithful to source"] }).label).toBe("Not faithful to source");
    expect(computeRigor({ ...base, disputedReason: "x", verdicts: ["Sound", "Major concerns"] }).key).toBe("disputed");
  });
});
