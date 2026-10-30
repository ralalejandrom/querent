import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Mark } from "@/components/ui";

export const metadata = { title: "Welcome" };

/** First screen of the iOS app for people who aren't signed in. */
export default async function Start() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="main start" id="main">
      <div className="startbox">
        <Mark size={56} />
        <h1>The future of science, <em>reviewed in the open.</em></h1>
        <p>Research you can follow, with the source attached and expert reviews you can read.</p>
        <div className="startacts">
          <Link className="btn pri lg" href="/signup">Create account</Link>
          <Link className="btn lg" href="/login">Sign in</Link>
        </div>
        <Link className="startbrowse" href="/?tab=foryou">Look around first</Link>
      </div>
    </main>
  );
}
