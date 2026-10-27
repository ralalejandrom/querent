import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getFeed, type FeedTab } from "@/lib/queries";
import { Empty, Icon, PostCard } from "@/components/ui";
import { Rail } from "@/components/rail";

const TABS: [FeedTab, string][] = [["foryou", "For you"], ["following", "Following"], ["reviewed", "Reviewed"], ["questions", "Open questions"]];

export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "foryou") as FeedTab;
  const user = await getCurrentUser();
  // First-time visitors see the product story; the feed is one click away.
  if (!user && !sp.tab && !sp.q) redirect("/welcome");
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
        {list.length ? list.map((p) => <PostCard key={p.id} p={p} signedIn={!!user} />) : (
          <Empty title="No posts here yet">{sp.q ? "Try a different search." : tab === "following" ? "Follow people or questions to fill this feed." : "Be the first to share research."}</Empty>
        )}
      </main>
      <Rail />
    </>
  );
}
