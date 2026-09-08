import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiscoveryApp } from "@/components/DiscoveryApp";
import { SeoContent } from "@/components/SeoContent";
import { siteUrl } from "@/lib/env";
import { findCity } from "@/lib/geocode";
import { PRICE_PRESETS_CENTS, parseFilters } from "@/lib/filters";
import { formatCents } from "@/lib/money";
import { breadcrumbSchema, jsonLdGraph, venueListSchema } from "@/lib/seo";
import { searchDeals } from "@/server/deals-query";

/**
 * /deals-under/5/ma/boston
 *
 * "cheap beer under $5 in boston" is a real query with real intent, and it is
 * a genuinely different page from /ma/boston — different result set, different
 * ranking, different answer. Only the preset price points get a route, so this
 * cannot fan out into thousands of near-duplicate pages; anything else is a
 * filter on the main app and is not linked or indexed.
 */
export const revalidate = 600;

const ALLOWED = new Set(PRICE_PRESETS_CENTS.map((c) => c / 100));

async function load(maxPrice: string, state: string, city: string) {
  const dollars = Number(maxPrice);
  if (!Number.isInteger(dollars) || !ALLOWED.has(dollars)) return null;

  const row = await findCity(state, city);
  if (!row) return null;

  const filters = parseFilters(
    new URLSearchParams({
      state: row.state ?? state.toUpperCase(),
      citySlug: row.slug,
      maxPriceCents: String(dollars * 100),
      lat: String(row.latitude),
      lng: String(row.longitude),
    }),
  );
  return { row, dollars, filters, result: await searchDeals(filters, "deals-under") };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ maxPrice: string; state: string; city: string }>;
}): Promise<Metadata> {
  const { maxPrice, state, city } = await params;
  const loaded = await load(maxPrice, state, city);
  if (!loaded) return { title: "Not found", robots: { index: false } };

  const { row, dollars, result } = loaded;
  const cap = formatCents(dollars * 100);
  const count = result.venues.length;

  const title =
    count > 0
      ? `Beer under ${cap} in ${row.name}, ${row.state} — ${count} ${count === 1 ? "bar" : "bars"}`
      : `Beer under ${cap} in ${row.name}, ${row.state}`;

  return {
    title,
    description:
      count > 0
        ? `${count} places in ${row.name} pouring a beer for ${cap} or less, cheapest first. Every price shows when it was last confirmed.`
        : `No beer under ${cap} listed in ${row.name} yet.`,
    alternates: { canonical: `/deals-under/${dollars}/${state.toLowerCase()}/${city}` },
    // An empty price tier is thin content; keep it reachable but out of the index.
    robots: count === 0 ? { index: false, follow: true } : undefined,
  };
}

export default async function DealsUnderPage({
  params,
}: {
  params: Promise<{ maxPrice: string; state: string; city: string }>;
}) {
  const { maxPrice, state, city } = await params;
  const loaded = await load(maxPrice, state, city);
  if (!loaded) notFound();

  const { row, dollars, filters, result } = loaded;
  const cap = formatCents(dollars * 100);
  const place = `${row.name}, ${row.state}`;
  const base = siteUrl();
  const stateSlug = (row.state ?? state).toLowerCase();

  return (
    <>
      <main>
        <h1 className="sr-only">
          Beer under {cap} in {place}
        </h1>
        <div className="h-[85dvh]">
          <DiscoveryApp initialData={result} initialFilters={filters} />
        </div>

        <SeoContent
          venues={result.venues}
          placeName={place}
          intro={`${result.venues.length} ${
            result.venues.length === 1 ? "place" : "places"
          } in ${row.name} where a beer costs ${cap} or less.`}
        />

        <nav aria-label="Related" className="border-t border-rule bg-paper-sunk">
          <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
            <h2 className="wordmark text-xl text-ink">Other price points</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {PRICE_PRESETS_CENTS.filter((c) => c / 100 !== dollars).map((cents) => (
                <li key={cents}>
                  <Link
                    href={`/deals-under/${cents / 100}/${stateSlug}/${row.slug}`}
                    className="pf-chip px-3 py-1.5 text-sm"
                  >
                    Under {formatCents(cents)}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={`/${stateSlug}/${row.slug}`} className="pf-chip px-3 py-1.5 text-sm">
                  All prices in {row.name}
                </Link>
              </li>
            </ul>
          </div>
        </nav>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdGraph([
            breadcrumbSchema([
              { name: "Pour Finder", url: base },
              { name: row.state ?? "", url: `${base}/${stateSlug}` },
              { name: row.name, url: `${base}/${stateSlug}/${row.slug}` },
              {
                name: `Under ${cap}`,
                url: `${base}/deals-under/${dollars}/${stateSlug}/${row.slug}`,
              },
            ]),
            venueListSchema(result.venues, base, `Beer under ${cap} in ${place}`),
          ]),
        }}
      />
    </>
  );
}
