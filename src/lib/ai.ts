import "server-only";
import { z } from "zod";
import { DESIGN_LABELS } from "./study";

/**
 * AI-assisted reference previews. The model only restates what the published abstract says;
 * it never decides a review label, and every preview is marked as AI-assisted in the interface.
 * Off unless ANTHROPIC_API_KEY is set.
 */
export interface AiSummary { points: string[]; design: string | null; model: string; generatedAt: string }

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export { DESIGN_LABELS };

const SYSTEM = `You write short, faithful summaries of scientific abstracts for researchers and clinicians.
Rules:
- Use only facts stated in the abstract. Never add outside knowledge, interpretation or advice.
- Keep numbers exactly as written: sample sizes, effect sizes, confidence intervals, P values, units.
- Report null, negative and uncertain results plainly. Do not make findings sound stronger than the abstract does.
- If the abstract states a limitation, include it.
- Answer with JSON only, no prose, in this shape:
{"design": one of ${Object.keys(DESIGN_LABELS).map((k) => `"${k}"`).join(", ")} or null if unclear,
 "points": 2 to 4 strings, each under 30 words: who or what was studied, the main result, other key results}`;

const Out = z.object({
  design: z.enum(Object.keys(DESIGN_LABELS) as [string, ...string[]]).nullable().catch(null),
  points: z.array(z.string().trim().min(3).max(280)).min(1).max(4),
});

export async function summarizeAbstract(input: { title: string; venue: string | null; year: number | null; abstract: string }): Promise<AiSummary | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.AI_MODEL || "claude-haiku-5-5";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 500, temperature: 0, system: SYSTEM,
        messages: [{ role: "user", content: `Title: ${input.title}\nJournal: ${input.venue ?? "unknown"}${input.year ? ` (${input.year})` : ""}\n\nAbstract:\n${input.abstract}` }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) { console.error("AI summary request failed", res.status); return null; }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = Out.safeParse(JSON.parse(json));
    if (!parsed.success) return null;
    return { points: parsed.data.points, design: parsed.data.design, model, generatedAt: new Date().toISOString() };
  } catch (err) {
    console.error("AI summary failed", err);
    return null;
  }
}
