import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, DoiHint, Submit } from "@/components/client";
import { Icon, KIND_LABELS } from "@/components/ui";
import { createPostAction } from "@/app/actions";
import { DESIGN_LABELS } from "@/lib/study";

export const metadata = { title: "Create a post" };

export default async function NewPost({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser("/new");
  const sp = await searchParams;
  const [topics, questions] = await Promise.all([
    db.select().from(schema.topics).orderBy(asc(schema.topics.label)),
    db.select({ id: schema.questions.id, text: schema.questions.text }).from(schema.questions).orderBy(asc(schema.questions.text)),
  ]);
  return (
    <main className="main" id="main" style={{ maxWidth: 760 }}>
      <Link className="back" href="/"><Icon name="left" />Back</Link>
      <h1 className="pg">Create a post</h1>
      <p className="pgsub">Share research in a format people want to read. Link the source so others can check it and review it.</p>
      <div id="create-post">
        <ActionForm action={createPostAction}>
          <fieldset className="chips" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="hint" style={{ marginBottom: 6 }}>Format</legend>
            {Object.entries(KIND_LABELS).map(([k, l], i) => <label key={k} className="chip"><input type="radio" name="kind" value={k} defaultChecked={i === 0} />{l}</label>)}
          </fieldset>
          <label className="f">Title<input type="text" name="title" maxLength={200} placeholder="What did the study find?" required /></label>
          <label className="f">What you want to share<textarea name="body" rows={6} maxLength={5000} placeholder="Explain the finding, who was studied and the main limitations." /></label>
          <label className="f">Source DOI <small>Required for research claims. Leave empty only for an open question or opinion.</small><input type="text" name="doi" placeholder="10.1000/xyz123 or https://doi.org/…" /></label>
          <label className="f">Study design <small>Helps readers judge how strong the evidence is. Reviewers can correct it.</small><select name="studyType" defaultValue=""><option value="">Not a study / not sure</option>{Object.entries(DESIGN_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <DoiHint />
          <div className="grid2">
            <label className="f">Topic<select name="topicId" defaultValue=""><option value="">None</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <label className="f">Link to a question<select name="questionId" defaultValue={sp.q ?? ""}><option value="">None</option>{questions.map((q) => <option key={q.id} value={q.id}>{q.text.length > 70 ? q.text.slice(0, 70) + "…" : q.text}</option>)}</select></label>
          </div>
          <div className="checks"><label><input type="checkbox" name="ai" /> I used AI tools to help write or edit this post</label></div>
          <p className="hint" style={{ margin: 0 }}>Video upload arrives in the next release. For now, link your video in the text.</p>
          <div className="row"><Submit>Publish</Submit></div>
        </ActionForm>
      </div>
    </main>
  );
}
