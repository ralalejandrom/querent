import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import "./globals.css";
import { db, schema } from "@/db";
import { getCurrentUser, isModerator } from "@/lib/auth";
import { Icon, Mark } from "@/components/ui";
import { NavLink } from "@/components/client";
import { signOutAction } from "./actions";

export const metadata: Metadata = {
  title: { default: "Querent", template: "%s · Querent" },
  description: "The social network where every post can be peer-reviewed.",
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=Public+Sans:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>
        <div className="mtop">
          <Link className="brand" href="/"><Mark size={30} />QUERENT</Link>
          {user ? <Link className="btn sm" href="/notifications" aria-label="Notifications"><Icon name="bell" />{unread > 0 && unread}</Link> : <Link className="btn sm pri" href="/login">Sign in</Link>}
        </div>
        <div className="shell">
          <aside className="side" aria-label="Main navigation">
            <Link className="brand" href="/"><Mark />QUERENT</Link>
            <nav style={{ display: "grid", gap: 4 }}>
              <NavLink href="/" exact><Icon name="home" />Home</NavLink>
              <NavLink href="/questions"><Icon name="q" />Questions</NavLink>
              <NavLink href="/reviews"><Icon name="review" />Reviews</NavLink>
              {user && <NavLink href="/library"><Icon name="book" />My Library</NavLink>}
              {user && <NavLink href="/notifications"><Icon name="bell" />Notifications{unread > 0 && <span className="ct">{unread}</span>}</NavLink>}
              {user && <NavLink href={`/u/${user.handle}`}><Icon name="user" />Profile</NavLink>}
              {isModerator(user) && <NavLink href="/moderation"><Icon name="shield" />Moderation</NavLink>}
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
        <nav className="dock" aria-label="Mobile navigation">
          <NavLink href="/" exact className=""><Icon name="home" />Home</NavLink>
          <NavLink href="/questions" className=""><Icon name="q" />Questions</NavLink>
          <Link className="plus" href="/new" aria-label="Create post"><Icon name="plus" /></Link>
          <NavLink href="/reviews" className=""><Icon name="review" />Reviews</NavLink>
          <NavLink href={user ? `/u/${user.handle}` : "/login"} className=""><Icon name="user" />{user ? "Profile" : "Sign in"}</NavLink>
        </nav>
      </body>
    </html>
  );
}
