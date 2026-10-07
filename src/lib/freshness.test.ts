import { describe, expect, it } from "vitest";
import {
  confidenceLevel,
  confidenceScore,
  daysSince,
  freshnessFromDays,
  freshnessHint,
  freshnessLabel,
  FRESHNESS_THRESHOLD_DAYS,
} from "./freshness";

describe("freshnessFromDays", () => {
  it("separates never-confirmed from confirmed-long-ago", () => {
    // These are different claims and must never collapse into one badge.
    expect(freshnessFromDays(null)).toBe("unverified");
    expect(freshnessFromDays(500)).toBe("likely_outdated");
  });

  it("puts each threshold day on the generous side of the boundary", () => {
    const { fresh, aging, stale } = FRESHNESS_THRESHOLD_DAYS;
    expect(freshnessFromDays(fresh)).toBe("fresh");
    expect(freshnessFromDays(fresh + 1)).toBe("aging");
    expect(freshnessFromDays(aging)).toBe("aging");
    expect(freshnessFromDays(aging + 1)).toBe("stale");
    expect(freshnessFromDays(stale)).toBe("stale");
    expect(freshnessFromDays(stale + 1)).toBe("likely_outdated");
  });

  it("treats today as fresh", () => {
    expect(freshnessFromDays(0)).toBe("fresh");
  });
});

describe("daysSince", () => {
  const now = new Date("2026-10-07T12:00:00Z");

  it("is null for a missing date", () => {
    expect(daysSince(null, now)).toBeNull();
  });

  it("is null for an unparseable date rather than NaN", () => {
    expect(daysSince("not a date", now)).toBeNull();
  });

  it("counts whole days", () => {
    expect(daysSince("2026-10-07T00:00:00Z", now)).toBe(0);
    expect(daysSince("2026-10-06T00:00:00Z", now)).toBe(1);
    expect(daysSince("2026-09-07T12:00:00Z", now)).toBe(30);
  });

  it("clamps a future date to zero instead of going negative", () => {
    expect(daysSince("2027-01-01T00:00:00Z", now)).toBe(0);
  });
});

describe("freshnessLabel", () => {
  it("is explicit about never having been confirmed", () => {
    expect(freshnessLabel(null)).toBe("Not yet verified");
  });

  it("uses plain words for the last couple of days", () => {
    expect(freshnessLabel(0)).toBe("Verified today");
    expect(freshnessLabel(1)).toBe("Verified yesterday");
  });

  it("scales the unit with the age", () => {
    expect(freshnessLabel(3)).toBe("Verified 3 days ago");
    expect(freshnessLabel(14)).toBe("Verified 2 weeks ago");
    expect(freshnessLabel(60)).toBe("Verified 2 months ago");
    expect(freshnessLabel(400)).toBe("Verified over a year ago");
  });

  it("never says '1 weeks'", () => {
    expect(freshnessLabel(8)).toBe("Verified 1 week ago");
    expect(freshnessLabel(31)).toBe("Verified 1 month ago");
  });
});

describe("freshnessHint", () => {
  it("stays quiet while a deal is still trustworthy", () => {
    expect(freshnessHint("fresh", 1)).toBeNull();
    expect(freshnessHint("aging", 20)).toBeNull();
  });

  it("warns once a deal is old", () => {
    expect(freshnessHint("stale", 60)).toMatch(/double-check/i);
    expect(freshnessHint("likely_outdated", 120)).toMatch(/confirm before you go/i);
    expect(freshnessHint("likely_outdated", 400)).toMatch(/over a year/i);
    expect(freshnessHint("unverified", null)).toMatch(/nobody has confirmed/i);
  });
});

describe("confidenceScore", () => {
  const base = {
    sourceType: "community_submission" as const,
    daysSinceVerified: 1,
    verificationCount: 0,
    disputeCount: 0,
  };

  it("stays inside 0-100 however the inputs pile up", () => {
    expect(confidenceScore({ ...base, verificationCount: 1000 })).toBeLessThanOrEqual(100);
    expect(confidenceScore({ ...base, disputeCount: 1000 })).toBeGreaterThanOrEqual(0);
  });

  it("trusts an official menu more than an anonymous report", () => {
    expect(confidenceScore({ ...base, sourceType: "official_menu" })).toBeGreaterThan(
      confidenceScore(base),
    );
  });

  it("decays with age", () => {
    const recent = confidenceScore(base);
    const old = confidenceScore({ ...base, daysSinceVerified: 400 });
    expect(old).toBeLessThan(recent);
  });

  it("rewards independent confirmation and punishes disputes", () => {
    expect(confidenceScore({ ...base, verificationCount: 3 })).toBeGreaterThan(
      confidenceScore(base),
    );
    expect(confidenceScore({ ...base, disputeCount: 2 })).toBeLessThan(confidenceScore(base));
  });

  it("lets disputes outweigh confirmations", () => {
    // Two people saying "gone" should beat two saying "still there".
    const disputed = confidenceScore({ ...base, verificationCount: 2, disputeCount: 2 });
    const clean = confidenceScore({ ...base, verificationCount: 2 });
    expect(disputed).toBeLessThan(clean);
  });

  it("returns a whole number", () => {
    expect(Number.isInteger(confidenceScore(base))).toBe(true);
  });
});

describe("confidenceLevel", () => {
  it("bands the score", () => {
    expect(confidenceLevel(100)).toBe("high");
    expect(confidenceLevel(70)).toBe("high");
    expect(confidenceLevel(69)).toBe("medium");
    expect(confidenceLevel(45)).toBe("medium");
    expect(confidenceLevel(44)).toBe("low");
    expect(confidenceLevel(0)).toBe("low");
  });
});
