import { describe, expect, it } from "vitest";
import { isOurVideoUrl } from "./media";

describe("isOurVideoUrl", () => {
  it("accepts videos uploaded to Lyncei's Blob store", () => {
    expect(isOurVideoUrl("https://abc123.public.blob.vercel-storage.com/videos/trial-x7Yz.mp4")).toBe(true);
  });
  it("rejects other hosts, paths and schemes", () => {
    expect(isOurVideoUrl("https://evil.example.com/videos/a.mp4")).toBe(false);
    expect(isOurVideoUrl("https://abc.public.blob.vercel-storage.com.evil.com/videos/a.mp4")).toBe(false);
    expect(isOurVideoUrl("https://abc.public.blob.vercel-storage.com/other/a.mp4")).toBe(false);
    expect(isOurVideoUrl("http://abc.public.blob.vercel-storage.com/videos/a.mp4")).toBe(false);
    expect(isOurVideoUrl("javascript:alert(1)")).toBe(false);
    expect(isOurVideoUrl("not a url")).toBe(false);
  });
});
