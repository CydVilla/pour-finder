import type { MetadataRoute } from "next";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { listIndexableVenueSlugs } from "@/server/venues";
import { siteUrl } from "@/lib/env";

const base = siteUrl();

/**
 * Sitemap. Grows with the dataset rather than with a hardcoded list, so
 * launching a new state adds its pages automatically.
 *
 * Regenerated hourly rather than frozen at build time: new venues should show
 * up for crawlers without a redeploy. It also degrades to just the homepage if
 * the database is unreachable, so a build never depends on one.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
  ];

  try {
    // Only cities that actually have venues; empty city pages are worse than
    // no city pages.
    const cities = (await db.execute(sql`
      SELECT DISTINCT lower(venues.state) AS state, venues.city_slug AS city
      FROM venues
      JOIN deals ON deals.venue_id = venues.id AND deals.status = 'active'
      WHERE venues.status <> 'permanently_closed'
      LIMIT 5000
    `)) as unknown as { state: string; city: string }[];

    const states = new Set(cities.map((row) => row.state));
    for (const state of states) {
      entries.push({ url: `${base}/${state}`, changeFrequency: "daily", priority: 0.8 });
    }
    for (const row of cities) {
      entries.push({
        url: `${base}/${row.state}/${row.city}`,
        changeFrequency: "daily",
        priority: 0.7,
      });
    }

    // Price-tier landing pages, only for tiers that return something.
    const tiers = (await db.execute(sql`
      SELECT lower(venues.state) AS state, venues.city_slug AS city, t.cap
      FROM (VALUES (200), (300), (500), (1000), (2000)) AS t(cap)
      CROSS JOIN LATERAL (
        SELECT DISTINCT venues.state, venues.city_slug
        FROM venues
        JOIN deals ON deals.venue_id = venues.id
         AND deals.status = 'active' AND deals.price_cents <= t.cap
        WHERE venues.status <> 'permanently_closed'
      ) AS venues
      LIMIT 2000
    `)) as unknown as { state: string; city: string; cap: number }[];

    for (const tier of tiers) {
      entries.push({
        url: `${base}/deals-under/${tier.cap / 100}/${tier.state}/${tier.city}`,
        changeFrequency: "daily",
        priority: 0.6,
      });
    }

    for (const venue of await listIndexableVenueSlugs()) {
      entries.push({
        url: `${base}/venue/${venue.slug}`,
        lastModified: venue.updatedAt,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  } catch (error) {
    console.error("[sitemap] failed to enumerate", error);
  }

  return entries;
}
