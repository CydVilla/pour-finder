import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { dealReports, deals, venues } from "@/db/schema";

/**
 * Price corrections waiting on a moderator.
 *
 * Reports never change live data on their own - see src/server/escalation.ts
 * for why - but a report that carries a replacement price is the one kind a
 * moderator can act on in a single click, so it gets its own queue rather than
 * sitting unseen next to the "this deal is gone" escalations.
 */
export interface PriceReportRow {
  id: string;
  dealId: string;
  venueName: string;
  venueSlug: string;
  beerName: string;
  currentPriceCents: number;
  reportedPriceCents: number;
  note: string | null;
  createdAt: string;
}

export async function listPendingPriceReports(limit = 50): Promise<PriceReportRow[]> {
  const rows = await db
    .select({
      id: dealReports.id,
      dealId: deals.id,
      venueName: venues.name,
      venueSlug: venues.slug,
      beerName: deals.beerName,
      currentPriceCents: deals.priceCents,
      reportedPriceCents: dealReports.reportedPriceCents,
      note: dealReports.note,
      createdAt: dealReports.createdAt,
    })
    .from(dealReports)
    .innerJoin(deals, eq(deals.id, dealReports.dealId))
    .innerJoin(venues, eq(venues.id, deals.venueId))
    .where(
      and(
        eq(dealReports.status, "pending"),
        eq(dealReports.reason, "price_wrong"),
        // A "price is wrong" with no replacement is not actionable here; it
        // stays a plain report rather than cluttering a one-click queue.
        isNotNull(dealReports.reportedPriceCents),
      ),
    )
    .orderBy(desc(dealReports.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    reportedPriceCents: r.reportedPriceCents ?? 0,
    createdAt: r.createdAt.toISOString(),
  }));
}
