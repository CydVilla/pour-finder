import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contributors, dealVerifications, deals } from "@/db/schema";
import { freshnessFromDays, daysSince } from "@/lib/freshness";
import type { VerifyResult } from "@/lib/types";
import { dayBucket } from "./identity";

/**
 * "Still available" / "No longer available".
 *
 * Deliberate policy decisions:
 *
 *  1. Verifications apply IMMEDIATELY rather than entering the moderation
 *     queue. They are low-risk, reversible, and the whole point is that the
 *     freshness badge reflects reality within seconds of someone tapping it.
 *
 *  2. A vote is recorded against the price it saw (`verifiedPriceCents`). When
 *     a price later changes, the old consensus stops counting - otherwise a
 *     deal that quietly went from $1 to $3 would inherit "confirmed by 12
 *     people" for a number nobody confirmed.
 *
 *  3. Disputes NEVER auto-delist a deal. That would hand any competitor a
 *     delete button for three taps from three IPs. Disputes lower confidence,
 *     surface a warning to readers, and sort the moderation queue. A human
 *     ends the deal.
 */
export async function recordVerification(input: {
  dealId: string;
  result: "still_available" | "no_longer_available" | "price_changed";
  submitterHash: string;
  note?: string | null;
  reportedPriceCents?: number | null;
}): Promise<VerifyResult | { ok: false; reason: "not_found" | "already_voted" }> {
  const bucket = dayBucket();

  return db.transaction(async (tx) => {
    const [deal] = await tx.select().from(deals).where(eq(deals.id, input.dealId)).limit(1);
    if (!deal) return { ok: false as const, reason: "not_found" as const };

    const inserted = await tx
      .insert(dealVerifications)
      .values({
        dealId: input.dealId,
        result: input.result,
        verifiedPriceCents: deal.priceCents,
        reportedPriceCents: input.reportedPriceCents ?? null,
        submitterHash: input.submitterHash,
        note: input.note ?? null,
        dayBucket: bucket,
      })
      // The unique index is the real defence: one vote per person per deal per
      // day. Silently doing nothing beats a 409 the user can't act on.
      .onConflictDoNothing({
        target: [dealVerifications.dealId, dealVerifications.submitterHash, dealVerifications.dayBucket],
      })
      .returning({ id: dealVerifications.id });

    const isDuplicate = inserted.length === 0;

    const counts = await recomputeCounts(tx, input.dealId, deal.priceCents);

    await tx
      .insert(contributors)
      .values({ submitterHash: input.submitterHash, verificationCount: 1 })
      .onConflictDoUpdate({
        target: contributors.submitterHash,
        set: {
          verificationCount: sql`${contributors.verificationCount} + 1`,
          lastSeenAt: new Date(),
        },
      });

    const days = daysSince(counts.lastVerifiedAt);

    if (isDuplicate) {
      return {
        ok: true as const,
        dealId: input.dealId,
        verificationCount: counts.verificationCount,
        disputeCount: counts.disputeCount,
        lastVerifiedAt: counts.lastVerifiedAt?.toISOString() ?? null,
        freshness: freshnessFromDays(days),
        message: "You already weighed in on this one today — thanks!",
      };
    }

    return {
      ok: true as const,
      dealId: input.dealId,
      verificationCount: counts.verificationCount,
      disputeCount: counts.disputeCount,
      lastVerifiedAt: counts.lastVerifiedAt?.toISOString() ?? null,
      freshness: freshnessFromDays(days),
      message:
        input.result === "still_available"
          ? "Thanks — marked as confirmed."
          : "Thanks — flagged for review. It stays listed until a moderator checks.",
    };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Recomputes denormalized counters from the verification log, scoped to the
 * deal's CURRENT price. Recomputing (rather than incrementing) means a
 * moderator discarding a bogus vote self-heals the counters on the next write.
 */
async function recomputeCounts(
  tx: Tx,
  dealId: string,
  currentPriceCents: number,
): Promise<{ verificationCount: number; disputeCount: number; lastVerifiedAt: Date | null }> {
  const [row] = await tx
    .select({
      confirms: sql<number>`count(*) FILTER (
        WHERE ${dealVerifications.result} = 'still_available'
      )::int`,
      disputes: sql<number>`count(*) FILTER (
        WHERE ${dealVerifications.result} IN ('no_longer_available', 'price_changed', 'venue_closed')
      )::int`,
      lastConfirmedAt: sql<Date | null>`max(${dealVerifications.createdAt}) FILTER (
        WHERE ${dealVerifications.result} = 'still_available'
      )`,
    })
    .from(dealVerifications)
    .where(
      and(
        eq(dealVerifications.dealId, dealId),
        eq(dealVerifications.isDiscarded, false),
        // Only votes cast against the current price vouch for it.
        eq(dealVerifications.verifiedPriceCents, currentPriceCents),
      ),
    );

  const verificationCount = row?.confirms ?? 0;
  const disputeCount = row?.disputes ?? 0;
  const lastConfirmedAt = row?.lastConfirmedAt ? new Date(row.lastConfirmedAt) : null;

  const [existing] = await tx
    .select({ lastVerifiedAt: deals.lastVerifiedAt })
    .from(deals)
    .where(eq(deals.id, dealId))
    .limit(1);

  // Never move lastVerifiedAt backwards: a seeded menu date can be newer than
  // the first community confirmation.
  const lastVerifiedAt =
    lastConfirmedAt && (!existing?.lastVerifiedAt || lastConfirmedAt > existing.lastVerifiedAt)
      ? lastConfirmedAt
      : (existing?.lastVerifiedAt ?? null);

  await tx
    .update(deals)
    .set({ verificationCount, disputeCount, lastVerifiedAt, updatedAt: new Date() })
    .where(eq(deals.id, dealId));

  return { verificationCount, disputeCount, lastVerifiedAt };
}
