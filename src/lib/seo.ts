/**
 * Structured data and metadata helpers.
 *
 * Two rules shape everything here:
 *
 * 1. **Only publish what we can stand behind.** Prices are community-reported
 *    and change without notice, so `Offer` entries carry `priceValidUntil` and
 *    are emitted only for deals confirmed recently. A rich result showing a
 *    price that turned out to be wrong is worse than no rich result.
 * 2. **Structured data must match visible content.** Everything emitted below
 *    is also rendered on the page in text — that is Google's requirement, and
 *    it is why `SeoContent` exists.
 */
import type { DealDTO, VenueDTO } from "./types";
import { FRESHNESS_THRESHOLD_DAYS } from "./freshness";
import { formatCents } from "./money";
import { SERVING_TYPE_LABEL } from "./format";

export function siteName(): string {
  return "Pour Finder";
}

/** Deals stale enough that we won't assert their price to a search engine. */
function isPublishablePrice(deal: DealDTO): boolean {
  return (
    deal.status === "active" &&
    deal.daysSinceVerified !== null &&
    deal.daysSinceVerified <= FRESHNESS_THRESHOLD_DAYS.stale
  );
}

interface JsonLdNode {
  "@type": string;
  [key: string]: unknown;
}

export function venueSchema(venue: VenueDTO, url: string): JsonLdNode {
  const publishable = venue.deals.filter(isPublishablePrice);

  return {
    "@type": "BarOrPub",
    "@id": url,
    name: venue.name,
    url,
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
    telephone: venue.phone ?? undefined,
    sameAs: venue.website ? [venue.website] : undefined,
    servesCuisine: undefined,
    priceRange: publishable.length > 0 ? "$" : undefined,
    // Only assert opening state we actually know.
    ...(venue.status === "permanently_closed"
      ? { additionalProperty: { "@type": "PropertyValue", name: "status", value: "Permanently closed" } }
      : {}),
    makesOffer: publishable.length
      ? publishable.map((deal) => ({
          "@type": "Offer",
          name: `${deal.beerName}${
            deal.servingType !== "other" ? ` (${SERVING_TYPE_LABEL[deal.servingType].toLowerCase()})` : ""
          }`,
          price: (deal.priceCents / 100).toFixed(2),
          priceCurrency: deal.currency,
          availability: "https://schema.org/InStock",
          // Community data goes stale; don't let a rich result outlive our
          // confidence in it.
          priceValidUntil: validUntil(deal),
          itemOffered: {
            "@type": "Product",
            name: deal.beerName,
            category: "Beer",
            ...(deal.brand ? { brand: { "@type": "Brand", name: deal.brand } } : {}),
          },
        }))
      : undefined,
  };
}

function validUntil(deal: DealDTO): string {
  const base = deal.lastVerifiedAt ? new Date(deal.lastVerifiedAt) : new Date();
  const until = new Date(base.getTime() + FRESHNESS_THRESHOLD_DAYS.stale * 86_400_000);
  return until.toISOString().slice(0, 10);
}

export function breadcrumbSchema(
  trail: { name: string; url: string }[],
): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

export function venueListSchema(
  venues: readonly VenueDTO[],
  baseUrl: string,
  listName: string,
): JsonLdNode {
  return {
    "@type": "ItemList",
    name: listName,
    numberOfItems: venues.length,
    itemListElement: venues.slice(0, 25).map((venue, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: venue.name,
      url: `${baseUrl}/venue/${venue.slug}`,
    })),
  };
}

/** Wraps nodes in a single @graph so one script tag carries the whole page. */
export function jsonLdGraph(nodes: JsonLdNode[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes })
    .replace(/</g, "\\u003c");
}

/* ------------------------------------------------------------ copywriting */

/**
 * Titles and descriptions carry the real numbers from the query. "8 bars from
 * $1" earns a click; "Cheap beer in Boston" does not, and it is also what
 * every competitor's title says.
 */
export function listTitle(place: string, venues: readonly VenueDTO[]): string {
  if (venues.length === 0) return `Cheap beer in ${place}`;
  const cheapest = Math.min(...venues.map((v) => v.cheapestPriceCents));
  return `Cheap beer in ${place} — ${venues.length} ${
    venues.length === 1 ? "bar" : "bars"
  } from ${formatCents(cheapest)}`;
}

export function listDescription(place: string, venues: readonly VenueDTO[]): string {
  if (venues.length === 0) {
    return `Beer prices in ${place}, reported by the people who drank them. Nothing listed yet — add the first one.`;
  }
  const cheapest = Math.min(...venues.map((v) => v.cheapestPriceCents));
  const named = venues
    .slice(0, 3)
    .map((v) => `${v.name} ${formatCents(v.cheapestPriceCents)}`)
    .join(", ");
  return `${venues.length} places with cheap beer in ${place}, starting at ${formatCents(
    cheapest,
  )}: ${named}. Every price shows the date it was last confirmed.`;
}

export function venueDescription(venue: VenueDTO): string {
  const active = venue.deals.filter((d) => d.status === "active");
  if (active.length === 0) {
    return `Beer prices at ${venue.name} in ${venue.city}, ${venue.state}. No current deals listed — add one if you know it.`;
  }
  const cheapest = Math.min(...active.map((d) => d.priceCents));
  const headline = active.find((d) => d.priceCents === cheapest);
  return `${formatCents(cheapest)} ${headline?.beerName ?? "beer"} at ${venue.name}, ${
    venue.city
  }, ${venue.state}. ${active.length} beer ${
    active.length === 1 ? "price" : "prices"
  } with the date each was last confirmed by someone who went.`;
}
