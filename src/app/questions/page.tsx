import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getQuestions } from "@/lib/queries";
import { compact } from "@/lib/text";
import { ActionForm, Submit } from "@/components/client";
import { Empty } from "@/components/ui";
import { Rail } from "@/components/rail";
import { createQuestionAction, toggleFollowAction } from "@/app/actions";

export const metadata = { title: "Questions" };

export default async function Questions() {
  const user = await getCurrentUser();
  const [list, topics] = await Promise.all([getQuestions(user?.id ?? null), db.select().from(schema.topics).orderBy(asc(schema.topics.label))]);
  return (
    <>
      <main className="main" id="main">
        <h1 className="pg">Questions</h1>
        <p className="pgsub">Follow a question and come back to where the evidence stands now.</p>
        {user && (
          <details className="box"><summary className="btn sm">Ask a new question</summary>
            <ActionForm action={createQuestionAction}>
              <label className="f" style={{ marginTop: 12 }}>Your question <small>Phrase it so evidence could answer it.</small><textarea name="text" rows={2} maxLength={300} /></label>
              <label className="f">Topic<select name="topicId" defaultValue=""><option value="">None</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
              <Submit>Create question</Submit>
            </ActionForm>
          </details>
        )}
        {list.length ? list.map(({ q, topic, posts, followers, following }) => (
          <div className="card" key={q.id}>
            <div className="qcard"><span className="qmark">?</span>
              <div style={{ flex: 1, minWidth: 0 }}><h2><Link href={`/q/${q.slug}`}>{q.text}</Link></h2><div className="hint">{[topic, `${posts} post${posts === 1 ? "" : "s"}`, `${compact(followers)} following`].filter(Boolean).join(" · ")}</div></div>
              {user && <form action={toggleFollowAction.bind(null, "question", q.id)}><button className={`btn sm ${following ? "" : "pri"}`} aria-pressed={!!following}>{following ? "Following" : "Follow"}</button></form>}
            </div>
          </div>
        )) : <Empty title="No questions yet">Ask the first one.</Empty>}
      </main>
      <Rail />
    </>
  );
}
