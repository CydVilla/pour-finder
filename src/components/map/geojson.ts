import { formatHeroPrice } from "@/lib/money";
import type { VenueDTO } from "@/lib/types";

export interface VenueFeatureProperties {
  venueId: string;
  name: string;
  priceLabel: string;
  priceCents: number;
  dealCount: number;
  /** 1 when the data is stale/unverified: drives the drained marker style. */
  isStale: 0 | 1;
  /** 1 when this is one of the cheapest pins in view: drives the amber fill. */
  isCheap: 0 | 1;
}

export interface VenueFeatureCollection {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    id: number;
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: VenueFeatureProperties;
  }[];
}

/**
 * One marker per VENUE, never per deal - a bar with five $1 beers is one pin
 * showing $1, not five overlapping pins.
 */
export function venuesToGeoJson(venues: readonly VenueDTO[]): VenueFeatureCollection {
  const cheapest = venues.reduce(
    (min, v) => Math.min(min, v.cheapestPriceCents),
    Number.POSITIVE_INFINITY,
  );
  // "Cheap" is relative to what's on screen: highlighting the best few in view
  // is useful; highlighting everything under $5 in a $2 neighbourhood is not.
  const cheapThreshold = Number.isFinite(cheapest) ? cheapest * 1.25 : 0;

  return {
    type: "FeatureCollection",
    features: venues.map((venue, index) => ({
      type: "Feature" as const,
      id: index,
      geometry: {
        type: "Point" as const,
        coordinates: [venue.longitude, venue.latitude] as [number, number],
      },
      properties: {
        venueId: venue.id,
        name: venue.name,
        priceLabel: formatHeroPrice(venue.cheapestPriceCents),
        priceCents: venue.cheapestPriceCents,
        dealCount: venue.dealCount,
        isStale:
          venue.bestFreshness === "likely_outdated" || venue.bestFreshness === "unverified" ? 1 : 0,
        isCheap: venue.cheapestPriceCents <= cheapThreshold ? 1 : 0,
      },
    })),
  };
}
