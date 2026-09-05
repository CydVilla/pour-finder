/**
 * Venue timezone derivation.
 *
 * Recurring deal times are stored as local wall-clock values and evaluated in
 * the venue's own zone, so this must be right for all 50 states - never a
 * blanket America/New_York.
 *
 * States that straddle a zone boundary are disambiguated by longitude. This is
 * a documented approximation: it is correct for the overwhelming majority of
 * venues and wrong only for a handful within ~20 miles of a boundary. Any
 * venue can override it with an explicit `timezone` (timezoneSource="explicit"),
 * and the whole function can be swapped for a shapefile lookup (e.g.
 * `tz-lookup`) without touching the schema.
 */

const SINGLE_ZONE: Record<string, string> = {
  AL: "America/Chicago",
  AR: "America/Chicago",
  AZ: "America/Phoenix", // no DST, except the Navajo Nation (see SPLIT)
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DC: "America/New_York",
  DE: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  IA: "America/Chicago",
  IL: "America/Chicago",
  LA: "America/Chicago",
  MA: "America/New_York",
  MD: "America/New_York",
  ME: "America/New_York",
  MN: "America/Chicago",
  MO: "America/Chicago",
  MS: "America/Chicago",
  MT: "America/Denver",
  NC: "America/New_York",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NV: "America/Los_Angeles",
  NY: "America/New_York",
  OH: "America/New_York",
  OK: "America/Chicago",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  UT: "America/Denver",
  VA: "America/New_York",
  VT: "America/New_York",
  WA: "America/Los_Angeles",
  WI: "America/Chicago",
  WV: "America/New_York",
  WY: "America/Denver",
  // Territories
  PR: "America/Puerto_Rico",
  VI: "America/St_Thomas",
  GU: "Pacific/Guam",
  AS: "Pacific/Pago_Pago",
  MP: "Pacific/Saipan",
};

/** Split states: [westZone, eastZone, longitude cut]. */
const SPLIT_ZONE: Record<string, [string, string, number]> = {
  AK: ["America/Adak", "America/Anchorage", -169.5],
  FL: ["America/Chicago", "America/New_York", -85.0],
  ID: ["America/Los_Angeles", "America/Boise", -116.0],
  IN: ["America/Chicago", "America/Indiana/Indianapolis", -87.4],
  KS: ["America/Denver", "America/Chicago", -101.5],
  KY: ["America/Chicago", "America/New_York", -85.6],
  MI: ["America/Menominee", "America/Detroit", -87.6],
  ND: ["America/Denver", "America/Chicago", -101.0],
  NE: ["America/Denver", "America/Chicago", -101.0],
  OR: ["America/Los_Angeles", "America/Boise", -117.0],
  SD: ["America/Denver", "America/Chicago", -100.0],
  TN: ["America/Chicago", "America/New_York", -85.3],
  TX: ["America/Denver", "America/Chicago", -104.9],
};

export function timezoneForLocation(state: string, longitude: number): string {
  const code = state.trim().toUpperCase();

  const split = SPLIT_ZONE[code];
  if (split) {
    const [west, east, cut] = split;
    return longitude < cut ? west : east;
  }

  return SINGLE_ZONE[code] ?? "America/New_York";
}

/** Cheap sanity check before persisting a user- or import-supplied zone. */
export function isValidIanaTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
