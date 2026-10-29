import type { ReactNode } from "react";

export const LEGAL_UPDATED = "October 29, 2026";

/** Contact line for legal pages; shown only when CONTACT_EMAIL is set. */
export function ContactLine({ children }: { children: ReactNode }) {
  const email = process.env.CONTACT_EMAIL;
  if (!email) return null;
  return <p>{children} <a href={`mailto:${email}`}>{email}</a>.</p>;
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="main legal" id="main" style={{ maxWidth: 760 }}>
      <h1 className="pg">{title}</h1>
      <p className="pgsub">Last updated {LEGAL_UPDATED}</p>
      {children}
    </main>
  );
}
