import Link from "next/link";
import { LegalPage } from "@/components/legal";

export const metadata = { title: "Review guidelines" };

/** Version 0.1: written by the founding team as a starting point for the founding reviewers to rewrite. */
export default function Guidelines() {
  return (
    <LegalPage title="Review guidelines">
      <p>Version 0.1. The founding team wrote this draft; Lyncei's founding reviewers will rewrite it as version 1, and every later change will be dated here. The people who review set the rules they review by.</p>

      <h2 id="posting">Posting research</h2>
      <p>A short video or a thread has little room for caveats, so Lyncei gives them their own place next to the claim.</p>
      <ul>
        <li>Make the title say what the study found, and no more.</li>
        <li>Link the source with its DOI, so anyone can check it. Only open questions and opinions go without one.</li>
        <li>Fill in “What this doesn't show”: the sample, the design, and what the study can't prove. It travels with your post in the feed.</li>
        <li>Credit figures, images and clips that aren't yours, with their source and licence.</li>
        <li>Declare your conflicts of interest: being an author of the study, funding, or being paid to promote a product or service. Posts with a declared conflict carry a “Conflict declared” label.</li>
        <li>Say when you used AI tools to write or edit a post.</li>
        <li>Never include anything that could identify a patient or study participant.</li>
      </ul>

      <h2>What a review on Lyncei is</h2>
      <p>A review checks one thing well: whether a post matches its source (source fidelity), whether the study's design supports its claim (methods), whether the analysis holds up (statistics), or what it means for patients (clinical relevance). It says what was checked and what wasn't. It's a professional judgment you sign or that Lyncei verifies, not a verdict on whether a finding is true.</p>

      <h2>Before you review</h2>
      <ul>
        <li>Review only in your field, and only one type of review at a time.</li>
        <li>Declare any conflict of interest first: funding, collaborations, competing work, and any payment for the review itself, from anyone. "None" is a valid answer only when it's true.</li>
        <li>Money never buys a verdict. When an organization commissions a review, it never picks the reviewer, Lyncei pays the reviewer a fee that doesn't depend on the verdict, and the sponsorship is shown on the review. Any other payment for a review, from anyone, must be declared as a conflict.</li>
        <li>You can't review your own posts or the posts of people you work with.</li>
      </ul>

      <h2>How to write it</h2>
      <ul>
        <li>Judge the work, never the person.</li>
        <li>Be specific: name the table, the outcome, the number or the sentence you mean.</li>
        <li>Separate errors from disagreements, and say what evidence would change your mind.</li>
        <li>You may use AI tools to check language or find a reference. You remain responsible for every word, and the judgment has to be yours.</li>
        <li>Every review says whether AI tools were used: not at all, only for language, or to help check. Tools that detect AI writing are unreliable, so we ask rather than guess.</li>
      </ul>

      <h2>Learning to review</h2>
      <p>Most researchers learn to review by doing it alone, with no feedback. On Lyncei, a verified reviewer can review together with a student or an early-career colleague and name them as co-reviewer.</p>
      <ul>
        <li>The co-reviewer is credited on their profile and in the review's citation, but only after they confirm. Nobody is named on a review they didn't agree to.</li>
        <li>When the lead reviewer's identity is protected, the co-reviewer's name is protected too.</li>
        <li>Co-reviews are part of the record an integrity admin looks at when someone applies to become a reviewer.</li>
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
