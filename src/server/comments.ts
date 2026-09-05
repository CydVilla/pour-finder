import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, contributors, deals, type Comment, type CommentSignal } from "@/db/schema";
import { evaluateDealEscalation, evaluateVenueEscalation } from "./escalation";

/**
 * Venue comments, PlugShare-style.
 *
 * Two design choices worth stating:
 *
 * 1. The "is it still there?" signal is an explicit choice in the UI, not
 *    something inferred from prose. Keyword-sniffing "no longer" out of free
 *    text is unreliable in exactly the cases that matter ("no longer $5, it's
 *    $4 now" is good news), and acting on a bad inference means delisting a
 *    real deal.
 *
 * 2. The keyword scan below is therefore a *secondary* signal only: when the
 *    prose looks negative but the chosen signal was neutral, the comment is
 *    flagged `needsReview` for a moderator. It never escalates on its own.
 */

export interface PostCommentInput {
  venueId: string;
  dealId?: string | null;
  body: string;
  signal: CommentSignal;
  reportedPriceCents?: number | null;
  displayName?: string | null;
  submitterHash: string;
}

export interface PostCommentResult {
  comment: CommentDTO;
  escalated: boolean;
  message: string;
}

export interface CommentDTO {
  id: string;
  venueId: string;
  dealId: string | null;
  body: string;
  signal: CommentSignal;
  reportedPriceCents: number | null;
  displayName: string | null;
  createdAt: string;
  helpfulCount: number;
  /** True for comments written by the current requester, so the UI can say so. */
  isMine?: boolean;
}

/** Phrases that suggest a deal is gone, used only to flag for human review. */
const NEGATIVE_HINTS = [
  "no longer",
  "not anymore",
  "isn't there",
  "isnt there",
  "gone",
  "discontinued",
  "ended",
  "closed",
  "shut down",
  "went up",
  "raised the price",
  "not true",
  "false",
];

export async function postComment(input: PostCommentInput): Promise<PostCommentResult> {
  const body = input.body.trim();

  const lowered = body.toLowerCase();
  const looksNegative = NEGATIVE_HINTS.some((hint) => lowered.includes(hint));
  const needsReview = looksNegative && (input.signal === "none" || input.signal === "still_good");

  const [row] = await db
    .insert(comments)
    .values({
      venueId: input.venueId,
      dealId: input.dealId ?? null,
      body,
      signal: input.signal,
      reportedPriceCents: input.reportedPriceCents ?? null,
      displayName: input.displayName?.trim() || null,
      submitterHash: input.submitterHash,
      needsReview,
    })
    .returning();

  if (!row) throw new Error("Failed to save comment");

  await db
    .insert(contributors)
    .values({ submitterHash: input.submitterHash, submissionCount: 1 })
    .onConflictDoUpdate({
      target: contributors.submitterHash,
      set: { submissionCount: sql`${contributors.submissionCount} + 1`, lastSeenAt: new Date() },
    });

  // A "still good" comment doubles as a confirmation of freshness. It does not
  // touch verificationCount (that has its own one-per-day dedupe); it only
  // moves the clock forward, and only ever forward.
  if (input.signal === "still_good" && input.dealId) {
    await db
      .update(deals)
      .set({ lastVerifiedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(deals.id, input.dealId),
          sql`(${deals.lastVerifiedAt} IS NULL OR ${deals.lastVerifiedAt} < now())`,
        ),
      );
  }

  let escalated = false;
  if (input.signal === "no_longer_available" || input.signal === "price_changed") {
    if (input.dealId) {
      const outcome = await evaluateDealEscalation(input.dealId);
      escalated = outcome.escalated;
    }
  } else if (input.signal === "venue_closed") {
    const outcome = await evaluateVenueEscalation(input.venueId);
    escalated = outcome.escalated;
  }

  return {
    comment: toDTO(row, true),
    escalated,
    message: escalated
      ? "Thanks — enough people have flagged this that it's now queued for review."
      : input.signal === "none"
        ? "Thanks for the note."
        : "Thanks — that's recorded.",
  };
}

export async function listComments(
  venueId: string,
  options: { dealId?: string; limit?: number; viewerHash?: string } = {},
): Promise<CommentDTO[]> {
  const rows = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.venueId, venueId),
        eq(comments.status, "visible"),
        options.dealId ? eq(comments.dealId, options.dealId) : undefined,
      ),
    )
    .orderBy(desc(comments.createdAt))
    .limit(Math.min(options.limit ?? 30, 100));

  return rows.map((row) => toDTO(row, row.submitterHash === options.viewerHash));
}

/** Comment counts for a set of venues, for the "12 comments" line on a card. */
export async function commentCountsForVenues(
  venueIds: readonly string[],
): Promise<Map<string, number>> {
  if (venueIds.length === 0) return new Map();

  const rows = (await db.execute(sql`
    SELECT venue_id, COUNT(*)::int AS count
    FROM comments
    WHERE status = 'visible'
      AND venue_id = ANY(${sql`ARRAY[${sql.join(
        venueIds.map((id) => sql`${id}`),
        sql`, `,
      )}]::uuid[]`})
    GROUP BY venue_id
  `)) as unknown as { venue_id: string; count: number }[];

  return new Map(rows.map((row) => [row.venue_id, Number(row.count)]));
}

function toDTO(row: Comment, isMine: boolean): CommentDTO {
  return {
    id: row.id,
    venueId: row.venueId,
    dealId: row.dealId,
    body: row.body,
    signal: row.signal,
    reportedPriceCents: row.reportedPriceCents,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
    helpfulCount: row.helpfulCount,
    isMine,
  };
}
