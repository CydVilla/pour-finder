/**
 * Seeds the database.
 *
 *   npm run db:seed              real Massachusetts data only
 *   npm run db:seed -- --demo    plus clearly-labelled demo rows that exercise
 *                                happy-hour schedules, conditional rules and
 *                                bucket quantities
 *   npm run db:seed -- --fresh   wipe venues/deals/places first
 *
 * Idempotent by default: re-running skips venues whose slug already exists.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { closeDb, db } from "./index";
import {
  dealRevisions,
  dealSchedules,
  dealVerifications,
  deals,
  places,
  venueRevisions,
  venues,
  type NewDeal,
} from "./schema";
import { buildPlaces } from "./seed-places";
import { DEMO_VENUES, SEED_VENUES, type SeedDeal, type SeedVenue } from "./seed-venues";
import { buildDealDedupeKey, buildVenueSlug, normalizeVenueName, slugify } from "@/lib/slug";
import { timezoneForLocation } from "@/lib/timezone";

const withDemo = process.argv.includes("--demo");
const fresh = process.argv.includes("--fresh");

async function main(): Promise<void> {
  if (fresh) {
    console.log("• clearing existing data");
    // Order matters only for readability; FKs cascade from venues.
    await db.delete(dealSchedules);
    await db.delete(dealRevisions);
    await db.delete(deals);
    await db.delete(venueRevisions);
    await db.delete(venues);
    await db.delete(places);
  }

  await seedPlaces();

  const venueRows = withDemo ? [...SEED_VENUES, ...DEMO_VENUES] : SEED_VENUES;
  let created = 0;
  let skipped = 0;
  let dealCount = 0;

  for (const seed of venueRows) {
    const slug = buildVenueSlug(seed.name, seed.city);
    const [existing] = await db
      .select({ id: venues.id })
      .from(venues)
      .where(sql`${venues.slug} = ${slug}`)
      .limit(1);

    if (existing) {
      skipped += 1;
      continue;
    }

    dealCount += await insertVenue(seed, slug);
    created += 1;
  }

  const totals = (await db.execute(
    sql`SELECT COUNT(*)::int AS total FROM deals WHERE status = 'active'`,
  )) as unknown as { total: number }[];
  const total = totals[0]?.total ?? 0;

  console.log(`✓ venues: ${created} created, ${skipped} already present`);
  console.log(`✓ deals:  ${dealCount} inserted (${total} active in total)`);
  if (!withDemo) {
    console.log("  (run with --demo to add happy-hour / conditional test fixtures)");
  }
}

async function seedPlaces(): Promise<void> {
  const rows = buildPlaces();
  // Chunked so a 100+ row insert doesn't hit parameter limits on small hosts.
  for (let i = 0; i < rows.length; i += 100) {
    await db
      .insert(places)
      .values(rows.slice(i, i + 100))
      .onConflictDoNothing();
  }
  console.log(`✓ places: ${rows.length} gazetteer entries (all 50 states + DC)`);
}

async function insertVenue(seed: SeedVenue, slug: string): Promise<number> {
  return db.transaction(async (tx) => {
    const [venue] = await tx
      .insert(venues)
      .values({
        name: seed.name,
        slug,
        nameNormalized: normalizeVenueName(seed.name),
        address1: seed.address1 ?? null,
        city: seed.city,
        citySlug: slugify(seed.city),
        neighborhood: seed.neighborhood ?? null,
        state: seed.state,
        postalCode: seed.postalCode ?? null,
        latitude: seed.latitude,
        longitude: seed.longitude,
        geoPrecision: seed.geoPrecision,
        timezone: timezoneForLocation(seed.state, seed.longitude),
        timezoneSource: "derived",
        website: seed.website ?? null,
        venueType: seed.venueType ?? "bar",
        status: seed.status ?? "active",
        notes: seed.notes ?? null,
        submittedBy: "seed",
      })
      .returning();

    if (!venue) throw new Error(`Failed to insert venue ${seed.name}`);

    await tx.insert(venueRevisions).values({
      venueId: venue.id,
      revision: 1,
      changeType: "import",
      changedFields: ["name", "address1", "latitude", "longitude", "status"],
      snapshot: serialize(venue),
      actor: "seed",
      note: "Initial Massachusetts research import",
    });

    for (const seedDeal of seed.deals) {
      await insertDeal(tx, venue.id, seedDeal);
    }

    return seed.deals.length;
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertDeal(tx: Tx, venueId: string, seed: SeedDeal): Promise<void> {
  const verifiedAt = seed.verifiedDaysAgo === null ? null : daysAgo(seed.verifiedDaysAgo);

  const values: NewDeal = {
    venueId,
    beerName: seed.beerName,
    brand: seed.brand ?? null,
    beerStyle: seed.beerStyle ?? null,
    priceCents: seed.priceCents,
    servingType: seed.servingType,
    // Only ever what the source actually stated.
    servingSizeOz: seed.servingSizeOz !== undefined ? String(seed.servingSizeOz) : null,
    servingSizeLabel: seed.servingSizeLabel ?? null,
    quantity: seed.quantity ?? 1,
    individualServingSizeOz:
      seed.individualServingSizeOz !== undefined ? String(seed.individualServingSizeOz) : null,
    description: seed.description ?? null,
    restrictions: seed.restrictions ?? null,
    ruleDescription: seed.ruleDescription ?? null,
    isHappyHour: seed.isHappyHour ?? false,
    isConditional: seed.isConditional ?? false,
    sourceType: seed.sourceType,
    sourceUrl: seed.sourceUrl ?? null,
    sourceSnapshot: seed.sourceSnapshot ?? null,
    sourceCapturedAt: verifiedAt,
    submittedBy: "seed",
    lastVerifiedAt: verifiedAt,
    verificationCount: seed.verificationCount ?? 0,
    status: seed.status ?? "active",
    endedAt: seed.endedAt ? new Date(seed.endedAt) : null,
    endedReason: seed.endedReason ?? null,
    dedupeKey: buildDealDedupeKey({
      beerName: seed.beerName,
      servingType: seed.servingType,
      servingSizeOz: seed.servingSizeOz ?? null,
      servingSizeLabel: seed.servingSizeLabel ?? null,
      isHappyHour: seed.isHappyHour ?? false,
    }),
  };

  const [deal] = await tx.insert(deals).values(values).returning();
  if (!deal) throw new Error(`Failed to insert deal ${seed.beerName}`);

  /*
   * Back the confirmation count with real rows.
   *
   * `verificationCount` is denormalized, and verification.ts recomputes it
   * from deal_verifications on every vote. Writing the counter without the
   * rows meant the first genuine confirmation RESET it — a deal showing
   * "4 confirmations" dropped to 1 the moment somebody agreed with it, which
   * is both wrong and the exact opposite of the feedback the tap should give.
   *
   * Each row carries a distinct synthetic submitter (the unique index is
   * per-person-per-day) and the deal's current price, so it counts toward the
   * price actually on display.
   */
  const seededVotes = seed.verificationCount ?? 0;
  if (seededVotes > 0 && verifiedAt) {
    for (let i = 0; i < seededVotes; i += 1) {
      // Spread them over the days before the verification date so the history
      // reads like independent visits rather than one batch.
      const votedAt = new Date(verifiedAt.getTime() - i * 86_400_000);
      await tx.insert(dealVerifications).values({
        dealId: deal.id,
        result: "still_available",
        verifiedPriceCents: deal.priceCents,
        submitterHash: `seed-research-${deal.id.slice(0, 8)}-${i}`,
        note: "Recorded during the initial research import",
        dayBucket: votedAt.toISOString().slice(0, 10),
        createdAt: votedAt,
      });
    }
  }

  for (const window of seed.schedule ?? []) {
    for (const day of window.days) {
      await tx.insert(dealSchedules).values({
        dealId: deal.id,
        dayOfWeek: day,
        startTime: window.startTime ?? null,
        endTime: window.endTime ?? null,
      });
    }
  }

  // Backdated price history where the research recorded one. This is what makes
  // "$1 -> $2 -> back to $1" recoverable rather than silently overwritten.
  if (seed.priceHistory && seed.priceHistory.length > 0) {
    let previous: number | null = null;
    let revision = 0;

    for (const entry of seed.priceHistory) {
      revision += 1;
      await tx.insert(dealRevisions).values({
        dealId: deal.id,
        revision,
        changeType: revision === 1 ? "created" : "price_change",
        changedFields: revision === 1 ? ["priceCents"] : ["priceCents"],
        priceCents: entry.priceCents,
        previousPriceCents: previous,
        snapshot: serialize({ ...deal, priceCents: entry.priceCents }),
        sourceType: seed.sourceType,
        actor: "seed",
        note: entry.note ?? null,
        createdAt: daysAgo(entry.daysAgo),
      });
      previous = entry.priceCents;
    }
  } else {
    await tx.insert(dealRevisions).values({
      dealId: deal.id,
      revision: 1,
      changeType: "import",
      changedFields: ["priceCents"],
      priceCents: deal.priceCents,
      previousPriceCents: null,
      snapshot: serialize(deal),
      sourceType: seed.sourceType,
      actor: "seed",
      note: "Initial research import",
      createdAt: verifiedAt ?? new Date(),
    });
  }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

function serialize(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

main()
  .then(() => closeDb())
  .catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
