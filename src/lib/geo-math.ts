/**
 * Pure geographic math. No database, no server imports - this module is safe
 * in the browser bundle, which is why it lives here rather than in src/db.
 * src/db/geo.ts re-exports it alongside the SQL-emitting half.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export const EARTH_RADIUS_M = 6_371_008.8;
export const METERS_PER_MILE = 1609.344;

/** Conservative bbox enclosing a circle. Clamps near the poles. */
export function boundingBoxFromRadius(origin: LatLng, meters: number): BoundingBox {
  const latDelta = (meters / EARTH_RADIUS_M) * (180 / Math.PI);
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  // Guard against division blow-up within ~11m of a pole.
  const lngDelta =
    Math.abs(cosLat) < 1e-6 ? 180 : (meters / (EARTH_RADIUS_M * Math.abs(cosLat))) * (180 / Math.PI);

  return {
    minLat: clampLat(origin.lat - latDelta),
    maxLat: clampLat(origin.lat + latDelta),
    minLng: normalizeLng(origin.lng - lngDelta),
    maxLng: normalizeLng(origin.lng + lngDelta),
  };
}

/** Great-circle distance in metres. Mirrors the SQL expression exactly. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.asin(Math.sqrt(h));
}

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

export function milesToMeters(miles: number): number {
  return miles * METERS_PER_MILE;
}

export function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

export function normalizeLng(lng: number): number {
  let out = lng;
  while (out > 180) out -= 360;
  while (out < -180) out += 360;
  return out;
}

/** Guards against a client sending a whole-world bbox and asking for everything. */
export function isSaneBoundingBox(box: BoundingBox): boolean {
  return (
    Number.isFinite(box.minLat) &&
    Number.isFinite(box.maxLat) &&
    Number.isFinite(box.minLng) &&
    Number.isFinite(box.maxLng) &&
    box.minLat >= -90 &&
    box.maxLat <= 90 &&
    box.minLat < box.maxLat
  );
}

/** Grows a bbox by a percentage so panning slightly doesn't force a refetch. */
export function padBoundingBox(box: BoundingBox, factor = 0.15): BoundingBox {
  const latPad = (box.maxLat - box.minLat) * factor;
  const lngSpan =
    box.minLng <= box.maxLng ? box.maxLng - box.minLng : 360 - box.minLng + box.maxLng;
  const lngPad = lngSpan * factor;
  return {
    minLat: clampLat(box.minLat - latPad),
    maxLat: clampLat(box.maxLat + latPad),
    minLng: normalizeLng(box.minLng - lngPad),
    maxLng: normalizeLng(box.maxLng + lngPad),
  };
}
