import { describe, expect, it } from "vitest";
import { isValidIanaTimezone, timezoneForLocation } from "./timezone";

/** Every US state and DC, so a new launch state cannot be silently missing. */
const ALL_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

/** A longitude comfortably inside each state, used only to pick a zone. */
const INSIDE: Record<string, number> = {
  AL: -86.8,
  AK: -149.9,
  AZ: -112.1,
  AR: -92.3,
  CA: -119.4,
  CO: -105.5,
  CT: -72.7,
  DE: -75.5,
  DC: -77.0,
  FL: -81.5,
  GA: -83.4,
  HI: -157.8,
  ID: -114.7,
  IL: -89.0,
  IN: -86.1,
  IA: -93.5,
  KS: -98.0,
  KY: -84.5,
  LA: -91.9,
  ME: -69.4,
  MD: -76.6,
  MA: -71.1,
  MI: -84.5,
  MN: -94.6,
  MS: -89.6,
  MO: -92.6,
  MT: -110.0,
  NE: -99.9,
  NV: -116.4,
  NH: -71.5,
  NJ: -74.4,
  NM: -106.0,
  NY: -74.0,
  NC: -79.0,
  ND: -100.0,
  OH: -82.9,
  OK: -97.5,
  OR: -120.5,
  PA: -77.2,
  RI: -71.5,
  SC: -80.9,
  SD: -99.4,
  TN: -86.6,
  TX: -97.6,
  UT: -111.9,
  VT: -72.6,
  VA: -78.6,
  WA: -120.7,
  WV: -80.6,
  WI: -89.6,
  WY: -107.3,
};

describe("timezoneForLocation", () => {
  it("returns a zone the platform actually knows for every state", () => {
    // The point of the module: never a blanket America/New_York for 50 states.
    for (const state of ALL_STATES) {
      const zone = timezoneForLocation(state, INSIDE[state]!);
      expect(isValidIanaTimezone(zone), `${state} -> ${zone}`).toBe(true);
    }
  });

  it("does not quietly put the whole country on Eastern", () => {
    const zones = new Set(ALL_STATES.map((s) => timezoneForLocation(s, INSIDE[s]!)));
    expect(zones.size).toBeGreaterThan(5);
  });

  it("gets the launch state right", () => {
    expect(timezoneForLocation("MA", -71.0589)).toBe("America/New_York");
  });

  it("accepts whatever casing or padding the caller has", () => {
    expect(timezoneForLocation("ma", -71.06)).toBe("America/New_York");
    expect(timezoneForLocation(" Ma ", -71.06)).toBe("America/New_York");
  });

  it("splits a straddling state by longitude", () => {
    // Florida's panhandle is Central, the peninsula is Eastern.
    expect(timezoneForLocation("FL", -87.2)).toBe("America/Chicago"); // Pensacola
    expect(timezoneForLocation("FL", -80.2)).toBe("America/New_York"); // Miami
    // West Texas is Mountain.
    expect(timezoneForLocation("TX", -106.5)).toBe("America/Denver"); // El Paso
    expect(timezoneForLocation("TX", -95.4)).toBe("America/Chicago"); // Houston
  });

  it("keeps the states that do not observe DST on their own zone", () => {
    expect(timezoneForLocation("AZ", -112.1)).toBe("America/Phoenix");
    expect(timezoneForLocation("HI", -157.8)).toBe("Pacific/Honolulu");
  });

  it("falls back rather than throwing on an unknown code", () => {
    expect(isValidIanaTimezone(timezoneForLocation("ZZ", 0))).toBe(true);
  });
});

describe("isValidIanaTimezone", () => {
  it("accepts real zones", () => {
    expect(isValidIanaTimezone("America/New_York")).toBe(true);
    expect(isValidIanaTimezone("Pacific/Honolulu")).toBe(true);
  });

  it("rejects junk instead of letting it reach the database", () => {
    expect(isValidIanaTimezone("Mars/Olympus")).toBe(false);
    expect(isValidIanaTimezone("")).toBe(false);
    expect(isValidIanaTimezone("EST5EDT-nonsense")).toBe(false);
  });
});

describe("DST correctness", () => {
  const offsetMinutes = (zone: string, iso: string) => {
    const date = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "numeric",
      hour12: false,
    }).formatToParts(date);
    return Number(parts.find((p) => p.type === "hour")!.value);
  };

  it("shifts with daylight saving where the state observes it", () => {
    const winter = offsetMinutes("America/New_York", "2026-01-15T17:00:00Z");
    const summer = offsetMinutes("America/New_York", "2026-07-15T17:00:00Z");
    expect(winter).toBe(12); // UTC-5
    expect(summer).toBe(13); // UTC-4
  });

  it("does not shift in Arizona", () => {
    const winter = offsetMinutes("America/Phoenix", "2026-01-15T17:00:00Z");
    const summer = offsetMinutes("America/Phoenix", "2026-07-15T17:00:00Z");
    expect(winter).toBe(summer);
  });
});
