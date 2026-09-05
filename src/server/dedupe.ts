import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { boundingBoxFromRadius, haversineMeters } from "@/db/geo";
import { normalizeBeerName, normalizeVenueName } from "@/lib/slug";

/**
 * Duplicate detection for community submissions.
 *
 * Runs on the candidate set only: venues are pre-filtered by a small bounding
 * box, so the O(n*m) string comparison never touches more than a handful of
 * rows regardless of how many venues exist nationally.
 *
 * Nothing here blocks a submission. It annotates it so the moderation queue
 * can show "this looks like Coogan's, which we already have".
 */

export interface DuplicateCandidate {
  kind: "venue" | "deal";
  id: string;
  label: string;
  /** 0-1. Combined name similarity and (for venues) proximity. */
  score: number;
}

/** Radius inside which two similarly-named venues are probably the same one. */
const VENUE_PROXIMITY_METERS = 250;
const VENUE_NAME_THRESHOLD = 0.55;

export async function findDuplicateVenues(input: {
  name: string;
  latitude: number;
  longitude: number;
  city?: string;
}): Promise<DuplicateCandidate[]> {
  const box = boundingBoxFromRadius(
    { lat: input.latitude, lng: input.longitude },
    VENUE_PROXIMITY_METERS,
  );

  const rows = (await db.execute(sql`
    SELECT id, name, name_normalized, city, state, address1, latitude, longitude
    FROM venues
    WHERE latitude BETWEEN ${box.minLat}::double precision AND ${box.maxLat}::double precision
      AND longitude BETWEEN ${box.minLng}::double precision AND ${box.maxLng}::double precision
    LIMIT 200
  `)) as unknown as {
    id: string;
    name: string;
    name_normalized: string;
    city: string;
    state: string;
    address1: string | null;
    latitude: number;
    longitude: number;
  }[];

  const target = normalizeVenueName(input.name);
  const candidates: DuplicateCandidate[] = [];

  for (const row of rows) {
    const nameScore = similarity(target, row.name_normalized);
    if (nameScore < VENUE_NAME_THRESHOLD) continue;

    const distance = haversineMeters(
      { lat: input.latitude, lng: input.longitude },
      { lat: Number(row.latitude), lng: Number(row.longitude) },
    );
    if (distance > VENUE_PROXIMITY_METERS) continue;

    // Closer + more similar name = higher confidence it's the same venue.
    const proximityScore = 1 - distance / VENUE_PROXIMITY_METERS;
    candidates.push({
      kind: "venue",
      id: row.id,
      label: `${row.name} — ${row.address1 ?? row.city}, ${row.state}`,
      score: round2(nameScore * 0.7 + proximityScore * 0.3),
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

export async function findDuplicateDeals(input: {
  venueId: string;
  beerName: string;
  servingType: string;
  priceCents: number;
}): Promise<DuplicateCandidate[]> {
  const rows = (await db.execute(sql`
    SELECT id, beer_name, price_cents, serving_type, serving_size_oz, serving_size_label, status
    FROM deals
    WHERE venue_id = ${input.venueId} AND status IN ('active', 'pending_review')
    LIMIT 100
  `)) as unknown as {
    id: string;
    beer_name: string;
    price_cents: number;
    serving_type: string;
    serving_size_oz: string | null;
    serving_size_label: string | null;
  }[];

  const target = normalizeBeerName(input.beerName);
  const candidates: DuplicateCandidate[] = [];

  for (const row of rows) {
    const nameScore = similarity(target, normalizeBeerName(row.beer_name));
    if (nameScore < 0.6) continue;

    // Same beer at a different size or a materially different price is a
    // legitimately separate deal, not a duplicate.
    const sameServing = row.serving_type === input.servingType;
    const priceDelta = Math.abs(Number(row.price_cents) - input.priceCents);
    const priceClose = priceDelta <= 50;

    let score = nameScore * 0.6;
    if (sameServing) score += 0.2;
    if (priceClose) score += 0.2;
    if (score < 0.7) continue;

    const size = row.serving_size_oz ?? row.serving_size_label ?? "size unknown";
    candidates.push({
      kind: "deal",
      id: row.id,
      label: `${row.beer_name} — $${(Number(row.price_cents) / 100).toFixed(2)} (${size})`,
      score: round2(score),
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * Sørensen–Dice coefficient over character bigrams. Chosen over Levenshtein
 * because it is order-tolerant ("Tavern Coogan" vs "Coogan Tavern") and cheap.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return a.length === 0 ? 0 : 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const gram = a.slice(i, i + 2);
    bigrams.set(gram, (bigrams.get(gram) ?? 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const gram = b.slice(i, i + 2);
    const count = bigrams.get(gram) ?? 0;
    if (count > 0) {
      bigrams.set(gram, count - 1);
      intersection += 1;
    }
  }

  return (2 * intersection) / (a.length - 1 + b.length - 1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
