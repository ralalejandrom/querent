import { NextResponse } from "next/server";
import { getQuestions } from "@/lib/queries";

export async function GET() {
  const rows = await getQuestions(null);
  return NextResponse.json({
    data: rows.map(({ q, topic, posts, followers }) => ({ id: q.id, slug: q.slug, text: q.text, topic, posts, followers, createdAt: q.createdAt })),
  });
}
