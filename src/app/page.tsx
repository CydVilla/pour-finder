import type { Metadata } from "next";
import { DiscoveryApp } from "@/components/DiscoveryApp";
import { envString } from "@/lib/env";
import { parseFilters } from "@/lib/filters";
import { searchDeals } from "@/server/deals-query";
import type { DealSearchResponse } from "@/lib/types";

/**
 * The whole application.
 *
 * Server-rendered so the first paint has real deals in it (good for both
 * perceived speed on a phone and for search engines), then handed to the
 * client component which owns all subsequent interaction.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cheap beer near you",
  alternates: { canonical: "/" },
};

/**
 * Massachusetts is the launch market, so it is the default *filter value* -
 * not a hardcoded assumption anywhere below this line. The moment a user
 * shares a location or searches a place, the state filter is dropped entirely
 * so results cross state lines (Attleboro should see Providence).
 */
const DEFAULT_STATE = envString("NEXT_PUBLIC_DEFAULT_STATE", "MA");

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }

  const hasGeography =
    params.has("lat") || params.has("minLat") || params.has("state") || params.has("citySlug");
  if (!hasGeography) params.set("state", DEFAULT_STATE);

  const filters = parseFilters(params);

  let initialData: DealSearchResponse;
  try {
    initialData = await searchDeals(filters, "ssr");
  } catch (error) {
    // A database hiccup should still render the shell; the client refetches.
    console.error("[page] initial search failed", error);
    initialData = {
      venues: [],
      total: 0,
      truncated: false,
      requestId: "ssr",
      geoBackend: "haversine",
    };
  }

  return (
    <main id="results" className="h-full">
      <h1 className="sr-only">Cheap beer deals near you</h1>
      <DiscoveryApp initialData={initialData} initialFilters={filters} />
      <StructuredData data={initialData} />
    </main>
  );
}

/**
 * Minimal ItemList markup. Deliberately conservative: we publish the venue and
 * its address, not the price, because a price we cannot guarantee is current
 * has no business in a rich result.
 */
function StructuredData({ data }: { data: DealSearchResponse }) {
  if (data.venues.length === 0) return null;

  const json = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: data.venues.slice(0, 20).map((venue, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "BarOrPub",
        name: venue.name,
        address: {
          "@type": "PostalAddress",
          streetAddress: venue.address1 ?? undefined,
          addressLocality: venue.city,
          addressRegion: venue.state,
          postalCode: venue.postalCode ?? undefined,
          addressCountry: "US",
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: venue.latitude,
          longitude: venue.longitude,
        },
        url: `/venue/${venue.slug}`,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      // Serialized server-side from our own database rows.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, "\\u003c") }}
    />
  );
}
