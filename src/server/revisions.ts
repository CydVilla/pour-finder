import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import {
  dealRevisions,
  deals,
  venueRevisions,
  venues,
  type Deal,
  type Venue,
} from "@/db/schema";
import type { SourceType } from "@/db/schema";

/**
 * Append-only history.
 *
 * Every write that changes an authoritative field records a revision holding a
 * full snapshot plus the specific fields that moved. This is what makes
 * "$1 -> $2 -> $1" recoverable, lets us show a price timeline, and gives
 * moderators an audit trail. Nothing is ever overwritten in place without a
 * revision being written in the same transaction.
 */

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface RecordDealRevisionInput {
  deal: Deal;
  previous?: Deal | null;
  changeType: (typeof dealRevisions.$inferInsert)["changeType"];
  actor?: string | null;
  note?: string | null;
  sourceType?: SourceType | null;
  sourceUrl?: string | null;
}

/** Fields whose change is worth recording; excludes derived counters. */
const TRACKED_DEAL_FIELDS = [
  "beerName",
  "brand",
  "beerStyle",
  "abv",
  "priceCents",
  "currency",
  "servingSizeOz",
  "servingSizeLabel",
  "servingType",
  "quantity",
  "individualServingSizeOz",
  "description",
  "restrictions",
  "ruleDescription",
  "isHappyHour",
  "isRecurring",
  "isConditional",
  "startsAt",
  "expiresAt",
  "sourceType",
  "sourceUrl",
  "status",
] as const satisfies readonly (keyof Deal)[];

export async function recordDealRevision(
  tx: Tx,
  input: RecordDealRevisionInput,
): Promise<void> {
  const [latest] = await tx
    .select({ revision: dealRevisions.revision })
    .from(dealRevisions)
    .where(eq(dealRevisions.dealId, input.deal.id))
    .orderBy(desc(dealRevisions.revision))
    .limit(1);

  const changedFields = input.previous
    ? TRACKED_DEAL_FIELDS.filter(
        (field) => !valuesEqual(input.previous![field], input.deal[field]),
      )
    : [...TRACKED_DEAL_FIELDS];

  await tx.insert(dealRevisions).values({
    dealId: input.deal.id,
    revision: (latest?.revision ?? 0) + 1,
    changeType: input.changeType,
    changedFields: changedFields as string[],
    priceCents: input.deal.priceCents,
    previousPriceCents: input.previous?.priceCents ?? null,
    snapshot: serializeSnapshot(input.deal),
    sourceType: input.sourceType ?? input.deal.sourceType,
    sourceUrl: input.sourceUrl ?? input.deal.sourceUrl,
    actor: input.actor ?? null,
    note: input.note ?? null,
  });
}

export async function recordVenueRevision(
  tx: Tx,
  input: {
    venue: Venue;
    previous?: Venue | null;
    changeType: (typeof venueRevisions.$inferInsert)["changeType"];
    actor?: string | null;
    note?: string | null;
  },
): Promise<void> {
  const [latest] = await tx
    .select({ revision: venueRevisions.revision })
    .from(venueRevisions)
    .where(eq(venueRevisions.venueId, input.venue.id))
    .orderBy(desc(venueRevisions.revision))
    .limit(1);

  const tracked: (keyof Venue)[] = [
    "name",
    "address1",
    "address2",
    "city",
    "neighborhood",
    "state",
    "postalCode",
    "latitude",
    "longitude",
    "website",
    "phone",
    "venueType",
    "status",
    "timezone",
  ];

  const changedFields = input.previous
    ? tracked.filter((field) => !valuesEqual(input.previous![field], input.venue[field]))
    : tracked;

  await tx.insert(venueRevisions).values({
    venueId: input.venue.id,
    revision: (latest?.revision ?? 0) + 1,
    changeType: input.changeType,
    changedFields: changedFields as string[],
    snapshot: serializeSnapshot(input.venue),
    actor: input.actor ?? null,
    note: input.note ?? null,
  });
}

/**
 * Price history for a deal, oldest first. Backs "was $1, now $2" and the
 * eventual price chart. Only revisions that actually moved the price.
 */
export async function dealPriceHistory(dealId: string): Promise<
  { priceCents: number; previousPriceCents: number | null; changedAt: string; note: string | null }[]
> {
  const rows = await db
    .select({
      priceCents: dealRevisions.priceCents,
      previousPriceCents: dealRevisions.previousPriceCents,
      createdAt: dealRevisions.createdAt,
      note: dealRevisions.note,
      changedFields: dealRevisions.changedFields,
      changeType: dealRevisions.changeType,
    })
    .from(dealRevisions)
    .where(eq(dealRevisions.dealId, dealId))
    .orderBy(dealRevisions.revision);

  return rows
    .filter(
      (r) =>
        r.priceCents !== null &&
        (r.changeType === "created" || r.changedFields.includes("priceCents")),
    )
    .map((r) => ({
      priceCents: r.priceCents!,
      previousPriceCents: r.previousPriceCents,
      changedAt: r.createdAt.toISOString(),
      note: r.note,
    }));
}

/** Applies a price change and records the revision atomically. */
export async function applyPriceChange(input: {
  dealId: string;
  newPriceCents: number;
  actor: string;
  note?: string;
  sourceType?: SourceType;
  sourceUrl?: string | null;
  verifiedNow?: boolean;
}): Promise<Deal | null> {
  return db.transaction(async (tx) => {
    const [previous] = await tx.select().from(deals).where(eq(deals.id, input.dealId)).limit(1);
    if (!previous) return null;
    if (previous.priceCents === input.newPriceCents) return previous;

    const [updated] = await tx
      .update(deals)
      .set({
        priceCents: input.newPriceCents,
        // Confirmations vouched for the OLD price. Reset them so a stale
        // consensus can't lend credibility to a number nobody has seen.
        verificationCount: 0,
        disputeCount: 0,
        lastVerifiedAt: input.verifiedNow ? new Date() : null,
        sourceType: input.sourceType ?? previous.sourceType,
        sourceUrl: input.sourceUrl ?? previous.sourceUrl,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, input.dealId))
      .returning();

    if (!updated) return null;

    await recordDealRevision(tx, {
      deal: updated,
      previous,
      changeType: "price_change",
      actor: input.actor,
      note: input.note ?? null,
      sourceType: input.sourceType ?? null,
      sourceUrl: input.sourceUrl ?? null,
    });

    return updated;
  });
}

/** Ends a deal without deleting it. History stays queryable forever. */
export async function endDeal(input: {
  dealId: string;
  reason: string;
  actor: string;
  status?: "expired" | "superseded" | "removed";
}): Promise<Deal | null> {
  return db.transaction(async (tx) => {
    const [previous] = await tx.select().from(deals).where(eq(deals.id, input.dealId)).limit(1);
    if (!previous) return null;

    const [updated] = await tx
      .update(deals)
      .set({
        status: input.status ?? "expired",
        endedAt: new Date(),
        endedReason: input.reason,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, input.dealId))
      .returning();

    if (!updated) return null;

    await recordDealRevision(tx, {
      deal: updated,
      previous,
      changeType: "status_change",
      actor: input.actor,
      note: input.reason,
    });

    return updated;
  });
}

/* -------------------------------------------------------------- helpers */

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

/** Dates -> ISO so the JSONB snapshot round-trips cleanly. */
function serializeSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}
