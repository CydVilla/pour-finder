import "server-only";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { places } from "@/db/schema";
import type { GeocodeResult, Geocoder } from "./types";

/**
 * Free, offline geocoder backed by the `places` table.
 *
 * Covers the overwhelmingly common cases - "Somerville", "02144", "Davis
 * Square" - with a single indexed query and zero external dependencies. Street
 * addresses fall through to whatever provider is configured next.
 */
export const gazetteerGeocoder: Geocoder = {
  name: "gazetteer",

  async search(query, options): Promise<GeocodeResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    const limit = Math.min(options?.limit ?? 6, 20);
    const isPostal = /^\d{5}(-\d{4})?$/.test(q);
    const like = `${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

    const rows = await db
      .select()
      .from(places)
      .where(
        isPostal
          ? eq(places.postalCode, q.slice(0, 5))
          : or(ilike(places.searchText, like), ilike(places.name, like)),
      )
      // Bigger places win ambiguous prefixes: "Spring" -> Springfield, not
      // Spring Hill. States sort ahead of cities, cities ahead of neighborhoods.
      .orderBy(
        sql`CASE ${places.kind}
              WHEN 'state' THEN 0
              WHEN 'city' THEN 1
              WHEN 'postal_code' THEN 2
              ELSE 3
            END`,
        sql`${places.population} DESC NULLS LAST`,
        places.name,
      )
      .limit(limit);

    return rows.map((row) => ({
      label: formatLabel(row),
      latitude: row.latitude,
      longitude: row.longitude,
      city: row.kind === "city" ? row.name : null,
      state: row.state,
      postalCode: row.postalCode,
      precision: row.kind === "postal_code" ? "postal" : row.kind === "state" ? "region" : "city",
      defaultRadiusMeters: row.defaultRadiusMeters,
      source: "gazetteer",
    }));
  },
};

function formatLabel(row: typeof places.$inferSelect): string {
  if (row.kind === "postal_code") {
    return [row.postalCode, row.name, row.state].filter(Boolean).join(" · ");
  }
  if (row.kind === "state") return row.name;
  return [row.name, row.state].filter(Boolean).join(", ");
}

/** Exact city lookup for the /[state]/[city] SEO routes. */
export async function findCity(state: string, citySlug: string) {
  const [row] = await db
    .select()
    .from(places)
    .where(
      and(
        eq(places.kind, "city"),
        eq(places.slug, citySlug),
        eq(places.state, state.toUpperCase()),
      ),
    )
    .limit(1);
  return row ?? null;
}
