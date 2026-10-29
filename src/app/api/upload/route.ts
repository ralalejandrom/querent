import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { VIDEO_MAX_BYTES, VIDEO_TYPES } from "@/lib/media";

/**
 * Issues short-lived tokens so signed-in members can upload a video straight from the browser
 * to Lyncei's storage (Vercel Blob). Only video files, under 200 MB, into videos/.
 */
export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Video storage isn't set up yet." }, { status: 503 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getCurrentUser();
        if (!user) throw new Error("Sign in to upload a video.");
        if (!pathname.startsWith("videos/")) throw new Error("Invalid upload path.");
        return {
          allowedContentTypes: VIDEO_TYPES,
          maximumSizeInBytes: VIDEO_MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed." }, { status: 400 });
  }
}
