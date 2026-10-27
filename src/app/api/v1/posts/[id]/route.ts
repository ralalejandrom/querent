import { NextResponse } from "next/server";
import { getPostDetail } from "@/lib/queries";

/** Public post record with its rigor label and signed reviews. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = await getPostDetail((await params).id, null);
  if (!d) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { post, reviews } = d;
  return NextResponse.json({
    data: {
      id: post.id, kind: post.kind, title: post.title, body: post.body, createdAt: post.createdAt,
      author: { handle: post.author.handle, name: post.author.displayName },
      source: post.source, question: post.question,
      reach: { likes: post.likes, insightful: post.insightful, comments: post.commentCount },
      rigor: post.rigor,
      reviews: reviews.filter((r) => r.review.status === "completed").map(({ review: r, reviewer }) => ({
        type: r.type, recommendation: r.recommendation, summary: r.summary, conflicts: r.conflicts,
        reviewer: r.isSigned ? { handle: reviewer.handle, name: reviewer.displayName } : null, completedAt: r.completedAt,
      })),
    },
  });
}
