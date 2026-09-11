/**
 * Backfills deal_verifications rows for deals whose confirmation counter was
 * written directly by an early version of the seed.
 *
 *   npx tsx --env-file=.env.production.local scripts/backfill-verifications.ts
 *
 * Without the rows, verification.ts — which recomputes the counter from them —
 * resets the count to 1 the first time somebody confirms the deal. Idempotent:
 * only tops up deals that have fewer rows than their counter claims.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { dealVerifications } from "../src/db/schema";

async function main(): Promise<void> {
  const rows = (await db.execute(sql`
    SELECT d.id, d.price_cents, d.verification_count, d.last_verified_at,
           (SELECT count(*)::int FROM deal_verifications v WHERE v.deal_id = d.id) AS actual
    FROM deals d
    WHERE d.verification_count > 0
  `)) as unknown as {
    id: string;
    price_cents: number;
    verification_count: number;
    last_verified_at: string | null;
    actual: number;
  }[];

  let added = 0;
  let touched = 0;

  for (const row of rows) {
    const gap = row.verification_count - row.actual;
    if (gap <= 0 || !row.last_verified_at) continue;
    touched += 1;

    const base = new Date(row.last_verified_at).getTime();
    for (let i = 0; i < gap; i += 1) {
      // Offset past any rows that already exist so day buckets don't collide.
      const votedAt = new Date(base - (row.actual + i) * 86_400_000);
      await db
        .insert(dealVerifications)
        .values({
          dealId: row.id,
          result: "still_available",
          verifiedPriceCents: row.price_cents,
          submitterHash: `seed-research-${row.id.slice(0, 8)}-${row.actual + i}`,
          note: "Backfilled from the initial research import",
          dayBucket: votedAt.toISOString().slice(0, 10),
          createdAt: votedAt,
        })
        .onConflictDoNothing();
      added += 1;
    }
  }

  console.log(`✓ topped up ${touched} deal(s) with ${added} verification row(s)`);

  const [check] = (await db.execute(sql`
    SELECT count(*)::int AS mismatched FROM deals d
    WHERE d.verification_count >
          (SELECT count(*) FROM deal_verifications v WHERE v.deal_id = d.id)
  `)) as unknown as { mismatched: number }[];
  console.log(`  deals still short of their counter: ${check?.mismatched ?? "?"}`);

  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
