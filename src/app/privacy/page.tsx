import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/legal";

export const metadata = { title: "Privacy policy" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>This page explains what Lyncei collects, why, and what you can do about it. We don't sell your data and we don't show ads.</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Your account:</b> your email address, and the name, field, bio, current work and ORCID iD you choose to add.</li>
        <li><b>What you do on Lyncei:</b> your posts, videos, reviews, comments, reactions, saves and follows.</li>
        <li><b>Forms on lyncei.com:</b> what you enter when you ask for early access, apply as a reviewer or request a partnership (for example your name, email, field, institution, career stage and ORCID iD).</li>
        <li><b>Technical data:</b> a cookie that keeps you signed in, and the standard request logs our hosting provider keeps (such as IP address and browser) to run and protect the service.</li>
        <li><b>Visit counts:</b> we use Vercel Web Analytics, which counts page views without cookies and doesn't track you across other websites.</li>
      </ul>

      <h2>What's public</h2>
      <p>Your profile, posts, signed reviews and comments are public. Your email address is never shown. If you review anonymously, your name isn't shown publicly, but the Lyncei team can see who wrote the review so we can check conflicts of interest and handle reports.</p>

      <h2>How we use it</h2>
      <ul>
        <li>To run Lyncei: sign-in links, your profile, the feed and notifications.</li>
        <li>To contact you about your early access, reviewer application or partnership request.</li>
        <li>To keep reviews fair and the platform safe: conflicts of interest, moderation and abuse prevention.</li>
        <li>To understand, in aggregate, how Lyncei is used.</li>
      </ul>

      <h2>Services we use</h2>
      <ul>
        <li><b>Vercel</b> hosts the site, stores uploaded videos and counts visits.</li>
        <li><b>Neon</b> runs our database.</li>
        <li><b>Resend</b> sends our emails.</li>
        <li><b>Crossref</b> receives the DOIs you cite, to look up the paper.</li>
        <li><b>Anthropic</b> receives the public abstract of a cited paper to write an AI-assisted preview. No personal data is sent.</li>
        <li><b>Unsplash</b> serves the portrait photos of our fictional example accounts.</li>
      </ul>
      <p>These providers process data on our behalf and mainly store it in the United States.</p>

      <h2>Health information</h2>
      <p>Lyncei isn't designed to hold health information about patients or about you. Please don't post it. If we find information that could identify a patient, we remove it.</p>

      <h2>How long we keep it</h2>
      <p>We keep your account data while your account exists. When you delete your account, your profile and posts are removed and your email is erased. Reviews and comments stay, shown as “Deleted account”, because other people rely on the review record. Early-access and reviewer application details are kept until we've answered them, or until you ask us to remove them.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Download everything you've posted and reviewed from <Link href="/settings">Settings</Link> (“Export my data”).</li>
        <li>Delete your account from <Link href="/settings">Settings</Link>.</li>
        <li>Edit or remove your profile details at any time.</li>
      </ul>

      <h2>Children</h2>
      <p>Lyncei is for people aged 18 and over.</p>

      <h2>Changes</h2>
      <p>We'll update this policy as Lyncei grows and change the date at the top when we do.</p>

      <ContactLine>For privacy requests, write to</ContactLine>
    </LegalPage>
  );
}
