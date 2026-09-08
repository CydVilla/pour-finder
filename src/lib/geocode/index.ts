import "server-only";
import { envString } from "@/lib/env";
import { gazetteerGeocoder } from "./gazetteer";
import { nominatimGeocoder } from "./nominatim";
import type { GeocodeResult } from "./types";

export type { GeocodeResult, Geocoder } from "./types";
export { gazetteerGeocoder, findCity } from "./gazetteer";

/**
 * Gazetteer first, always. The optional provider only sees queries the free
 * offline table could not answer, which keeps external calls (and cost) near
 * zero even if a paid geocoder is configured later.
 */
export async function geocode(query: string, limit = 6): Promise<GeocodeResult[]> {
  const local = await gazetteerGeocoder.search(query, { limit });
  if (local.length > 0) return local;

  if (envString("GEOCODER", "gazetteer") === "nominatim") {
    return nominatimGeocoder.search(query, { limit });
  }
  return [];
}
