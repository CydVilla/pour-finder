import { describe, expect, it } from "vitest";
import {
  boundingBoxFromRadius,
  clampLat,
  haversineMeters,
  isSaneBoundingBox,
  metersToMiles,
  milesToMeters,
  normalizeLng,
  padBoundingBox,
} from "./geo-math";

const BOSTON = { lat: 42.3601, lng: -71.0589 };
const CAMBRIDGE = { lat: 42.3736, lng: -71.1097 };

describe("haversineMeters", () => {
  it("is zero for a point against itself", () => {
    expect(haversineMeters(BOSTON, BOSTON)).toBe(0);
  });

  it("matches a known distance", () => {
    // Boston Common to Harvard Square is ~4.5km.
    const d = haversineMeters(BOSTON, CAMBRIDGE);
    expect(d).toBeGreaterThan(4_300);
    expect(d).toBeLessThan(4_700);
  });

  it("is symmetric", () => {
    expect(haversineMeters(BOSTON, CAMBRIDGE)).toBeCloseTo(haversineMeters(CAMBRIDGE, BOSTON), 6);
  });

  it("handles antipodal-ish and equatorial spans without NaN", () => {
    const halfway = haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isFinite(halfway)).toBe(true);
    expect(halfway).toBeGreaterThan(20_000_000);
  });

  it("measures one degree of latitude at about 111km anywhere", () => {
    const atEquator = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    const atPole = haversineMeters({ lat: 80, lng: 30 }, { lat: 81, lng: 30 });
    expect(atEquator).toBeCloseTo(111_195, -2);
    expect(atPole).toBeCloseTo(atEquator, -2);
  });
});

describe("boundingBoxFromRadius", () => {
  it("encloses the circle it was built from", () => {
    const meters = 5_000;
    const box = boundingBoxFromRadius(BOSTON, meters);
    // A point due north at the radius must fall inside the box.
    const north = { lat: BOSTON.lat + (meters / 6_371_008.8) * (180 / Math.PI), lng: BOSTON.lng };
    expect(north.lat).toBeLessThanOrEqual(box.maxLat);
    expect(box.minLat).toBeLessThan(BOSTON.lat);
    expect(box.minLng).toBeLessThan(BOSTON.lng);
    expect(box.maxLng).toBeGreaterThan(BOSTON.lng);
  });

  it("widens the longitude span with latitude", () => {
    const near = boundingBoxFromRadius({ lat: 0, lng: 0 }, 5_000);
    const far = boundingBoxFromRadius({ lat: 60, lng: 0 }, 5_000);
    expect(far.maxLng - far.minLng).toBeGreaterThan(near.maxLng - near.minLng);
  });

  it("does not blow up at a pole", () => {
    const box = boundingBoxFromRadius({ lat: 90, lng: 0 }, 5_000);
    expect(Number.isFinite(box.minLng)).toBe(true);
    expect(Number.isFinite(box.maxLng)).toBe(true);
    expect(box.maxLat).toBeLessThanOrEqual(90);
  });
});

describe("normalizeLng / clampLat", () => {
  it("wraps longitude into -180..180", () => {
    expect(normalizeLng(181)).toBe(-179);
    expect(normalizeLng(-181)).toBe(179);
    expect(normalizeLng(540)).toBe(180);
    expect(normalizeLng(-71)).toBe(-71);
  });

  it("clamps latitude instead of wrapping it", () => {
    expect(clampLat(91)).toBe(90);
    expect(clampLat(-91)).toBe(-90);
    expect(clampLat(42)).toBe(42);
  });
});

describe("isSaneBoundingBox", () => {
  it("accepts a normal viewport", () => {
    expect(isSaneBoundingBox({ minLat: 42, maxLat: 43, minLng: -72, maxLng: -71 })).toBe(true);
  });

  it("rejects an inverted or degenerate box", () => {
    expect(isSaneBoundingBox({ minLat: 43, maxLat: 42, minLng: -72, maxLng: -71 })).toBe(false);
    expect(isSaneBoundingBox({ minLat: 42, maxLat: 42, minLng: -72, maxLng: -71 })).toBe(false);
  });

  it("rejects impossible latitudes and non-finite values", () => {
    expect(isSaneBoundingBox({ minLat: -91, maxLat: 43, minLng: -72, maxLng: -71 })).toBe(false);
    expect(isSaneBoundingBox({ minLat: 42, maxLat: 91, minLng: -72, maxLng: -71 })).toBe(false);
    expect(isSaneBoundingBox({ minLat: Number.NaN, maxLat: 43, minLng: -72, maxLng: -71 })).toBe(
      false,
    );
  });
});

describe("padBoundingBox", () => {
  it("grows the box", () => {
    const box = { minLat: 42, maxLat: 43, minLng: -72, maxLng: -71 };
    const padded = padBoundingBox(box, 0.1);
    expect(padded.minLat).toBeCloseTo(41.9, 6);
    expect(padded.maxLat).toBeCloseTo(43.1, 6);
    expect(padded.minLng).toBeCloseTo(-72.1, 6);
    expect(padded.maxLng).toBeCloseTo(-70.9, 6);
  });

  it("measures the span the short way across the antimeridian", () => {
    // 179..-179 is 2 degrees wide, not 358.
    const padded = padBoundingBox({ minLat: 0, maxLat: 1, minLng: 179, maxLng: -179 }, 0.5);
    expect(padded.minLng).toBeCloseTo(178, 6);
    expect(padded.maxLng).toBeCloseTo(-178, 6);
  });

  it("never pushes latitude past a pole", () => {
    const padded = padBoundingBox({ minLat: -89, maxLat: 89, minLng: -10, maxLng: 10 }, 1);
    expect(padded.minLat).toBe(-90);
    expect(padded.maxLat).toBe(90);
  });
});

describe("mile conversions", () => {
  it("round-trips", () => {
    expect(metersToMiles(milesToMeters(3))).toBeCloseTo(3, 10);
  });

  it("uses the statute mile", () => {
    expect(milesToMeters(1)).toBeCloseTo(1609.344, 6);
  });
});
