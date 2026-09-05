/**
 * Wire types shared by the API routes and the client. Kept separate from the
 * Drizzle row types so the database can change shape without breaking the
 * client contract (and so we never leak submitter hashes to the browser).
 */
import type {
  DealStatus,
  GeoPrecision,
  ServingType,
  SourceType,
  VenueStatus,
  VenueType,
} from "@/db/schema";
import type { Freshness } from "./freshness";
import type { ScheduleWindow } from "./format";

export interface DealDTO {
  id: string;
  venueId: string;

  beerName: string;
  brand: string | null;
  beerStyle: string | null;
  abv: number | null;

  priceCents: number;
  currency: string;

  servingType: ServingType;
  /** null means genuinely unknown. Never inferred. */
  servingSizeOz: number | null;
  servingSizeLabel: string | null;
  quantity: number;
  individualServingSizeOz: number | null;
  totalOunces: number | null;
  /** null whenever totalOunces is null - value sort must not guess. */
  pricePerOunceCents: number | null;

  description: string | null;
  restrictions: string | null;
  ruleDescription: string | null;

  isHappyHour: boolean;
  isRecurring: boolean;
  isConditional: boolean;
  schedule: ScheduleWindow[];
  scheduleSummary: string | null;
  /** null when availability can't be determined programmatically. */
  isAvailableNow: boolean | null;

  sourceType: SourceType;
  sourceUrl: string | null;
  sourceSnapshot: string | null;

  lastVerifiedAt: string | null;
  daysSinceVerified: number | null;
  verificationCount: number;
  disputeCount: number;
  freshness: Freshness;
  confidence: number;

  status: DealStatus;
  startsAt: string | null;
  expiresAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  createdAt: string;
}

export interface VenueDTO {
  id: string;
  name: string;
  slug: string;
  chainName: string | null;

  address1: string | null;
  address2: string | null;
  city: string;
  citySlug: string;
  neighborhood: string | null;
  state: string;
  postalCode: string | null;

  latitude: number;
  longitude: number;
  geoPrecision: GeoPrecision;
  timezone: string;

  website: string | null;
  phone: string | null;
  venueType: VenueType;
  status: VenueStatus;
  notes: string | null;

  /** Metres from the request origin, or null when no origin was supplied. */
  distanceMeters: number | null;

  deals: DealDTO[];
  /** Deals matching the current filters (deals.length), for the summary line. */
  dealCount: number;
  /** Cheapest matching deal, drives the map marker. */
  cheapestPriceCents: number;
  bestFreshness: Freshness;
}

export interface DealSearchResponse {
  venues: VenueDTO[];
  /** Total matching venues before the limit. Powers "showing 60 of 214". */
  total: number;
  truncated: boolean;
  /** Echoed so the client can tell which response a late reply belongs to. */
  requestId: string;
  geoBackend: "postgis" | "haversine";
}

export interface VenueSearchResult {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  address1: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number | null;
  /** 0-1 name-similarity score when the query was fuzzy. */
  score?: number;
}

export interface PlaceSuggestion {
  kind: "state" | "city" | "neighborhood" | "postal_code";
  name: string;
  slug: string;
  state: string | null;
  label: string;
  latitude: number;
  longitude: number;
  defaultRadiusMeters: number;
}

export type SearchSuggestion =
  | ({ type: "venue" } & VenueSearchResult)
  | ({ type: "place" } & PlaceSuggestion);

export interface ApiError {
  error: string;
  detail?: string;
  fieldErrors?: Record<string, string[]>;
}

export interface SubmitResult {
  ok: true;
  submissionId: string;
  status: "pending" | "approved";
  message: string;
  possibleDuplicates: { kind: "venue" | "deal"; id: string; label: string; score: number }[];
}

export interface VerifyResult {
  ok: true;
  dealId: string;
  verificationCount: number;
  disputeCount: number;
  lastVerifiedAt: string | null;
  freshness: Freshness;
  message: string;
}
