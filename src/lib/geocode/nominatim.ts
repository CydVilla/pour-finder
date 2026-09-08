import "server-only";
import { envString } from "@/lib/env";
import type { GeocodeResult, Geocoder } from "./types";

/**
 * OpenStreetMap Nominatim. Free, but its usage policy requires an identifying
 * User-Agent with a contact address and caps you at ~1 request/second, so it is
 * opt-in (GEOCODER=nominatim) and only ever runs for queries the offline
 * gazetteer could not answer.
 *
 * For production volume, swap this file for Geoapify / Google / Pelias. The
 * interface is the whole contract.
 */
export const nominatimGeocoder: Geocoder = {
  name: "nominatim",

  async search(query, options): Promise<GeocodeResult[]> {
    const base = envString("NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org");
    const email = envString("NOMINATIM_CONTACT_EMAIL");
    if (!email) {
      console.warn(
        "[geocode] NOMINATIM_CONTACT_EMAIL is unset; Nominatim requires it. Skipping.",
      );
      return [];
    }

    const url = new URL("/search", base);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("countrycodes", "us");
    url.searchParams.set("limit", String(Math.min(options?.limit ?? 5, 10)));
    url.searchParams.set("email", email);

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": `PourFinder/0.1 (${email})` },
        // Cache aggressively: the same "Somerville MA" resolves identically.
        next: { revalidate: 86_400 },
      });
      if (!response.ok) return [];

      const data = (await response.json()) as NominatimPlace[];
      return data.map(toResult);
    } catch (error) {
      console.warn("[geocode] Nominatim request failed", error);
      return [];
    }
  },
};

interface NominatimPlace {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  address?: { city?: string; town?: string; village?: string; state?: string; postcode?: string };
}

const STATE_ABBR: Record<string, string> = {
  Massachusetts: "MA", "Rhode Island": "RI", "New Hampshire": "NH", Connecticut: "CT",
  Vermont: "VT", Maine: "ME", "New York": "NY",
};

function toResult(place: NominatimPlace): GeocodeResult {
  const address = place.address ?? {};
  const stateName = address.state ?? null;
  const precision: GeocodeResult["precision"] =
    place.type === "house" ? "rooftop" : address.postcode ? "postal" : "city";

  return {
    label: place.display_name,
    latitude: Number(place.lat),
    longitude: Number(place.lon),
    city: address.city ?? address.town ?? address.village ?? null,
    state: stateName ? (STATE_ABBR[stateName] ?? stateName.slice(0, 2).toUpperCase()) : null,
    postalCode: address.postcode ?? null,
    precision,
    defaultRadiusMeters: precision === "city" ? 8000 : 3000,
    source: "nominatim",
  };
}
