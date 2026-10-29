import { describe, expect, it } from "vitest";
import { abstractToText, parseCrossrefWork } from "./doi";

describe("abstractToText", () => {
  it("turns JATS into plain text and keeps section titles", () => {
    const jats = "<jats:p><jats:title>Importance</jats:title>Kidney outcomes matter &amp; are rarely reported in heart failure trials with preserved ejection fraction.</jats:p><jats:p><jats:title>Results</jats:title>Of 6262 patients, 49% had eGFR &lt; 60.</jats:p>";
    expect(abstractToText(jats)).toBe("Importance: Kidney outcomes matter & are rarely reported in heart failure trials with preserved ejection fraction. Results: Of 6262 patients, 49% had eGFR < 60.");
  });
  it("ignores missing or trivially short abstracts", () => {
    expect(abstractToText(undefined)).toBeNull();
    expect(abstractToText("<jats:p>Abstract</jats:p>")).toBeNull();
  });
  it("is part of the parsed Crossref record", () => {
    const meta = parseCrossrefWork("10.1/x", { title: ["T"], abstract: "<p>" + "A long enough abstract sentence. ".repeat(5) + "</p>" });
    expect(meta.abstract).toMatch(/^A long enough abstract sentence\./);
  });
});

import { authorLine } from "../components/ref-preview";
describe("authorLine", () => {
  it("keeps surname particles with the family name", () => {
    expect(authorLine(["Finnian R. Mc Causland", "Brian L. Claggett", "Muthiah Vaduganathan", "Akshay S. Desai"])).toBe("Mc Causland FR, Claggett BL, Vaduganathan M, et al.");
    expect(authorLine(["Rudolf A. de Boer"])).toBe("de Boer RA");
  });
});
