import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {}, schema: { blocks: {} } }));
const { needsModeration } = await import("./safety");

describe("needsModeration", () => {
  it("lets ordinary scientific language through", () => {
    expect(needsModeration("Sex differences in sexual health outcomes after SGLT2 inhibitors", "Spicy food and gut microbiome")).toBe(false);
    expect(needsModeration("We studied retardation of crystal growth", "Chinkapin oak acorns")).toBe(false);
  });
  it("holds slurs, explicit content, spam and self-harm taunts", () => {
    expect(needsModeration("you are a f@ggot")).toBe(true);
    expect(needsModeration("check my onlyfans")).toBe(true);
    expect(needsModeration("Crypto giveaway! double your bitcoin")).toBe(true);
    expect(needsModeration("just kill yourself")).toBe(true);
  });
});
