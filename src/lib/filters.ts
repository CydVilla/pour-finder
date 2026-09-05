/**
 * The single definition of "what the user is asking for".
 *
 * Shared by the route handler (parsing), the query builder (SQL) and the client
 * (URL state). Adding a filter means touching this file and the query builder,
 * nothing else.
 */
import { z } from "zod";
import { servingTypeEnum } from "@/db/schema";
import { isBeerTagId } from "./beer";

export const SORT_OPTIONS = [
  { id: "price", label: "Cheapest" },
  { id: "value", label: "Best value" },
  { id: "distance", label: "Closest" },
  { id: "verified", label: "Recently verified" },
  { id: "confirmed", label: "Most confirmed" },
] as const;

export type SortId = (typeof SORT_OPTIONS)[number]["id"];

export const PRICE_PRESETS_CENTS = [200, 300, 500, 1000, 2000] as const;
export const RADIUS_PRESETS_MILES = [1, 3, 5, 10, 25] as const;
export const FRESHNESS_PRESETS_DAYS = [7, 30, 90] as const;

const coerceNumber = z.coerce.number().finite();

export const filterSchema = z.object({
  /** Free text: venue name, beer name, neighborhood. */
  q: z.string().trim().max(120).optional(),

  /** Integer cents. Absent means no ceiling - $0 is a valid deal price. */
  maxPriceCents: coerceNumber.int().min(0).max(1_000_000).optional(),

  servingTypes: z.array(z.enum(servingTypeEnum.enumValues)).default([]),
  /** Ids from BEER_TAGS. Mixed styles and brands on purpose. */
  beerTags: z.array(z.string().refine(isBeerTagId, "unknown beer tag")).default([]),

  /** Proximity. Only applied when both lat and lng are present. */
  lat: coerceNumber.min(-90).max(90).optional(),
  lng: coerceNumber.min(-180).max(180).optional(),
  radiusMeters: coerceNumber.int().min(100).max(200_000).optional(),

  /** Map viewport. Independent of radius: the map drives this one. */
  minLat: coerceNumber.min(-90).max(90).optional(),
  maxLat: coerceNumber.min(-90).max(90).optional(),
  minLng: coerceNumber.min(-180).max(180).optional(),
  maxLng: coerceNumber.min(-180).max(180).optional(),

  /** Organizational filters. Never an implicit fence on proximity search. */
  state: z.string().trim().length(2).toUpperCase().optional(),
  citySlug: z.string().trim().max(80).optional(),
  neighborhood: z.string().trim().max(80).optional(),

  /** Availability. */
  availableNow: z.coerce.boolean().optional(),
  happyHourOnly: z.coerce.boolean().optional(),
  allDayOnly: z.coerce.boolean().optional(),
  dayPart: z.enum(["any", "weekday", "weekend"]).default("any"),

  /** Only deals verified within N days. */
  verifiedWithinDays: coerceNumber.int().min(1).max(3650).optional(),

  sort: z.enum(["price", "value", "distance", "verified", "confirmed"]).default("price"),

  limit: coerceNumber.int().min(1).max(300).default(60),
  offset: coerceNumber.int().min(0).max(10_000).default(0),

  /** Include permanently closed venues and expired deals (history views). */
  includeInactive: z.coerce.boolean().default(false),
});

export type DealFilters = z.infer<typeof filterSchema>;
export type DealFiltersInput = z.input<typeof filterSchema>;

export const DEFAULT_FILTERS: DealFilters = filterSchema.parse({});

/** Comma-separated array params: `servingTypes=draft,can`. */
function splitList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

/**
 * Parses filters out of URLSearchParams. Unknown/invalid values are dropped
 * rather than throwing: a mangled shared link should still render a usable
 * page, not a 400.
 */
export function parseFilters(params: URLSearchParams): DealFilters {
  const raw: Record<string, unknown> = {};
  for (const key of [
    "q", "maxPriceCents", "lat", "lng", "radiusMeters",
    "minLat", "maxLat", "minLng", "maxLng",
    "state", "citySlug", "neighborhood",
    "verifiedWithinDays", "sort", "limit", "offset", "dayPart",
  ]) {
    const value = params.get(key);
    if (value !== null && value !== "") raw[key] = value;
  }
  for (const key of ["availableNow", "happyHourOnly", "allDayOnly", "includeInactive"]) {
    const value = params.get(key);
    if (value === "1" || value === "true") raw[key] = true;
  }
  const servingTypes = splitList(params.get("servingTypes"));
  if (servingTypes) raw.servingTypes = servingTypes;
  const beerTags = splitList(params.get("beerTags"));
  if (beerTags) raw.beerTags = beerTags;

  const result = filterSchema.safeParse(raw);
  if (result.success) return result.data;

  // Retry without the offending keys so one bad param can't nuke the request.
  const bad = new Set(result.error.issues.map((i) => String(i.path[0])));
  for (const key of bad) delete raw[key];
  return filterSchema.parse(raw);
}

/** Inverse of parseFilters. Omits defaults so URLs stay short and shareable. */
export function serializeFilters(filters: Partial<DealFilters>): URLSearchParams {
  const params = new URLSearchParams();
  const put = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  };

  put("q", filters.q);
  put("maxPriceCents", filters.maxPriceCents);
  if (filters.servingTypes?.length) params.set("servingTypes", filters.servingTypes.join(","));
  if (filters.beerTags?.length) params.set("beerTags", filters.beerTags.join(","));
  put("lat", filters.lat !== undefined ? round(filters.lat, 5) : undefined);
  put("lng", filters.lng !== undefined ? round(filters.lng, 5) : undefined);
  put("radiusMeters", filters.radiusMeters);
  put("minLat", filters.minLat !== undefined ? round(filters.minLat, 5) : undefined);
  put("maxLat", filters.maxLat !== undefined ? round(filters.maxLat, 5) : undefined);
  put("minLng", filters.minLng !== undefined ? round(filters.minLng, 5) : undefined);
  put("maxLng", filters.maxLng !== undefined ? round(filters.maxLng, 5) : undefined);
  put("state", filters.state);
  put("citySlug", filters.citySlug);
  put("neighborhood", filters.neighborhood);
  if (filters.availableNow) params.set("availableNow", "1");
  if (filters.happyHourOnly) params.set("happyHourOnly", "1");
  if (filters.allDayOnly) params.set("allDayOnly", "1");
  if (filters.includeInactive) params.set("includeInactive", "1");
  if (filters.dayPart && filters.dayPart !== "any") params.set("dayPart", filters.dayPart);
  put("verifiedWithinDays", filters.verifiedWithinDays);
  if (filters.sort && filters.sort !== "price") params.set("sort", filters.sort);
  if (filters.limit && filters.limit !== DEFAULT_FILTERS.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));

  return params;
}

/**
 * Filters the user can see and clear, excluding map viewport and paging.
 * Drives the "N filters active" badge and the Clear all button.
 */
export function countActiveFilters(filters: DealFilters): number {
  let count = 0;
  if (filters.q) count += 1;
  if (filters.maxPriceCents !== undefined) count += 1;
  count += filters.servingTypes.length ? 1 : 0;
  count += filters.beerTags.length ? 1 : 0;
  if (filters.availableNow) count += 1;
  if (filters.happyHourOnly) count += 1;
  if (filters.allDayOnly) count += 1;
  if (filters.dayPart !== "any") count += 1;
  if (filters.verifiedWithinDays !== undefined) count += 1;
  if (filters.radiusMeters !== undefined) count += 1;
  if (filters.citySlug) count += 1;
  if (filters.neighborhood) count += 1;
  return count;
}

/**
 * "Secondary" filters only - the ones behind the Filters button. Used to badge
 * that button without counting the always-visible price control.
 */
export function countSecondaryFilters(filters: DealFilters): number {
  let count = 0;
  count += filters.servingTypes.length ? 1 : 0;
  count += filters.beerTags.length ? 1 : 0;
  if (filters.availableNow) count += 1;
  if (filters.happyHourOnly) count += 1;
  if (filters.allDayOnly) count += 1;
  if (filters.dayPart !== "any") count += 1;
  if (filters.verifiedWithinDays !== undefined) count += 1;
  if (filters.radiusMeters !== undefined) count += 1;
  return count;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
