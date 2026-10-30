import { and, eq, or, sql, type SQL, type AnyColumn } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Blocking and the content filter: the safety tools app stores require for user-generated content,
 * alongside reporting (reports table) and moderation (/moderation).
 */

/** SQL condition: the author column is not someone the viewer blocked, nor someone who blocked the viewer. */
export function notBlockedFor(viewerId: string | null | undefined, authorColumn: AnyColumn): SQL | undefined {
  if (!viewerId) return undefined;
  return sql`${authorColumn} not in (
    select ${schema.blocks.blockedId} from ${schema.blocks} where ${schema.blocks.blockerId} = ${viewerId}
    union select ${schema.blocks.blockerId} from ${schema.blocks} where ${schema.blocks.blockedId} = ${viewerId})`;
}

/** True when either person blocked the other. */
export async function blockedBetween(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const [row] = await db.select({ x: schema.blocks.blockerId }).from(schema.blocks).where(or(
    and(eq(schema.blocks.blockerId, a), eq(schema.blocks.blockedId, b)),
    and(eq(schema.blocks.blockerId, b), eq(schema.blocks.blockedId, a)),
  )).limit(1);
  return !!row;
}

/**
 * Words that hold a post or comment for a moderator before anyone sees it: slurs, explicit sexual
 * content and common spam. Matching never deletes anything; a person reviews it. Scientific terms
 * (sex differences, sexual health, anatomy) are deliberately not on the list.
 */
const HELD_PATTERNS: RegExp[] = [
  /\bn[i1!]gg(?:er|a|az|ers)\b/i,
  /\bf[a@]gg?(?:ot|ots)?\b/i,
  /\bk[i1]ke[s]?\b/i,
  /\bsp[i1]c[k]?s?\b/i,
  /\bch[i1]nks?\b/i,
  /\btr[a@]nn(?:y|ies)\b/i,
  /\bretard(?:s|ed)?\b/i,
  /\b(?:porn|xxx|onlyfans|camgirls?|nudes for sale)\b/i,
  /\b(?:buy (?:followers|likes)|crypto giveaway|double your (?:bitcoin|crypto)|casino bonus)\b/i,
  /\b(?:kill|hang|shoot) (?:yourself|urself)\b/i,
];

/** Returns true when the text should wait for a moderator. */
export function needsModeration(...texts: (string | null | undefined)[]): boolean {
  const text = texts.filter(Boolean).join("\n");
  return HELD_PATTERNS.some((re) => re.test(text));
}
