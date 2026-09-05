/**
 * Geocoding is behind an interface on purpose.
 *
 * Mapbox's terms forbid *storing* geocoding results unless you also use their
 * maps - a real trap for a venue database. So the provider is pluggable and the
 * default costs nothing: a local gazetteer of US cities/ZIPs that covers the
 * "search by city or ZIP" case entirely offline.
 */
export interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  /** How tight the match is; drives the default map zoom/radius. */
  precision: "rooftop" | "street" | "postal" | "city" | "region";
  defaultRadiusMeters: number;
  source: "gazetteer" | "nominatim" | "manual";
}

export interface Geocoder {
  readonly name: string;
  search(query: string, options?: { limit?: number }): Promise<GeocodeResult[]>;
}
