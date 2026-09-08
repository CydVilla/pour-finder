import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { places } from "@/db/schema";
import { DiscoveryApp } from "@/components/DiscoveryApp";
import { SeoContent } from "@/components/SeoContent";
import { siteUrl } from "@/lib/env";
import { parseFilters } from "@/lib/filters";
import {
  breadcrumbSchema,
  jsonLdGraph,
  listDescription,
  listTitle,
  venueListSchema,
} from "@/lib/seo";
import { searchDeals } from "@/server/deals-query";

/**
 * /ma — a state landing page.
 *
 * Same application, pre-filtered, plus a crawlable text version of the same
 * data below it. Cached for five minutes rather than force-dynamic: these are
 * the pages search engines hit, and making every crawl a database round trip
 * wastes crawl budget for no freshness benefit at this cadence.
 */
export const revalidate = 300;

async function loadState(code: string) {
  if (!/^[a-z]{2}$/i.test(code)) return null;
  const [row] = await db
    .select()
    .from(places)
    .where(and(eq(places.kind, "state"), eq(places.slug, code.toLowerCase())))
    .limit(1);
  return row ?? null;
}

/** Pre-render the states that actually have venues; the rest render on demand. */
export async function generateStaticParams() {
  try {
    const rows = (await db.execute(sql`
      SELECT DISTINCT lower(venues.state) AS state
      FROM venues
      JOIN deals ON deals.venue_id = venues.id AND deals.status = 'active'
      WHERE venues.status <> 'permanently_closed'
      LIMIT 60
    `)) as unknown as { state: string }[];
    return rows.map((row) => ({ state: row.state }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>;
}): Promise<Metadata> {
  const { state } = await params;
  const row = await loadState(state);
  if (!row) return { title: "Not found" };

  const filters = parseFilters(new URLSearchParams({ state: row.state ?? state.toUpperCase() }));
  const result = await searchDeals(filters, "meta-state");

  return {
    title: listTitle(row.name, result.venues),
    description: listDescription(row.name, result.venues),
    alternates: { canonical: `/${row.slug}` },
    openGraph: {
      title: listTitle(row.name, result.venues),
      description: listDescription(row.name, result.venues),
      url: `${siteUrl()}/${row.slug}`,
      type: "website",
    },
  };
}

export default async function StatePage({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const row = await loadState(state);
  if (!row) notFound();

  const code = row.state ?? state.toUpperCase();
  const filters = parseFilters(new URLSearchParams({ state: code }));
  const initialData = await searchDeals(filters, "ssr-state");
  const base = siteUrl();

  // Cities in this state that actually have deals — the crawl path downward.
  const cities = (await db.execute(sql`
    SELECT venues.city AS name, venues.city_slug AS slug, COUNT(DISTINCT venues.id)::int AS venue_count
    FROM venues
    JOIN deals ON deals.venue_id = venues.id AND deals.status = 'active'
    WHERE venues.state = ${code} AND venues.status <> 'permanently_closed'
    GROUP BY venues.city, venues.city_slug
    ORDER BY venue_count DESC, venues.city ASC
    LIMIT 60
  `)) as unknown as { name: string; slug: string; venue_count: number }[];

  return (
    <>
      <main>
        <h1 className="sr-only">{listTitle(row.name, initialData.venues)}</h1>
        <div className="h-[85dvh]">
          <DiscoveryApp initialData={initialData} initialFilters={filters} />
        </div>

        <SeoContent venues={initialData.venues} placeName={row.name} />

        {cities.length > 0 && (
          <nav aria-label="Cities" className="border-t border-rule bg-paper-sunk">
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
              <h2 className="wordmark text-xl text-ink">Browse {row.name} by city</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {cities.map((city) => (
                  <li key={city.slug}>
                    <Link
                      href={`/${row.slug}/${city.slug}`}
                      className="pf-chip px-3 py-1.5 text-sm"
                    >
                      {city.name}
                      <span className="text-ink-faint">{city.venue_count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
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
              { name: row.name, url: `${base}/${row.slug}` },
            ]),
            venueListSchema(initialData.venues, base, `Cheap beer in ${row.name}`),
          ]),
        }}
      />
    </>
  );
}
