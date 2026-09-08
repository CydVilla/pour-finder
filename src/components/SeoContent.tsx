import Link from "next/link";
import { formatServingDescription } from "@/lib/format";
import { freshnessLabel } from "@/lib/freshness";
import { formatCents } from "@/lib/money";
import type { VenueDTO } from "@/lib/types";

interface Props {
  venues: readonly VenueDTO[];
  /** "Boston", "Somerville, MA", "Massachusetts". */
  placeName: string;
  /** Optional lead-in specific to the page (e.g. a price cap). */
  intro?: string;
}

/**
 * Server-rendered, crawlable content for the landing pages.
 *
 * The interactive app above this is a client component that renders as an
 * empty shell in the initial HTML, so without this section a city page ships
 * one screen-reader-only <h1>, two links and no prose — which is thin content
 * by any measure, and gives Google no path to the venue pages at all.
 *
 * This is not a doorway page: it is the same data, in text, genuinely useful
 * to someone who landed from a search and wants to read rather than pan a map.
 * Everything asserted in JSON-LD is visible here, which is Google's actual
 * requirement for structured data.
 */
export function SeoContent({ venues, placeName, intro }: Props) {
  if (venues.length === 0) return null;

  const cheapest = Math.min(...venues.map((v) => v.cheapestPriceCents));
  const withKnownSize = venues.flatMap((v) => v.deals).filter((d) => d.totalOunces !== null);

  return (
    <section className="border-t border-rule bg-paper" aria-labelledby="seo-list-heading">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h2 id="seo-list-heading" className="wordmark text-2xl text-ink">
          Cheap beer in {placeName}, cheapest first
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {intro ??
            `${venues.length} ${venues.length === 1 ? "place" : "places"} in ${placeName} with a
             beer under $20, starting at ${formatCents(cheapest)}.`}{" "}
          Prices are what the menu says — before tax, never including tip. Each one shows when
          somebody last confirmed it, because a beer price with no date on it is worth very little.
        </p>

        <ol className="mt-6 divide-y divide-rule border-y border-rule">
          {venues.map((venue) => {
            const headline = venue.deals[0];
            if (!headline) return null;

            return (
              <li key={venue.id} className="py-4">
                <div className="flex items-baseline gap-3">
                  <span className="price-hero shrink-0 text-2xl text-ink">
                    {formatCents(venue.cheapestPriceCents)}
                  </span>
                  <h3 className="text-base font-bold leading-snug">
                    <Link
                      href={`/venue/${venue.slug}`}
                      className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                    >
                      {venue.name}
                    </Link>
                  </h3>
                </div>

                <p className="mt-1 text-sm text-ink-soft">
                  {[venue.neighborhood, venue.address1, venue.city, venue.state]
                    .filter(Boolean)
                    .join(", ")}
                </p>

                <ul className="mt-2 space-y-1 text-sm">
                  {venue.deals.slice(0, 6).map((deal) => (
                    <li key={deal.id} className="text-ink">
                      <span className="font-semibold tabular-nums">
                        {formatCents(deal.priceCents)}
                      </span>{" "}
                      {deal.beerName}
                      <span className="text-ink-faint">
                        {" — "}
                        {formatServingDescription(deal)}
                        {deal.isHappyHour && deal.scheduleSummary
                          ? `, happy hour ${deal.scheduleSummary.toLowerCase()}`
                          : ""}
                      </span>
                      <span className="text-ink-faint">
                        {". "}
                        {freshnessLabel(deal.daysSinceVerified)}
                        {deal.verificationCount > 0
                          ? ` by ${deal.verificationCount} ${
                              deal.verificationCount === 1 ? "person" : "people"
                            }`
                          : ""}
                        .
                      </span>
                    </li>
                  ))}
                  {venue.deals.length > 6 && (
                    <li className="text-ink-faint">
                      <Link href={`/venue/${venue.slug}`} className="underline underline-offset-2">
                        {venue.deals.length - 6} more at {venue.name}
                      </Link>
                    </li>
                  )}
                </ul>
              </li>
            );
          })}
        </ol>

        <h2 className="wordmark mt-10 text-xl text-ink">How to read these prices</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">
          <p>
            Every price here was reported by a person — from a menu, a bar&apos;s own website, or
            somebody who went and looked. Nothing is scraped and nothing is estimated. When a bar
            advertises &ldquo;$1 drafts&rdquo; without saying how big the pour is, that is recorded
            as unknown rather than guessed, which is why some entries say{" "}
            <em>size unknown</em> instead of showing a price per ounce.
            {withKnownSize.length > 0 && (
              <>
                {" "}
                Of the deals listed here, {withKnownSize.length} state a size, so those can be
                compared by value.
              </>
            )}
          </p>
          <p>
            The date on each line is the last time someone confirmed it. Anything older than three
            months is flagged as likely outdated rather than hidden, because an old price you can
            sanity-check beats a blank page. If you go somewhere on this list, tapping{" "}
            <strong>Still there</strong> or <strong>Gone</strong> takes one second and no account,
            and it is what keeps the rest of the list honest.
          </p>
        </div>
      </div>
    </section>
  );
}
