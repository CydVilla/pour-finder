/**
 * The main discovery query.
 *
 * Two round trips, deliberately:
 *   1. Rank and page VENUES (aggregating over their matching deals).
 *   2. Fetch the matching deals for exactly that page of venues.
 *
 * Doing it in one query would either fan out rows (N deals x venue columns) or
 * force a lateral/JSON aggregation that the planner handles badly once the
 * dataset is large. Two indexed queries stay flat as the corpus grows, and the
 * second one is bounded by `limit`, never by the size of the result set.
 *
 * Nothing here is Massachusetts-aware. `state` is one optional predicate among
 * many and is never implied by proximity.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  boundingBoxFromRadius,
  distanceMeters as distanceMetersSql,
  isSaneBoundingBox,
  resolveGeoBackend,
  withinBoundingBox,
  withinRadius,
  type GeoBackend,
} from "@/db/geo";
import { BEER_TAGS, beerTagById } from "@/lib/beer";
import type { DealFilters } from "@/lib/filters";
import { formatSchedule, type ScheduleWindow } from "@/lib/format";
import { confidenceScore, freshnessFromDays, FRESHNESS_ORDER, type Freshness } from "@/lib/freshness";
import { totalOunces } from "@/lib/money";
import type { DealDTO, DealSearchResponse, VenueDTO } from "@/lib/types";
import {
  daysSinceVerified,
  freshnessRank,
  isAllDay,
  isAvailableNow,
  scheduleJson,
  withinLifecycleWindow,
} from "./sql-fragments";

/** Hard ceiling regardless of what the client asks for. */
const MAX_VENUES = 300;

export async function searchDeals(
  filters: DealFilters,
  requestId = "",
): Promise<DealSearchResponse> {
  const backend = await resolveGeoBackend();
  const origin =
    filters.lat !== undefined && filters.lng !== undefined
      ? { lat: filters.lat, lng: filters.lng }
      : null;

  const conditions = buildConditions(filters, backend);
  const where = conditions.length ? sql.join(conditions, sql` AND `) : sql`TRUE`;

  const distanceExpr = origin
    ? distanceMetersSql(origin, backend)
    : sql<number | null>`NULL::double precision`;

  const limit = Math.min(filters.limit, MAX_VENUES);

  const venueRows = (await db.execute(sql`
    WITH matching AS (
      SELECT
        deals.venue_id,
        deals.price_cents,
        deals.price_per_ounce_cents,
        deals.last_verified_at,
        deals.verification_count,
        ${freshnessRank} AS freshness_rank
      FROM deals
      JOIN venues ON venues.id = deals.venue_id
      WHERE ${where}
    ),
    agg AS (
      SELECT
        venue_id,
        MIN(price_cents)              AS cheapest_price_cents,
        MIN(price_per_ounce_cents)    AS best_price_per_oz,
        MIN(freshness_rank)           AS best_freshness_rank,
        MAX(last_verified_at)         AS last_verified_at,
        SUM(verification_count)       AS total_confirmations,
        COUNT(*)                      AS deal_count
      FROM matching
      GROUP BY venue_id
    )
    SELECT
      venues.id, venues.name, venues.slug, venues.chain_name,
      venues.address1, venues.address2, venues.city, venues.city_slug,
      venues.neighborhood, venues.state, venues.postal_code,
      venues.latitude, venues.longitude, venues.geo_precision, venues.timezone,
      venues.website, venues.phone, venues.venue_type, venues.status, venues.notes,
      agg.cheapest_price_cents,
      agg.best_price_per_oz,
      agg.best_freshness_rank,
      agg.last_verified_at,
      agg.total_confirmations,
      agg.deal_count,
      ${distanceExpr} AS distance_meters,
      COUNT(*) OVER () AS total_count
    FROM agg
    JOIN venues ON venues.id = agg.venue_id
    ORDER BY ${orderBy(filters.sort, Boolean(origin))}
    LIMIT ${limit} OFFSET ${filters.offset}
  `)) as unknown as VenueRow[];

  if (venueRows.length === 0) {
    return { venues: [], total: 0, truncated: false, requestId, geoBackend: backend };
  }

  const venueIds = venueRows.map((r) => r.id);
  const dealRows = (await db.execute(sql`
    SELECT
      deals.*,
      ${isAvailableNow}   AS is_available_now,
      ${daysSinceVerified} AS days_since_verified,
      ${scheduleJson}     AS schedule
    FROM deals
    JOIN venues ON venues.id = deals.venue_id
    WHERE deals.venue_id = ANY(${sql`ARRAY[${sql.join(venueIds.map((id) => sql`${id}`), sql`, `)}]::uuid[]`})
      AND ${where}
    ORDER BY ${dealOrderBy(filters.sort)}
  `)) as unknown as DealRow[];

  const dealsByVenue = new Map<string, DealDTO[]>();
  for (const row of dealRows) {
    const list = dealsByVenue.get(row.venue_id) ?? [];
    list.push(toDealDTO(row));
    dealsByVenue.set(row.venue_id, list);
  }

  const total = Number(venueRows[0]?.total_count ?? 0);
  const venues = venueRows.map((row) => toVenueDTO(row, dealsByVenue.get(row.id) ?? []));

  return {
    venues,
    total,
    truncated: total > filters.offset + venues.length,
    requestId,
    geoBackend: backend,
  };
}

/* --------------------------------------------------------------- WHERE */

function buildConditions(filters: DealFilters, backend: GeoBackend): SQL[] {
  const conditions: SQL[] = [];

  // ---- lifecycle -------------------------------------------------------
  if (filters.includeInactive) {
    conditions.push(sql`deals.status <> 'rejected'`);
    conditions.push(sql`venues.status <> 'unknown' OR TRUE`);
  } else {
    conditions.push(sql`deals.status = 'active'`);
    conditions.push(withinLifecycleWindow);
    // Temporarily closed venues stay visible but are badged in the UI; only
    // permanently closed ones drop out, and their history is never deleted.
    conditions.push(sql`venues.status <> 'permanently_closed'`);
  }

  // ---- price -----------------------------------------------------------
  if (filters.maxPriceCents !== undefined) {
    conditions.push(sql`deals.price_cents <= ${filters.maxPriceCents}`);
  }

  // ---- geography -------------------------------------------------------
  // Radius and viewport are independent: radius comes from "near me" or a
  // place search, viewport comes from the map. Both may be present.
  if (filters.lat !== undefined && filters.lng !== undefined && filters.radiusMeters) {
    conditions.push(
      withinRadius({ lat: filters.lat, lng: filters.lng }, filters.radiusMeters, backend),
    );
  }

  const box = {
    minLat: filters.minLat,
    maxLat: filters.maxLat,
    minLng: filters.minLng,
    maxLng: filters.maxLng,
  };
  if (
    box.minLat !== undefined &&
    box.maxLat !== undefined &&
    box.minLng !== undefined &&
    box.maxLng !== undefined
  ) {
    const bbox = {
      minLat: box.minLat,
      maxLat: box.maxLat,
      minLng: box.minLng,
      maxLng: box.maxLng,
    };
    if (isSaneBoundingBox(bbox)) conditions.push(withinBoundingBox(bbox, backend));
  }

  // ---- organizational --------------------------------------------------
  if (filters.state) conditions.push(sql`venues.state = ${filters.state}`);
  if (filters.citySlug) conditions.push(sql`venues.city_slug = ${filters.citySlug}`);
  if (filters.neighborhood) {
    conditions.push(sql`lower(venues.neighborhood) = ${filters.neighborhood.toLowerCase()}`);
  }

  // ---- text search -----------------------------------------------------
  if (filters.q) {
    const like = `%${escapeLike(filters.q)}%`;
    conditions.push(sql`(
      venues.name ILIKE ${like}
      OR venues.city ILIKE ${like}
      OR venues.neighborhood ILIKE ${like}
      OR venues.address1 ILIKE ${like}
      OR venues.chain_name ILIKE ${like}
      OR deals.beer_name ILIKE ${like}
      OR deals.brand ILIKE ${like}
      OR deals.beer_style ILIKE ${like}
    )`);
  }

  // ---- serving type ----------------------------------------------------
  if (filters.servingTypes.length > 0) {
    const values = sql.join(
      filters.servingTypes.map((t) => sql`${t}`),
      sql`, `,
    );
    conditions.push(sql`deals.serving_type IN (${values})`);
  }

  // ---- beer tags -------------------------------------------------------
  if (filters.beerTags.length > 0) {
    const clauses: SQL[] = [];
    for (const tagId of filters.beerTags) {
      const tag = beerTagById(tagId) ?? BEER_TAGS.find((t) => t.id === tagId);
      if (!tag) continue;
      for (const term of tag.match) {
        const like = `%${escapeLike(term)}%`;
        clauses.push(
          sql`(deals.beer_name ILIKE ${like} OR deals.brand ILIKE ${like} OR deals.beer_style ILIKE ${like})`,
        );
      }
    }
    if (clauses.length > 0) conditions.push(sql`(${sql.join(clauses, sql` OR `)})`);
  }

  // ---- availability ----------------------------------------------------
  if (filters.availableNow) conditions.push(isAvailableNow);
  if (filters.happyHourOnly) conditions.push(sql`deals.is_happy_hour = TRUE`);
  if (filters.allDayOnly) conditions.push(sql`(${isAllDay} AND deals.is_happy_hour = FALSE)`);

  if (filters.dayPart !== "any") {
    const days = filters.dayPart === "weekend" ? [0, 6] : [1, 2, 3, 4, 5];
    const dayList = sql.join(days.map((d) => sql`${d}`), sql`, `);
    // A deal with no schedule runs every day, so it satisfies both day parts.
    conditions.push(sql`(
      NOT EXISTS (SELECT 1 FROM deal_schedules s WHERE s.deal_id = deals.id)
      OR EXISTS (
        SELECT 1 FROM deal_schedules s
        WHERE s.deal_id = deals.id AND s.day_of_week IN (${dayList})
      )
    )`);
  }

  // ---- freshness -------------------------------------------------------
  if (filters.verifiedWithinDays !== undefined) {
    conditions.push(
      sql`deals.last_verified_at > now() - (${filters.verifiedWithinDays} * interval '1 day')`,
    );
  }

  return conditions;
}

/**
 * Explicit tie-breakers. Many venues will share "$1", so ranking must be
 * deterministic and meaningful rather than whatever order the heap returns:
 * freshness, then confirmations, then distance, then name.
 */
function orderBy(sort: DealFilters["sort"], hasOrigin: boolean): SQL {
  const distanceTiebreak = hasOrigin ? sql`distance_meters ASC NULLS LAST,` : sql``;

  switch (sort) {
    case "value":
      return sql`best_price_per_oz ASC NULLS LAST, cheapest_price_cents ASC, best_freshness_rank ASC, ${distanceTiebreak} venues.name ASC`;
    case "distance":
      return hasOrigin
        ? sql`distance_meters ASC NULLS LAST, cheapest_price_cents ASC, best_freshness_rank ASC, venues.name ASC`
        : sql`cheapest_price_cents ASC, best_freshness_rank ASC, venues.name ASC`;
    case "verified":
      return sql`best_freshness_rank ASC, last_verified_at DESC NULLS LAST, cheapest_price_cents ASC, ${distanceTiebreak} venues.name ASC`;
    case "confirmed":
      return sql`total_confirmations DESC NULLS LAST, best_freshness_rank ASC, cheapest_price_cents ASC, ${distanceTiebreak} venues.name ASC`;
    case "price":
    default:
      return sql`cheapest_price_cents ASC, best_freshness_rank ASC, total_confirmations DESC NULLS LAST, ${distanceTiebreak} venues.name ASC`;
  }
}

/**
 * Orders the deals *within* a venue to match the active sort, so the headline
 * deal on a card is the one the user asked to sort by. Sorting by "best value"
 * and then showing the cheapest deal makes the ranking look wrong.
 *
 * The venue's `cheapestPriceCents` (and therefore the map marker) always stays
 * the genuine minimum, so "3 deals from $1" remains true either way.
 */
function dealOrderBy(sort: DealFilters["sort"]): SQL {
  switch (sort) {
    case "value":
      return sql`deals.price_per_ounce_cents ASC NULLS LAST, deals.price_cents ASC, deals.beer_name ASC`;
    case "verified":
      return sql`deals.last_verified_at DESC NULLS LAST, deals.price_cents ASC, deals.beer_name ASC`;
    case "confirmed":
      return sql`deals.verification_count DESC, deals.price_cents ASC, deals.beer_name ASC`;
    case "price":
    case "distance":
    default:
      return sql`deals.price_cents ASC, deals.beer_name ASC`;
  }
}

/** Postgres LIKE metacharacters, so "100%" doesn't become a wildcard. */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/* ------------------------------------------------------------- mapping */

interface VenueRow {
  id: string;
  name: string;
  slug: string;
  chain_name: string | null;
  address1: string | null;
  address2: string | null;
  city: string;
  city_slug: string;
  neighborhood: string | null;
  state: string;
  postal_code: string | null;
  latitude: number;
  longitude: number;
  geo_precision: VenueDTO["geoPrecision"];
  timezone: string;
  website: string | null;
  phone: string | null;
  venue_type: VenueDTO["venueType"];
  status: VenueDTO["status"];
  notes: string | null;
  cheapest_price_cents: number | string;
  best_price_per_oz: string | null;
  best_freshness_rank: number | string;
  last_verified_at: string | Date | null;
  total_confirmations: number | string | null;
  deal_count: number | string;
  distance_meters: number | string | null;
  total_count: number | string;
}

interface DealRow {
  id: string;
  venue_id: string;
  beer_name: string;
  brand: string | null;
  beer_style: string | null;
  abv: string | null;
  price_cents: number;
  currency: string;
  serving_size_oz: string | null;
  serving_size_label: string | null;
  serving_type: DealDTO["servingType"];
  quantity: number;
  individual_serving_size_oz: string | null;
  price_per_ounce_cents: string | null;
  description: string | null;
  restrictions: string | null;
  rule_description: string | null;
  is_happy_hour: boolean;
  is_recurring: boolean;
  is_conditional: boolean;
  starts_at: string | Date | null;
  expires_at: string | Date | null;
  source_type: DealDTO["sourceType"];
  source_url: string | null;
  source_snapshot: string | null;
  last_verified_at: string | Date | null;
  days_since_verified: number | string | null;
  verification_count: number;
  dispute_count: number;
  status: DealDTO["status"];
  ended_at: string | Date | null;
  ended_reason: string | null;
  created_at: string | Date;
  is_available_now: boolean;
  schedule: ScheduleWindow[];
}

const RANK_TO_FRESHNESS: Freshness[] = ["fresh", "aging", "stale", "likely_outdated", "unverified"];

function toVenueDTO(row: VenueRow, deals: DealDTO[]): VenueDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    chainName: row.chain_name,
    address1: row.address1,
    address2: row.address2,
    city: row.city,
    citySlug: row.city_slug,
    neighborhood: row.neighborhood,
    state: row.state,
    postalCode: row.postal_code,
    latitude: num(row.latitude) ?? 0,
    longitude: num(row.longitude) ?? 0,
    geoPrecision: row.geo_precision,
    timezone: row.timezone,
    website: row.website,
    phone: row.phone,
    venueType: row.venue_type,
    status: row.status,
    notes: row.notes,
    distanceMeters: num(row.distance_meters),
    deals,
    dealCount: Number(row.deal_count),
    cheapestPriceCents: Number(row.cheapest_price_cents),
    bestFreshness: RANK_TO_FRESHNESS[Number(row.best_freshness_rank)] ?? "unverified",
  };
}

function toDealDTO(row: DealRow): DealDTO {
  const servingSizeOz = num(row.serving_size_oz);
  const individualServingSizeOz = num(row.individual_serving_size_oz);
  const days = row.days_since_verified === null ? null : Number(row.days_since_verified);
  const schedule = Array.isArray(row.schedule) ? row.schedule : [];

  return {
    id: row.id,
    venueId: row.venue_id,
    beerName: row.beer_name,
    brand: row.brand,
    beerStyle: row.beer_style,
    abv: num(row.abv),
    priceCents: Number(row.price_cents),
    currency: row.currency,
    servingType: row.serving_type,
    servingSizeOz,
    servingSizeLabel: row.serving_size_label,
    quantity: Number(row.quantity),
    individualServingSizeOz,
    totalOunces: totalOunces({
      servingSizeOz,
      individualServingSizeOz,
      quantity: Number(row.quantity),
    }),
    pricePerOunceCents: num(row.price_per_ounce_cents),
    description: row.description,
    restrictions: row.restrictions,
    ruleDescription: row.rule_description,
    isHappyHour: row.is_happy_hour,
    isRecurring: row.is_recurring,
    isConditional: row.is_conditional,
    schedule,
    scheduleSummary: formatSchedule(schedule),
    // A conditional deal ("during Red Sox games") can't be resolved from a
    // clock, so we say "unknown" rather than claiming it's available.
    isAvailableNow: row.is_conditional ? null : row.is_available_now,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    sourceSnapshot: row.source_snapshot,
    lastVerifiedAt: iso(row.last_verified_at),
    daysSinceVerified: days,
    verificationCount: Number(row.verification_count),
    disputeCount: Number(row.dispute_count),
    freshness: freshnessFromDays(days),
    confidence: confidenceScore({
      sourceType: row.source_type,
      daysSinceVerified: days,
      verificationCount: Number(row.verification_count),
      disputeCount: Number(row.dispute_count),
    }),
    status: row.status,
    startsAt: iso(row.starts_at),
    expiresAt: iso(row.expires_at),
    endedAt: iso(row.ended_at),
    endedReason: row.ended_reason,
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
  };
}

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export { FRESHNESS_ORDER };
