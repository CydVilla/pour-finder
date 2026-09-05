import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  contributors,
  dealSchedules,
  deals,
  submissions,
  venues,
  type Deal,
  type NewDeal,
  type Submission,
} from "@/db/schema";
import { buildDealDedupeKey } from "@/lib/slug";
import type { DealDetailsInput, SubmissionInput } from "@/lib/submission-schemas";
import type { SubmitResult } from "@/lib/types";
import { findDuplicateDeals, findDuplicateVenues, type DuplicateCandidate } from "./dedupe";
import { endDeal, recordDealRevision, recordVenueRevision } from "./revisions";
import { createVenue } from "./venues";

/**
 * Community write pipeline.
 *
 * Everything that changes authoritative data lands in `submissions` first, is
 * annotated with likely duplicates, and is applied only on approval. The one
 * exception is verification (see verification.ts), which is low-risk enough to
 * apply immediately.
 *
 * MODERATION_AUTO_APPROVE=true collapses the queue for a solo operator seeding
 * a new market. It is not appropriate once the site has open traffic.
 */
const autoApprove = () => process.env.MODERATION_AUTO_APPROVE === "true";

export async function createSubmission(
  input: SubmissionInput,
  submitterHash: string,
): Promise<SubmitResult> {
  const possibleDuplicates = await detectDuplicates(input);

  const [submission] = await db
    .insert(submissions)
    .values({
      type: input.type,
      status: "pending",
      venueId: "venueId" in input ? (input.venueId ?? null) : null,
      dealId: "dealId" in input ? (input.dealId ?? null) : null,
      payload: input as unknown as Record<string, unknown>,
      sourceType: extractSourceType(input),
      sourceUrl: extractSourceUrl(input),
      sourceSnapshot: input.type === "new_deal" ? (input.deal.sourceSnapshot ?? null) : null,
      submitterHash,
      possibleDuplicateOf: possibleDuplicates,
    })
    .returning();

  if (!submission) throw new Error("Failed to record submission");

  await db
    .insert(contributors)
    .values({ submitterHash, submissionCount: 1 })
    .onConflictDoUpdate({
      target: contributors.submitterHash,
      set: {
        submissionCount: sql`${contributors.submissionCount} + 1`,
        lastSeenAt: new Date(),
      },
    });

  // A submission that collides hard with existing data always gets a human
  // look, even in auto-approve mode.
  const hasStrongDuplicate = possibleDuplicates.some((d) => d.score >= 0.85);

  if (autoApprove() && !hasStrongDuplicate) {
    await applySubmission(submission.id, "auto-approve");
    return {
      ok: true,
      submissionId: submission.id,
      status: "approved",
      message: "Thanks — it's live.",
      possibleDuplicates,
    };
  }

  return {
    ok: true,
    submissionId: submission.id,
    status: "pending",
    message: hasStrongDuplicate
      ? "Thanks — this looks like something we already have, so a moderator will check it."
      : "Thanks — a moderator will review it shortly.",
    possibleDuplicates,
  };
}

async function detectDuplicates(input: SubmissionInput): Promise<DuplicateCandidate[]> {
  if (input.type !== "new_deal") return [];

  const found: DuplicateCandidate[] = [];

  if (input.newVenue) {
    found.push(
      ...(await findDuplicateVenues({
        name: input.newVenue.name,
        latitude: input.newVenue.latitude,
        longitude: input.newVenue.longitude,
        city: input.newVenue.city,
      })),
    );
  }

  if (input.venueId) {
    found.push(
      ...(await findDuplicateDeals({
        venueId: input.venueId,
        beerName: input.deal.beerName,
        servingType: input.deal.servingType,
        priceCents: input.deal.priceCents,
      })),
    );
  }

  return found;
}

/* -------------------------------------------------------- moderation ops */

export async function applySubmission(
  submissionId: string,
  moderator: string,
): Promise<{ ok: boolean; message: string }> {
  return db.transaction(async (tx) => {
    const [submission] = await tx
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (!submission) return { ok: false, message: "Submission not found" };
    if (submission.status === "approved") return { ok: true, message: "Already applied" };

    const payload = submission.payload as SubmissionInput;

    switch (payload.type) {
      case "new_deal": {
        let venueId = payload.venueId ?? null;

        if (!venueId && payload.newVenue) {
          const venue = await createVenue(tx, {
            ...payload.newVenue,
            geoPrecision: "approximate",
            submittedBy: submission.submitterHash,
          });
          venueId = venue.id;
        }
        if (!venueId) return { ok: false, message: "Submission has no venue" };

        await insertDeal(tx, venueId, payload.deal, submission.submitterHash);
        break;
      }

      case "update_deal": {
        const [existing] = await tx.select().from(deals).where(eq(deals.id, payload.dealId)).limit(1);
        if (!existing) return { ok: false, message: "Deal no longer exists" };

        const priceChanged =
          payload.priceCents !== undefined && payload.priceCents !== existing.priceCents;

        const [updated] = await tx
          .update(deals)
          .set({
            priceCents: payload.priceCents ?? existing.priceCents,
            servingSizeOz:
              payload.servingSizeOz !== undefined
                ? String(payload.servingSizeOz)
                : existing.servingSizeOz,
            servingSizeLabel: payload.servingSizeLabel ?? existing.servingSizeLabel,
            sourceType: payload.sourceType,
            sourceUrl: payload.sourceUrl ?? existing.sourceUrl,
            // A new price has no confirmations behind it yet.
            verificationCount: priceChanged ? 0 : existing.verificationCount,
            disputeCount: priceChanged ? 0 : existing.disputeCount,
            lastVerifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(deals.id, payload.dealId))
          .returning();

        if (updated) {
          await recordDealRevision(tx, {
            deal: updated,
            previous: existing,
            changeType: priceChanged ? "price_change" : "correction",
            actor: submission.submitterHash,
            note: payload.note ?? null,
          });
        }
        break;
      }

      case "deal_ended": {
        // endDeal opens its own transaction; inline the same work here so the
        // whole approval stays atomic.
        const [existing] = await tx.select().from(deals).where(eq(deals.id, payload.dealId)).limit(1);
        if (!existing) return { ok: false, message: "Deal no longer exists" };

        const [updated] = await tx
          .update(deals)
          .set({
            status: "expired",
            endedAt: new Date(),
            endedReason: payload.note ?? "Reported no longer available",
            updatedAt: new Date(),
          })
          .where(eq(deals.id, payload.dealId))
          .returning();

        if (updated) {
          await recordDealRevision(tx, {
            deal: updated,
            previous: existing,
            changeType: "status_change",
            actor: submission.submitterHash,
            note: payload.note ?? null,
          });
        }
        break;
      }

      case "venue_closed": {
        const [existing] = await tx.select().from(venues).where(eq(venues.id, payload.venueId)).limit(1);
        if (!existing) return { ok: false, message: "Venue not found" };

        const [updated] = await tx
          .update(venues)
          .set({
            status: payload.permanent ? "permanently_closed" : "temporarily_closed",
            updatedAt: new Date(),
          })
          .where(eq(venues.id, payload.venueId))
          .returning();

        if (updated) {
          await recordVenueRevision(tx, {
            venue: updated,
            previous: existing,
            changeType: "status_change",
            actor: submission.submitterHash,
            note: payload.note ?? null,
          });

          // Closing a venue ends its live deals but deletes nothing: the deal
          // rows and their full revision history stay queryable.
          if (payload.permanent) {
            await tx
              .update(deals)
              .set({
                status: "expired",
                endedAt: new Date(),
                endedReason: "Venue permanently closed",
                updatedAt: new Date(),
              })
              .where(and(eq(deals.venueId, payload.venueId), eq(deals.status, "active")));
          }
        }
        break;
      }

      case "venue_correction": {
        const [existing] = await tx.select().from(venues).where(eq(venues.id, payload.venueId)).limit(1);
        if (!existing) return { ok: false, message: "Venue not found" };

        const [updated] = await tx
          .update(venues)
          .set({
            name: payload.fields.name ?? existing.name,
            address1: payload.fields.address1 ?? existing.address1,
            website: payload.fields.website ?? existing.website,
            phone: payload.fields.phone ?? existing.phone,
            updatedAt: new Date(),
          })
          .where(eq(venues.id, payload.venueId))
          .returning();

        if (updated) {
          await recordVenueRevision(tx, {
            venue: updated,
            previous: existing,
            changeType: "correction",
            actor: submission.submitterHash,
            note: payload.note ?? null,
          });
        }
        break;
      }
    }

    await tx
      .update(submissions)
      .set({ status: "approved", reviewedAt: new Date(), reviewedBy: moderator })
      .where(eq(submissions.id, submissionId));

    await tx
      .insert(contributors)
      .values({ submitterHash: submission.submitterHash, approvedCount: 1 })
      .onConflictDoUpdate({
        target: contributors.submitterHash,
        set: { approvedCount: sql`${contributors.approvedCount} + 1` },
      });

    return { ok: true, message: "Applied" };
  });
}

export async function rejectSubmission(
  submissionId: string,
  moderator: string,
  note: string,
  status: "rejected" | "duplicate" = "rejected",
): Promise<{ ok: boolean }> {
  const [submission] = await db
    .update(submissions)
    .set({ status, reviewedAt: new Date(), reviewedBy: moderator, reviewNote: note })
    .where(eq(submissions.id, submissionId))
    .returning();

  if (submission) {
    await db
      .insert(contributors)
      .values({ submitterHash: submission.submitterHash, rejectedCount: 1 })
      .onConflictDoUpdate({
        target: contributors.submitterHash,
        set: { rejectedCount: sql`${contributors.rejectedCount} + 1` },
      });
  }

  return { ok: Boolean(submission) };
}

export async function listPendingSubmissions(limit = 50): Promise<Submission[]> {
  return db
    .select()
    .from(submissions)
    .where(eq(submissions.status, "pending"))
    .orderBy(desc(submissions.createdAt))
    .limit(limit);
}

/* ------------------------------------------------------------- internals */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Shared insert path so submitted deals and seeded deals are shaped alike. */
export async function insertDeal(
  tx: Tx,
  venueId: string,
  input: DealDetailsInput,
  submittedBy: string | null,
  overrides: Partial<NewDeal> = {},
): Promise<Deal> {
  const values: NewDeal = {
    venueId,
    beerName: input.beerName,
    brand: input.brand ?? null,
    beerStyle: input.beerStyle ?? null,
    priceCents: input.priceCents,
    servingType: input.servingType,
    servingSizeOz: input.servingSizeOz !== undefined ? String(input.servingSizeOz) : null,
    servingSizeLabel: input.servingSizeLabel ?? null,
    quantity: input.quantity,
    individualServingSizeOz:
      input.individualServingSizeOz !== undefined ? String(input.individualServingSizeOz) : null,
    description: input.description ?? null,
    restrictions: input.restrictions ?? null,
    ruleDescription: input.ruleDescription ?? null,
    isHappyHour: input.isHappyHour,
    isConditional: input.isConditional,
    expiresAt: input.expiresAt ?? null,
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl ?? null,
    sourceSnapshot: input.sourceSnapshot ?? null,
    sourceCapturedAt: input.sourceUrl ? new Date() : null,
    submittedBy,
    // A brand-new community deal is unverified until someone confirms it.
    // Seeded rows override this with the date of the menu they came from.
    lastVerifiedAt: null,
    status: "active",
    dedupeKey: buildDealDedupeKey({
      beerName: input.beerName,
      servingType: input.servingType,
      servingSizeOz: input.servingSizeOz ?? null,
      servingSizeLabel: input.servingSizeLabel ?? null,
      isHappyHour: input.isHappyHour,
    }),
    ...overrides,
  };

  const [deal] = await tx.insert(deals).values(values).returning();
  if (!deal) throw new Error("Failed to insert deal");

  for (const window of input.schedule) {
    for (const day of window.days) {
      await tx.insert(dealSchedules).values({
        dealId: deal.id,
        dayOfWeek: day,
        startTime: window.startTime ?? null,
        endTime: window.endTime ?? null,
      });
    }
  }

  await recordDealRevision(tx, {
    deal,
    changeType: "created",
    actor: submittedBy ?? "system",
  });

  return deal;
}

function extractSourceType(input: SubmissionInput): Submission["sourceType"] {
  if (input.type === "new_deal") return input.deal.sourceType;
  if (input.type === "update_deal") return input.sourceType;
  return "community_submission";
}

function extractSourceUrl(input: SubmissionInput): string | null {
  if (input.type === "new_deal") return input.deal.sourceUrl ?? null;
  if (input.type === "update_deal") return input.sourceUrl ?? null;
  return null;
}

export { endDeal };
