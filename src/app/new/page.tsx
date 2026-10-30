import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, DoiHint, Submit, VideoUpload } from "@/components/client";
import { Icon, KIND_LABELS } from "@/components/ui";
import { createPostAction } from "@/app/actions";
import { DESIGN_LABELS } from "@/lib/study";
import { VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS, VIDEO_TYPES } from "@/lib/media";

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
          <div className="f"><span>Video <small>Required for a video explainer. Optional for other formats.</small></span><VideoUpload maxSeconds={VIDEO_MAX_SECONDS} maxBytes={VIDEO_MAX_BYTES} types={VIDEO_TYPES} /></div>
          <label className="f">Credit for the video or images <small>Optional. Who made them, or the paper a figure comes from. Leave empty if everything is your own.</small><input type="text" name="mediaCredit" maxLength={300} placeholder="e.g. Figure 2 from Smith et al. 2025, CC BY 4.0" /></label>
          <label className="f">Title<input type="text" name="title" maxLength={200} placeholder="What did the study find?" required /></label>
          <label className="f">What you want to share<textarea name="body" rows={6} maxLength={5000} placeholder="Explain the finding and who was studied." /></label>
          <label className="f">What this doesn't show <small>Required when you cite a study. The caveats a short video has no room for: sample, design, what it can't prove.</small><textarea name="limitations" rows={3} maxLength={1500} placeholder="e.g. 120 adults in one city, followed for 8 weeks. It shows an association, not that X causes Y." /></label>
          <label className="f">Source DOI <small>Required for research claims. Leave empty only for an open question or opinion.</small><input type="text" name="doi" placeholder="10.1000/xyz123 or https://doi.org/…" /></label>
          <label className="f">Study design <small>Helps readers judge how strong the evidence is. Reviewers can correct it.</small><select name="studyType" defaultValue=""><option value="">Not a study / not sure</option>{Object.entries(DESIGN_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <DoiHint />
          <div className="grid2">
            <label className="f">Topic<select name="topicId" defaultValue=""><option value="">None</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <label className="f">Link to a question<select name="questionId" defaultValue={sp.q ?? ""}><option value="">None</option>{questions.map((q) => <option key={q.id} value={q.id}>{q.text.length > 70 ? q.text.slice(0, 70) + "…" : q.text}</option>)}</select></label>
          </div>
          <label className="f">Your conflicts of interest <small>Required. Being an author of the study, funding, or being paid to promote a product all count. Write “None” if you have none.</small><input type="text" name="conflicts" maxLength={500} required placeholder="None, or: I'm a co-author of this study" /></label>
          <div className="goodpractice">
            <b>Before you publish</b>
            <ul>
              <li>The title says what the study found, not more.</li>
              <li>You linked the source, so anyone can check it.</li>
              <li>You said what the study can't show.</li>
              <li>Figures and clips that aren't yours are credited.</li>
              <li>Your conflicts are declared, including any payment.</li>
            </ul>
            <span className="hint">See the <Link href="/guidelines#posting">posting guidelines</Link>.</span>
          </div>
          <div className="checks">
            <label><input type="checkbox" name="ai" /> I used AI tools to help write or edit this post</label>
            <label><input type="checkbox" name="noPatientData" required /> No patient or study participant can be identified from this post or its video</label>
          </div>
          <div className="row"><Submit>Publish</Submit></div>
        </ActionForm>
      </div>
    </main>
  );
}
