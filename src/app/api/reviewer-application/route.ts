import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { notifyAdmins } from "@/lib/notify";

/**
 * "Apply as a founding reviewer" form on the public landing page (/welcome).
 * Responds 201 when a new application was saved, 200 when this email already applied,
 * and an error status otherwise, so the page only reports success after a real write.
 */
const ORCID = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
const Body = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().max(254).email(),
  field: z.string().trim().min(2).max(120),
  institution: z.string().trim().min(2).max(200),
  careerStage: z.enum(["phd_student", "postdoc", "faculty", "clinician", "industry", "other"]),
  orcid: z
    .string()
    .trim()
    .max(60)
    .transform((v) => v.replace(/^https?:\/\/(www\.)?orcid\.org\//i, "").toUpperCase())
    .refine((v) => v === "" || ORCID.test(v), "orcid")
    .optional(),
  reviewsPerMonth: z.coerce.number().int().min(1).max(10),
  website: z.string().max(500).optional(), // honeypot: real people leave it empty
});

// Best-effort throttle per IP within one server instance.
const hits = new Map<string, number[]>();
function throttled(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 6;
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (throttled(ip)) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });

  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json({ error: "invalid_input", field: typeof field === "string" ? field : null }, { status: 400 });
  }
  const d = parsed.data;
  if (d.website) return NextResponse.json({ status: "added" }, { status: 201 }); // drop bots quietly

  try {
    const rows = await db.insert(schema.reviewerApplications)
      .values({
        name: d.name, email: d.email, field: d.field, institution: d.institution,
        careerStage: d.careerStage, orcidId: d.orcid || null, reviewsPerMonth: d.reviewsPerMonth,
      })
      .onConflictDoNothing()
      .returning({ id: schema.reviewerApplications.id });
    if (rows.length) {
      notifyAdmins(`Lyncei: founding reviewer application from ${d.name} (${d.field})`, [
        `Name: ${d.name}`, `Email: ${d.email}`, `Field: ${d.field}`, `Institution: ${d.institution}`,
        `Career stage: ${d.careerStage.replace("_", " ")}`, `ORCID: ${d.orcid || "not given"}`, `Reviews per month: ${d.reviewsPerMonth}`]);
    }
    return rows.length
      ? NextResponse.json({ status: "added" }, { status: 201 })
      : NextResponse.json({ status: "exists" }, { status: 200 });
  } catch (err) {
    console.error("reviewer application insert failed", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
