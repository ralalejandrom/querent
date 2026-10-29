import { afterEach, describe, expect, it, vi } from "vitest";
import { summarizeAbstract } from "./ai";

const input = { title: "Dapagliflozin and kidney outcomes", venue: "JAMA Cardiology", year: 2023, abstract: "x".repeat(200) };
const reply = (text: string, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status }));

afterEach(() => { vi.unstubAllGlobals(); delete process.env.ANTHROPIC_API_KEY; });

describe("summarizeAbstract", () => {
  it("is off without an API key", async () => {
    const f = reply("{}"); vi.stubGlobal("fetch", f);
    expect(await summarizeAbstract(input)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("parses the model's JSON and keeps only allowed fields", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    vi.stubGlobal("fetch", reply('Sure: {"design":"randomized_trial","points":["6,262 patients","eGFR declined 1.4 mL/min/1.73 m² per year less"],"extra":1}'));
    const out = await summarizeAbstract(input);
    expect(out?.design).toBe("randomized_trial");
    expect(out?.points).toEqual(["6,262 patients", "eGFR declined 1.4 mL/min/1.73 m² per year less"]);
  });
  it("drops an unknown design but keeps the points", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    vi.stubGlobal("fetch", reply('{"design":"miracle","points":["Main result"]}'));
    expect((await summarizeAbstract(input))?.design).toBeNull();
  });
  it("returns null on API errors or malformed output", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    vi.stubGlobal("fetch", reply("{}", 500));
    expect(await summarizeAbstract(input)).toBeNull();
    vi.stubGlobal("fetch", reply("no json here"));
    expect(await summarizeAbstract(input)).toBeNull();
  });
});
