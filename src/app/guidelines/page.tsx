import Link from "next/link";
import { LegalPage } from "@/components/legal";

export const metadata = { title: "Review guidelines" };

/** Version 0.1: written by the founding team as a starting point for the founding reviewers to rewrite. */
export default function Guidelines() {
  return (
    <LegalPage title="Review guidelines">
      <p>Version 0.1. The founding team wrote this draft; Lyncei's founding reviewers will rewrite it as version 1, and every later change will be dated here. The people who review set the rules they review by.</p>

      <h2>What a review on Lyncei is</h2>
      <p>A review checks one thing well: whether a post matches its source (source fidelity), whether the study's design supports its claim (methods), whether the analysis holds up (statistics), or what it means for patients (clinical relevance). It says what was checked and what wasn't. It's a professional judgment you sign or that Lyncei verifies, not a verdict on whether a finding is true.</p>

      <h2>Before you review</h2>
      <ul>
        <li>Review only in your field, and only one type of review at a time.</li>
        <li>Declare any conflict of interest first: funding, collaborations, competing work. "None" is a valid answer only when it's true.</li>
        <li>You can't review your own posts or the posts of people you work with.</li>
      </ul>

      <h2>How to write it</h2>
      <ul>
        <li>Judge the work, never the person.</li>
        <li>Be specific: name the table, the outcome, the number or the sentence you mean.</li>
        <li>Separate errors from disagreements, and say what evidence would change your mind.</li>
        <li>You may use AI tools to check language or find a reference. You remain responsible for every word, and the judgment has to be yours.</li>
      </ul>

      <h2>The author reads it first</h2>
      <p>When you finish a review, the author sees it before anyone else. It becomes public 48 hours later, or as soon as the author replies, so readers see both together. Authors can disagree; when they do, they say why, with evidence.</p>

      <h2>What the labels mean</h2>
      <ul>
        <li><b>Source-linked:</b> a source is linked; nobody has checked the interpretation yet.</li>
        <li><b>Source-checked:</b> a reviewer confirmed the post matches its source.</li>
        <li><b>Expert-reviewed:</b> the methods and the statistics were reviewed, and no reviewer found major concerns.</li>
        <li><b>Reviewers disagree:</b> reviewers reached different conclusions. Both reviews stay visible.</li>
        <li><b>Major concerns</b> or <b>Not faithful to source:</b> a reviewer found a problem serious enough to change how the post should be read.</li>
        <li><b>Disputed:</b> moderators found a problem; the reason is shown.</li>
        <li><b>Source retracted:</b> the cited paper was retracted.</li>
      </ul>
      <p>A label never sounds better than the verdicts behind it, and likes, shares and views never change it.</p>

      <h2>Quality and reputation</h2>
      <ul>
        <li>Authors rate how useful each review was and say whether it led them to change their post.</li>
        <li>A reviewer's reputation comes from that: posts their reviews improved and reviews rated useful. The number of reviews alone counts for nothing.</li>
        <li>Every public review has its own link and a citation you can put in your CV.</li>
        <li>Changing a post after a review is a sign of integrity. The post shows "Revised after review".</li>
      </ul>

      <h2>Discussion</h2>
      <ul>
        <li>Objections and corrections need evidence: a DOI or a link. Questions don't.</li>
        <li>No personal attacks, and no quoting a post to mock it.</li>
      </ul>

      <h2>Moderation and appeals</h2>
      <p>Anyone can report a post. Moderators act in steps: a note, then holding a post, then removing it, then suspending an account. When a post is marked Disputed, the reason and the full history stay visible, and the author can respond. To appeal a label or a decision, reply on the post or report it with your reasons; a moderator who wasn't involved reviews it.</p>

      <p className="hint">See also our <Link href="/terms">terms of use</Link> and <Link href="/privacy">privacy policy</Link>.</p>
    </LegalPage>
  );
}
