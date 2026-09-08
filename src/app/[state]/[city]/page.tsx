import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { DiscoveryApp } from "@/components/DiscoveryApp";
import { SeoContent } from "@/components/SeoContent";
import { siteUrl } from "@/lib/env";
import { findCity } from "@/lib/geocode";
import { PRICE_PRESETS_CENTS, parseFilters } from "@/lib/filters";
import { formatCents } from "@/lib/money";
import {
  breadcrumbSchema,
  jsonLdGraph,
  listDescription,
  listTitle,
  venueListSchema,
} from "@/lib/seo";
import { searchDeals } from "@/server/deals-query";

/** /ma/boston — the same app scoped to one city, plus crawlable content. */
export const revalidate = 300;

export async function generateStaticParams() {
  try {
    const rows = (await db.execute(sql`
      SELECT DISTINCT lower(venues.state) AS state, venues.city_slug AS city
      FROM venues
      JOIN deals ON deals.venue_id = venues.id AND deals.status = 'active'
      WHERE venues.status <> 'permanently_closed'
      LIMIT 500
    `)) as unknown as { state: string; city: string }[];
    return rows.map((row) => ({ state: row.state, city: row.city }));
  } catch {
    return [];
  }
}

async function load(state: string, city: string) {
  const row = await findCity(state, city);
  if (!row) return null;
  const filters = parseFilters(
    new URLSearchParams({
      state: row.state ?? state.toUpperCase(),
      citySlug: row.slug,
      lat: String(row.latitude),
      lng: String(row.longitude),
    }),
  );
  return { row, filters, result: await searchDeals(filters, "city") };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string; city: string }>;
}): Promise<Metadata> {
  const { state, city } = await params;
  const loaded = await load(state, city);
  if (!loaded) return { title: "Not found" };

  const place = `${loaded.row.name}, ${loaded.row.state}`;
  return {
    title: listTitle(place, loaded.result.venues),
    description: listDescription(place, loaded.result.venues),
    alternates: { canonical: `/${state.toLowerCase()}/${city}` },
    openGraph: {
      title: listTitle(place, loaded.result.venues),
      description: listDescription(place, loaded.result.venues),
      url: `${siteUrl()}/${state.toLowerCase()}/${city}`,
      type: "website",
    },
  };
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ state: string; city: string }>;
}) {
  const { state, city } = await params;
  const loaded = await load(state, city);
  if (!loaded) notFound();

  const { row, filters, result } = loaded;
  const place = `${row.name}, ${row.state}`;
  const base = siteUrl();
  const stateSlug = (row.state ?? state).toLowerCase();

  // Only offer price cuts that would actually return something.
  const priceLinks = PRICE_PRESETS_CENTS.filter((cents) =>
    result.venues.some((v) => v.cheapestPriceCents <= cents),
  );

  return (
    <>
      <main>
        <h1 className="sr-only">{listTitle(place, result.venues)}</h1>
        <div className="h-[85dvh]">
          <DiscoveryApp initialData={result} initialFilters={filters} />
        </div>

        <SeoContent venues={result.venues} placeName={place} />

        {priceLinks.length > 0 && (
          <nav aria-label="Browse by price" className="border-t border-rule bg-paper-sunk">
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
              <h2 className="wordmark text-xl text-ink">Browse {row.name} by price</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {priceLinks.map((cents) => (
                  <li key={cents}>
                    <Link
                      href={`/deals-under/${cents / 100}/${stateSlug}/${row.slug}`}
                      className="pf-chip px-3 py-1.5 text-sm"
                    >
                      Beer under {formatCents(cents)}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-ink-soft">
                Or see{" "}
                <Link href={`/${stateSlug}`} className="underline underline-offset-2">
                  every cheap beer in {row.state === "MA" ? "Massachusetts" : row.state}
                </Link>
                .
              </p>
            </div>
          </nav>
        )}
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdGraph([
            breadcrumbSchema([
              { name: "Pour Finder", url: base },
              { name: row.state ?? "", url: `${base}/${stateSlug}` },
              { name: row.name, url: `${base}/${stateSlug}/${row.slug}` },
            ]),
            venueListSchema(result.venues, base, `Cheap beer in ${place}`),
          ]),
        }}
      />
    </>
  );
}
