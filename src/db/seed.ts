/**
 * Development seed. All people and studies are fictional and use example.com emails
 * and the 10.5555 test DOI prefix. Never run against production.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import * as schema from "./schema";
import { databaseUrl } from "./url";

const pool = new Pool({ connectionString: databaseUrl() });
const db = drizzle(pool, { schema });
const RENAMED_DEMO_ACCOUNTS = [
  ["elenacastro", "sarahwhitfield", "Dr. Sarah Whitfield"],
  ["marcuslee", "michaelbrennan", "Dr. Michael Brennan"],
  ["amirakhalil", "rafaelgomez", "Dr. Rafael Gómez"],
  ["jonahpark", "danielhoffman", "Dr. Daniel Hoffman"],
  ["priyashah", "emilycarter", "Dr. Emily Carter"],
] as const;
/** Short animated explainers shipped in public/media/demo, attached to the demo posts with these titles. */
const DEMO_VIDEOS: Record<string, string> = {
  "Early results from a multicenter trial on SGLT2 inhibitors in heart failure with preserved ejection fraction": "/media/demo/demo-hfpef.mp4",
  "Why our sleep study surprised us": "/media/demo/demo-sleep.mp4",
};
const ago = (h: number) => new Date(Date.now() - h * 3_600_000);

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") throw new Error("Refusing to seed production. Set ALLOW_DEMO_SEED=1 for a demo deployment.");
  if (process.env.ALLOW_DEMO_SEED === "0") { console.log("ALLOW_DEMO_SEED=0; skipping seed."); return; }

  // Databases seeded before the demo cast changed: rename those fictional accounts in place.
  for (const [from, to, name] of RENAMED_DEMO_ACCOUNTS) {
    await db.update(schema.users).set({ handle: to, displayName: name, email: `${to}@example.com` }).where(eq(schema.users.email, `${from}@example.com`));
  }

  // Databases seeded before demo videos existed: attach them to the matching demo posts.
  for (const [title, mediaUrl] of Object.entries(DEMO_VIDEOS)) {
    await db.update(schema.posts).set({ mediaUrl }).where(and(eq(schema.posts.title, title), isNull(schema.posts.mediaUrl)));
  }

  // Example reviews get the author ratings that real reviews receive, so the examples show how usefulness and revisions appear.
  await db.execute(sql`update reviews r set helpfulness = 4, author_rated_at = now()
    from users rv, posts p, users a
    where r.helpfulness is null and r.status = 'completed' and rv.id = r.reviewer_id and p.id = r.post_id and a.id = p.author_id
      and rv.email like '%@example.com' and a.email like '%@example.com'`);
  await db.execute(sql`update reviews r set helpfulness = 5, led_to_revision = true
    from posts p where p.id = r.post_id and r.type = 'statistical' and r.led_to_revision = false
      and p.title = 'Early results from a multicenter trial on SGLT2 inhibitors in heart failure with preserved ejection fraction'`);

  const [{ n }] = await db.select({ n: count() }).from(schema.users);
  if (Number(n) > 0) { console.log("Database already has users; skipping seed."); return; }

  const topics = await db.insert(schema.topics).values(
    ["Cardiology", "Oncology", "Neuroscience", "Metabolism", "Methodology", "Epidemiology"].map((label) => ({ label, slug: label.toLowerCase() })),
  ).returning();
  const T = Object.fromEntries(topics.map((t) => [t.label, t.id]));

  const people = [
    ["admin", "Lyncei Admin", "Platform team", "Runs moderation and reviewer verification in development.", ""],
    ["sarahwhitfield", "Dr. Sarah Whitfield", "Cardiology", "Clinician-scientist studying heart failure therapies.", "Trial follow-up in HFpEF."],
    ["michaelbrennan", "Dr. Michael Brennan", "Biostatistics", "Statistician. I review trial designs and meta-analyses.", "Methods for small-sample trials."],
    ["rafaelgomez", "Dr. Rafael Gómez", "Internal Medicine", "Internist and open reviewer.", "Evidence synthesis in metabolic disease."],
    ["danielhoffman", "Dr. Daniel Hoffman", "Oncology", "Thoracic oncologist posting about immunotherapy evidence.", "Neoadjuvant immunotherapy outcomes."],
    ["emilycarter", "Dr. Emily Carter", "Endocrinology", "Obesity, GLP-1 therapies and the questions they raise.", "Long-term GLP-1 adherence."],
    ["sofiamendes", "Sofia Mendes", "Neuroscience · PhD student", "PhD student in neuroimmunology.", "Microglia and memory consolidation."],
  ] as const;
  const users = await db.insert(schema.users).values(people.map(([handle, displayName, field, bio, currentWork]) => ({
    handle, displayName, field, bio, currentWork, email: `${handle}@example.com`, emailVerifiedAt: new Date(),
  }))).returning();
  const U = Object.fromEntries(users.map((u) => [u.handle, u.id]));
  await db.insert(schema.userRoles).values([
    ...users.map((u) => ({ userId: u.id, role: "member" as const })),
    { userId: U.admin, role: "platform_admin" as const }, { userId: U.admin, role: "moderator" as const }, { userId: U.admin, role: "reviewer" as const, fields: ["Methodology"] },
    ...(["sarahwhitfield", "michaelbrennan", "rafaelgomez", "danielhoffman", "emilycarter"] as const).map((h) => ({ userId: U[h], role: "reviewer" as const, fields: [people.find((p) => p[0] === h)![2]] })),
  ]);

  const questions = await db.insert(schema.questions).values([
    { slug: "sglt2-hfpef", text: "Do SGLT2 inhibitors improve outcomes in heart failure with preserved ejection fraction?", topicId: T.Cardiology, createdBy: U.sarahwhitfield },
    { slug: "neoadjuvant-io-nsclc", text: "Does neoadjuvant immunotherapy improve survival in early-stage NSCLC?", topicId: T.Oncology, createdBy: U.danielhoffman },
    { slug: "sleep-memory", text: "Does sleep after learning improve long-term memory in adults?", topicId: T.Neuroscience, createdBy: U.sofiamendes },
  ]).returning();
  const Q = Object.fromEntries(questions.map((q) => [q.slug, q.id]));

  const src = (doi: string, title: string, venue: string, year: number) =>
    ({ doi, title: `[Demo] ${title}`, venue, publishedYear: year, sourceType: "journal-article", correctionStatus: "none_known" as const, provenance: { provider: "seed", fetchedAt: new Date().toISOString() } });
  const sources = await db.insert(schema.sources).values([
    src("10.5555/demo.hfpef.2026", "SGLT2 inhibition in heart failure with preserved ejection fraction: a multicenter trial", "Demo Journal of Cardiology", 2026),
    src("10.5555/demo.nsclc.2026", "Neoadjuvant immunotherapy in resectable NSCLC: an updated meta-analysis", "Demo Oncology Reviews", 2026),
    src("10.5555/demo.sleep.2026", "Sleep-dependent consolidation of declarative memory in adults", "Demo Preprints", 2026),
  ]).returning();
  const S = Object.fromEntries(sources.map((s) => [s.doi!, s.id]));

  const posts = await db.insert(schema.posts).values([
    { authorId: U.sarahwhitfield, kind: "video", title: "Early results from a multicenter trial on SGLT2 inhibitors in heart failure with preserved ejection fraction", body: "The trial reports a reduction in the composite primary outcome. Here's what was measured, who was included, and the limits to keep in mind before changing practice.", topicId: T.Cardiology, questionId: Q["sglt2-hfpef"], sourceId: S["10.5555/demo.hfpef.2026"], mediaUrl: "/media/demo/demo-hfpef.mp4", createdAt: ago(3) },
    { authorId: U.danielhoffman, kind: "visual", title: "Updated meta-analysis on neoadjuvant immunotherapy in early-stage NSCLC", body: "Event-free survival improves across trials; overall survival data are still maturing.", topicId: T.Oncology, questionId: Q["neoadjuvant-io-nsclc"], sourceId: S["10.5555/demo.nsclc.2026"], createdAt: ago(6) },
    { authorId: U.sofiamendes, kind: "behind_the_paper", title: "Why our sleep study surprised us", body: "We expected sleep to help every kind of memory. It didn't. Here's the story of the experiment and what we think is really going on.", topicId: T.Neuroscience, questionId: Q["sleep-memory"], sourceId: S["10.5555/demo.sleep.2026"], mediaUrl: "/media/demo/demo-sleep.mp4", createdAt: ago(10) },
    { authorId: U.emilycarter, kind: "open_question", title: "Open question: how should we measure long-term adherence to GLP-1 therapy?", body: "Trials run for a few years, but patients may take these drugs for decades. What outcome measures would actually tell us about long-term adherence?", topicId: T.Metabolism, createdAt: ago(20) },
  ]).returning();
  const [p1, p2, p3] = posts;

  await db.insert(schema.reviews).values([
    { postId: p1.id, reviewerId: U.rafaelgomez, type: "methodological", status: "completed", recommendation: "Sound", summary: "Randomized, double-blind design appropriate for the question. Primary outcome prespecified. Attrition balanced between arms.", checklist: { "Design is appropriate for the question": true, "Outcomes were prespecified": true }, ratings: { rigor: "High", bias: "Low", relevance: "Moderate", reproducibility: "Pending further evidence" }, conflicts: "None declared", postVersion: 1, completedAt: ago(2) },
    { postId: p1.id, reviewerId: U.michaelbrennan, type: "statistical", status: "completed", recommendation: "Sound with caveats", summary: "Analysis follows the registered plan. The subgroup by ejection fraction should be read as exploratory; no multiplicity correction was applied.", checklist: { "Analysis matches the prespecified plan": true, "Effect sizes come with confidence intervals": true }, conflicts: "None declared", postVersion: 1, completedAt: ago(1.5) },
    { postId: p2.id, reviewerId: U.michaelbrennan, type: "methodological", status: "completed", recommendation: "Sound", summary: "Search strategy is comprehensive and heterogeneity is explored appropriately.", checklist: { "Design is appropriate for the question": true, "Risk of bias is addressed": true }, ratings: { rigor: "High", bias: "Moderate", relevance: "High", reproducibility: "Data available" }, conflicts: "None declared", postVersion: 1, completedAt: ago(4) },
    { postId: p2.id, reviewerId: U.rafaelgomez, type: "statistical", status: "in_progress", conflicts: "None declared", postVersion: 1 },
    { postId: p3.id, reviewerId: U.michaelbrennan, type: "source_fidelity", status: "completed", recommendation: "Faithful to source", summary: "The post represents the preprint accurately and states that it has not been peer-reviewed by a journal.", checklist: { "The post states the study's main finding accurately": true, "Limitations mentioned in the paper are not omitted": true }, conflicts: "None declared", postVersion: 1, completedAt: ago(8) },
  ]);

  const [c1] = await db.insert(schema.contributions).values({ postId: p1.id, authorId: U.emilycarter, type: "interpretation", body: "These findings are consistent with previous studies, but heterogeneity across patient populations matters here.", createdAt: ago(2) }).returning();
  await db.insert(schema.contributions).values([
    { postId: p1.id, parentId: c1.id, authorId: U.sofiamendes, type: "question", body: "Is there any data on patients over 75?", createdAt: ago(1) },
    { postId: p3.id, authorId: U.rafaelgomez, type: "objection", body: "Effect sizes shrink in the two preregistered experiments. Worth separating those from the exploratory ones.", createdAt: ago(7) },
  ]);
  await db.insert(schema.reactions).values([
    ...users.slice(1).map((u) => ({ userId: u.id, postId: p1.id, kind: "like" as const })),
    { userId: U.michaelbrennan, postId: p3.id, kind: "insightful" as const }, { userId: U.emilycarter, postId: p3.id, kind: "like" as const },
  ]);
  await db.insert(schema.follows).values([
    { userId: U.sofiamendes, targetType: "question", targetId: Q["sleep-memory"] },
    { userId: U.sarahwhitfield, targetType: "question", targetId: Q["sglt2-hfpef"] },
    { userId: U.emilycarter, targetType: "question", targetId: Q["sglt2-hfpef"] },
    { userId: U.sofiamendes, targetType: "user", targetId: U.rafaelgomez },
  ]);
  console.log("Seeded demo data. Sign in as admin@example.com (moderator + reviewer) or any <handle>@example.com.");
}

main().then(() => pool.end()).catch((e) => { console.error(e); pool.end(); process.exit(1); });
