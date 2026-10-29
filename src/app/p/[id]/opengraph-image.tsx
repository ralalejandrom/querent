import { ImageResponse } from "next/og";
import { getPostDetail } from "@/lib/queries";
import { DESIGN_LABELS } from "@/lib/study";

export const alt = "Post on Lyncei with its review status";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STATUS: Record<string, { bg: string; fg: string }> = {
  expert_reviewed: { bg: "#0E7A4E", fg: "#FFFFFF" },
  source_checked: { bg: "#E7F5EE", fg: "#0E7A4E" },
  source_linked: { bg: "#EEF0FF", fg: "#2B3FD8" },
  unreviewed: { bg: "#2A2736", fg: "#CFCBD6" },
  disputed: { bg: "#FDF3E2", fg: "#A15C07" },
  contested: { bg: "#FDF3E2", fg: "#A15C07" },
  concerns: { bg: "#FDECEC", fg: "#B42318" },
  retracted: { bg: "#FDECEC", fg: "#B42318" },
};

/** The card shown when a post's link is shared: title, author and its review label travel with it. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const d = await getPostDetail((await params).id, null);
  const title = d?.post.title ?? "Lyncei";
  const rigor = d?.post.rigor;
  const st = STATUS[rigor?.key ?? "unreviewed"];
  const design = d?.post.studyType ? DESIGN_LABELS[d.post.studyType] : null;
  const src = d?.post.source;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#16141F", color: "#F5F7FB", padding: "64px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30 }}>
          <div style={{ position: "relative", width: 48, height: 48, display: "flex" }}>
            <div style={{ width: 38, height: 38, borderRadius: 19, border: "6px solid #F5F7FB", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: "#F5F7FB" }} />
            </div>
            <div style={{ position: "absolute", left: 32, top: 33, width: 16, height: 6, borderRadius: 3, background: "#FF8A6B", transform: "rotate(45deg)" }} />
          </div>
          <span style={{ fontWeight: 600 }}>Lyncei</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: title.length > 90 ? 46 : 56, lineHeight: 1.12, fontWeight: 600, display: "flex" }}>{title.length > 140 ? title.slice(0, 137) + "…" : title}</div>
          <div style={{ fontSize: 26, color: "#A7A2B0", display: "flex" }}>
            {[d?.post.author.displayName, design, src?.venue && src.publishedYear ? `${src.venue} ${src.publishedYear}` : src?.venue].filter(Boolean).join("  ·  ")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: st.bg, color: st.fg, borderRadius: 999, padding: "12px 26px", fontSize: 28, fontWeight: 700 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: st.fg }} />
            {rigor?.label ?? "On Lyncei"}
          </div>
          <span style={{ fontSize: 26, color: "#A7A2B0" }}>Reviewed on lyncei.com</span>
        </div>
      </div>
    ),
    size,
  );
}
