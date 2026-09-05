import "server-only";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import {
  boundingBoxFromRadius,
  distanceMeters as distanceMetersSql,
  haversineMeters,
  resolveGeoBackend,
} from "@/db/geo";
import { deals, venues, type NewVenue, type Venue } from "@/db/schema";
import { buildVenueSlug, disambiguateSlug, normalizeVenueName, slugify } from "@/lib/slug";
import { timezoneForLocation } from "@/lib/timezone";
import type { VenueSearchResult } from "@/lib/types";
import { similarity } from "./dedupe";
import { recordVenueRevision } from "./revisions";

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface CreateVenueInput {
  name: string;
  address1?: string | null;
  address2?: string | null;
  city: string;
  neighborhood?: string | null;
  state: string;
  postalCode?: string | null;
  latitude: number;
  longitude: number;
  geoPrecision?: Venue["geoPrecision"];
  venueType?: Venue["venueType"];
  website?: string | null;
  phone?: string | null;
  timezone?: string;
  chainName?: string | null;
  notes?: string | null;
  status?: Venue["status"];
  submittedBy?: string | null;
}

/**
 * The single path for creating a venue - used by the seed script, the
 * submission pipeline and any future importer. Guarantees slug uniqueness,
 * a derived timezone, and an opening revision.
 */
export async function createVenue(tx: Tx, input: CreateVenueInput): Promise<Venue> {
  const baseSlug = buildVenueSlug(input.name, input.city);
  const slug = await uniqueSlug(tx, baseSlug);

  const values: NewVenue = {
    name: input.name.trim(),
    slug,
    nameNormalized: normalizeVenueName(input.name),
    chainName: input.chainName ?? null,
    address1: input.address1 ?? null,
    address2: input.address2 ?? null,
    city: input.city.trim(),
    citySlug: slugify(input.city),
    neighborhood: input.neighborhood ?? null,
    state: input.state.trim().toUpperCase(),
    postalCode: input.postalCode ?? null,
    latitude: input.latitude,
    longitude: input.longitude,
    geoPrecision: input.geoPrecision ?? "unknown",
    timezone: input.timezone ?? timezoneForLocation(input.state, input.longitude),
    timezoneSource: input.timezone ? "explicit" : "derived",
    website: input.website ?? null,
    phone: input.phone ?? null,
    venueType: input.venueType ?? "bar",
    status: input.status ?? "active",
    notes: input.notes ?? null,
    submittedBy: input.submittedBy ?? null,
  };

  const [venue] = await tx.insert(venues).values(values).returning();
  if (!venue) throw new Error("Failed to insert venue");

  await recordVenueRevision(tx, {
    venue,
    changeType: "created",
    actor: input.submittedBy ?? "system",
  });

  return venue;
}

async function uniqueSlug(tx: Tx, base: string): Promise<string> {
  const rows = await tx
    .select({ slug: venues.slug })
    .from(venues)
    .where(or(eq(venues.slug, base), ilike(venues.slug, `${base}-%`)));
  return disambiguateSlug(base, new Set(rows.map((r) => r.slug)));
}

/**
 * Typeahead for the "which bar?" step of submission. Ranked by name similarity
 * and, when the browser shared a position, by proximity - because the venue
 * you're standing in is almost always the one you mean.
 */
export async function searchVenues(input: {
  q: string;
  lat?: number;
  lng?: number;
  limit?: number;
}): Promise<VenueSearchResult[]> {
  const q = input.q.trim();
  if (q.length < 2) return [];

  const backend = await resolveGeoBackend();
  const limit = Math.min(input.limit ?? 10, 25);
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const hasOrigin = input.lat !== undefined && input.lng !== undefined;

  const distanceExpr = hasOrigin
    ? distanceMetersSql({ lat: input.lat!, lng: input.lng! }, backend)
    : sql<number | null>`NULL::double precision`;

  const rows = (await db.execute(sql`
    SELECT
      venues.id, venues.name, venues.slug, venues.city, venues.state,
      venues.address1, venues.latitude, venues.longitude,
      ${distanceExpr} AS distance_meters
    FROM venues
    WHERE venues.status <> 'permanently_closed'
      AND (venues.name ILIKE ${like} OR venues.name_normalized ILIKE ${like} OR venues.address1 ILIKE ${like})
    ORDER BY ${hasOrigin ? sql`distance_meters ASC NULLS LAST,` : sql``} venues.name ASC
    LIMIT ${limit * 3}
  `)) as unknown as {
    id: string;
    name: string;
    slug: string;
    city: string;
    state: string;
    address1: string | null;
    latitude: number;
    longitude: number;
    distance_meters: number | string | null;
  }[];

  const normalizedQuery = normalizeVenueName(q);

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      city: row.city,
      state: row.state,
      address1: row.address1,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      distanceMeters: row.distance_meters === null ? null : Number(row.distance_meters),
      score: similarity(normalizedQuery, normalizeVenueName(row.name)),
    }))
    .sort((a, b) => {
      if (hasOrigin && a.distanceMeters !== null && b.distanceMeters !== null) {
        // Within a few hundred metres, trust the name; beyond that, distance.
        const bothClose = a.distanceMeters < 500 && b.distanceMeters < 500;
        if (!bothClose) return a.distanceMeters - b.distanceMeters;
      }
      return b.score - a.score;
    })
    .slice(0, limit);
}

/** Nearby venues regardless of name - the "I'm here, which bar is this?" case. */
export async function venuesNear(
  lat: number,
  lng: number,
  radiusMeters = 400,
  limit = 8,
): Promise<VenueSearchResult[]> {
  const box = boundingBoxFromRadius({ lat, lng }, radiusMeters);
  const rows = await db
    .select({
      id: venues.id,
      name: venues.name,
      slug: venues.slug,
      city: venues.city,
      state: venues.state,
      address1: venues.address1,
      latitude: venues.latitude,
      longitude: venues.longitude,
    })
    .from(venues)
    .where(
      and(
        sql`${venues.latitude} BETWEEN ${box.minLat}::double precision AND ${box.maxLat}::double precision`,
        sql`${venues.longitude} BETWEEN ${box.minLng}::double precision AND ${box.maxLng}::double precision`,
        sql`${venues.status} <> 'permanently_closed'`,
      ),
    )
    .limit(100);

  return rows
    .map((row) => ({
      ...row,
      distanceMeters: haversineMeters({ lat, lng }, { lat: row.latitude, lng: row.longitude }),
    }))
    .filter((row) => row.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

export async function getVenueBySlug(slug: string): Promise<Venue | null> {
  const [venue] = await db.select().from(venues).where(eq(venues.slug, slug)).limit(1);
  return venue ?? null;
}

/** All venue slugs with at least one live deal - used by the sitemap. */
export async function listIndexableVenueSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  return db
    .selectDistinct({ slug: venues.slug, updatedAt: venues.updatedAt })
    .from(venues)
    .innerJoin(deals, eq(deals.venueId, venues.id))
    .where(and(eq(deals.status, "active"), sql`${venues.status} <> 'permanently_closed'`))
    .limit(50_000);
}
