/** Short research videos: limits shared by the upload route, the form and the post action. */
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024; // 200 MB
export const VIDEO_MAX_SECONDS = 180; // under three minutes

/** Only videos uploaded through Lyncei's own storage can be attached to a post. */
export function isOurVideoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com") && u.pathname.startsWith("/videos/");
  } catch {
    return false;
  }
}
