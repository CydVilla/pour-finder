import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VenueDetail } from "@/components/VenueDetail";
import { parseFilters } from "@/lib/filters";
import { searchDeals } from "@/server/deals-query";
import { getVenueBySlug } from "@/server/venues";

/**
 * Per-venue page.
 *
 * Exists mainly so a deal is shareable ("look, $1 drafts") and so search
 * engines have something to index per venue. The discovery experience remains
 * the homepage; this is a deep link into it.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const venue = await getVenueBySlug(slug);
  if (!venue) return { title: "Venue not found" };

  return {
    title: `Cheap beer at ${venue.name} — ${venue.city}, ${venue.state}`,
    description: `Community-reported beer prices at ${venue.name} in ${venue.city}, ${venue.state}, with the date each one was last confirmed.`,
    alternates: { canonical: `/venue/${venue.slug}` },
    robots: venue.status === "permanently_closed" ? { index: false } : undefined,
  };
}

export default async function VenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const venue = await getVenueBySlug(slug);
  if (!venue) notFound();

  // Reuse the discovery query so a venue page and the map agree on every
  // derived field (freshness, availability, price-per-ounce).
  const filters = parseFilters(
    new URLSearchParams({ citySlug: venue.citySlug, state: venue.state, includeInactive: "1", limit: "100" }),
  );
  const result = await searchDeals(filters, "venue-page");
  const match = result.venues.find((v) => v.id === venue.id);

  return (
    <main className="mx-auto min-h-full max-w-3xl px-4 py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink"
      >
        <span aria-hidden>←</span> All cheap beer
      </Link>

      {match ? (
        <VenueDetail venue={match} />
      ) : (
        <div className="pf-card mt-4 p-5">
          <h1 className="wordmark text-2xl">{venue.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {[venue.address1, venue.city, venue.state].filter(Boolean).join(", ")}
          </p>
          <p className="mt-4 text-sm text-ink-soft">
            We don&apos;t have any current beer deals listed here.
          </p>
        </div>
      )}
    </main>
  );
}
