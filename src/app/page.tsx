import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getFeed, type FeedTab } from "@/lib/queries";
import { Empty, Icon, PostCard, ReelCard } from "@/components/ui";
import { Rail } from "@/components/rail";

const TABS: [FeedTab, string][] = [["foryou", "For you"], ["videos", "Videos"], ["following", "Following"], ["reviewed", "Reviewed"], ["questions", "Open questions"]];

export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "foryou") as FeedTab;
  const user = await getCurrentUser();
  // First-time visitors see the product story (in the iOS app, a short welcome screen); the feed is one tap away.
  if (!user && !sp.tab && !sp.q) redirect(((await headers()).get("user-agent") ?? "").includes("LynceiApp") ? "/start" : "/welcome");
  const list = await getFeed(user?.id ?? null, tab, sp.q);
  const href = (t: string) => `/?tab=${t}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`;
  return (
    <>
      <main className="main" id="main">
        <form className="topbar" action="/" role="search">
          <input type="hidden" name="tab" value={tab} />
          <label className="search"><Icon name="search" /><span className="sr">Search</span><input type="text" name="q" defaultValue={sp.q ?? ""} placeholder="Search studies, topics, people…" /></label>
        </form>
        {!user && <div className="notice">You're browsing as a guest. <Link href="/login">Sign in</Link> to post, react, review and follow questions.</div>}
        <nav className="tabs" aria-label="Feed">
          {TABS.map(([k, l]) => <Link key={k} href={href(k)} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined}>{l}</Link>)}
        </nav>
        {tab === "videos" && list.length > 0 ? (
          <div className="reels">{list.map((p) => <ReelCard key={p.id} p={p} />)}</div>
        ) : list.length ? list.map((p) => <PostCard key={p.id} p={p} signedIn={!!user} />) : (
          <Empty title={tab === "videos" ? "No videos yet" : "No posts here yet"}>
            {sp.q ? "Try a different search." : tab === "following" ? "Follow people or questions to fill this feed." : tab === "videos" ? <>Explain a study in under three minutes. <Link href="/new">Post a video</Link>.</> : "Be the first to share research."}
          </Empty>
        )}
      </main>
      <Rail />
    </>
  );
}
