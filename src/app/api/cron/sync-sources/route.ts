import { NextResponse } from "next/server";
import { db } from "@/db";
import { syncSources } from "@/lib/source-sync";

export const maxDuration = 60;

/**
 * Daily check of cited DOIs for corrections and retractions (Vercel Cron, see vercel.json).
 * When CRON_SECRET is set, only Vercel's scheduler can call it. Either way each source is
 * re-checked at most once every 20 hours, so extra calls do no harm.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await syncSources(db, { olderThanHours: 20, limit: 150 });
  return NextResponse.json(result);
}
