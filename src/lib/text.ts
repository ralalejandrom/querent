export function slugify(input: string, max = 80): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

export function timeAgo(date: Date, now = new Date()): string {
  const m = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

export function compact(n: number): string {
  if (n < 1000) return String(n);
  return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
}

export function initials(name: string): string {
  return name.split(/\s+/).filter((w) => /[A-Za-z]/.test(w[0] ?? "") && !/^dr\.?$/i.test(w)).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}
