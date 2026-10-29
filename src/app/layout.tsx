import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import { and, count, eq, isNull } from "drizzle-orm";
import "./globals.css";
import { db, schema } from "@/db";
import { getCurrentUser, isModerator } from "@/lib/auth";
import { Icon, Mark } from "@/components/ui";
import { NavLink } from "@/components/client";
import { signOutAction } from "./actions";

const TAGLINE = "The future of science, reviewed in the open";
const PITCH = "The social network for science, with expert review built in. Share research, follow the questions you care about, and see what experts think.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || process.env.APP_URL || "https://lyncei.com"),
  title: { default: `Lyncei | ${TAGLINE}`, template: "%s · Lyncei" },
  description: PITCH,
  openGraph: { type: "website", siteName: "Lyncei", title: `Lyncei | ${TAGLINE}`, description: PITCH, images: [{ url: "/og.png", width: 1200, height: 630, alt: `Lyncei | ${TAGLINE}.` }] },
  twitter: { card: "summary_large_image", title: `Lyncei | ${TAGLINE}`, description: PITCH, images: ["/og.png"] },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const unread = user
    ? Number((await db.select({ n: count() }).from(schema.notifications).where(and(eq(schema.notifications.recipientId, user.id), isNull(schema.notifications.readAt))))[0]?.n ?? 0)
    : 0;

  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/dm-sans-var.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <div className="mtop">
          <Link className="brand" href="/"><Mark size={28} /><span className="word">Lyncei</span></Link>
          {user ? <div className="mtop-acts"><Link className="btn sm" href="/notifications" aria-label="Notifications"><Icon name="bell" />{unread > 0 && unread}</Link><Link className="btn sm" href="/settings" aria-label="Settings and sign out"><Icon name="settings" /></Link></div> : <Link className="btn sm pri" href="/login">Sign in</Link>}
        </div>
        {process.env.DEMO_LOGIN === "1" && <div className="notice" style={{ margin: 0, borderRadius: 0, textAlign: "center" }}>Demo version of Lyncei. People, studies and DOIs are fictional; anyone can sign in to the demo accounts.</div>}
        <div className="shell">
          <aside className="side" aria-label="Main navigation">
            <Link className="brand" href="/"><Mark /><span className="word">Lyncei</span></Link>
            <nav style={{ display: "grid", gap: 4 }}>
              <NavLink href="/?tab=foryou" exact><Icon name="home" />Home</NavLink>
              <NavLink href="/questions"><Icon name="q" />Questions</NavLink>
              <NavLink href="/reviews"><Icon name="review" />Reviews</NavLink>
              {user && <NavLink href="/library"><Icon name="book" />My Library</NavLink>}
              {user && <NavLink href="/notifications"><Icon name="bell" />Notifications{unread > 0 && <span className="ct">{unread}</span>}</NavLink>}
              {user && <NavLink href={`/u/${user.handle}`}><Icon name="user" />Profile</NavLink>}
              {isModerator(user) && <NavLink href="/moderation"><Icon name="shield" />Moderation</NavLink>}
              {user?.roles.has("platform_admin") && <NavLink href="/admin"><Icon name="user" />Sign-ups</NavLink>}
            </nav>
            <Link className="create" href="/new"><Icon name="plus" />Create post</Link>
            <div className="sidefoot">
              {user ? (
                <>
                  <div><b>{user.displayName}</b><div className="hint">{user.roles.has("reviewer") ? "Verified reviewer" : "Member"}</div></div>
                  <div className="row">
                    <Link className="btn sm" href="/settings"><Icon name="settings" />Settings</Link>
                    <form action={signOutAction}><button className="btn sm">Sign out</button></form>
                  </div>
                </>
              ) : (
                <Link className="btn pri" href="/login" style={{ justifyContent: "center" }}>Sign in</Link>
              )}
            </div>
          </aside>
          {children}
        </div>
        <footer className="appfoot">Lyncei is for discussing research, not medical advice. Never post anything that could identify a patient. <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link></footer>
        <nav className="dock" aria-label="Mobile navigation">
          <NavLink href="/?tab=foryou" exact className=""><Icon name="home" />Home</NavLink>
          <NavLink href="/questions" className=""><Icon name="q" />Questions</NavLink>
          <Link className="plus" href="/new" aria-label="Create post"><Icon name="plus" /></Link>
          <NavLink href="/reviews" className=""><Icon name="review" />Reviews</NavLink>
          <NavLink href={user ? `/u/${user.handle}` : "/login"} className=""><Icon name="user" />{user ? "Profile" : "Sign in"}</NavLink>
        </nav>
        {/* Vercel Web Analytics: cookie-free, aggregate page views. Active once enabled in the Vercel project. */}
        <Script src="/_vercel/insights/script.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
