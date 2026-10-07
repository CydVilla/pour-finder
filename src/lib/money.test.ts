import { describe, expect, it } from "vitest";
import {
  formatCents,
  formatHeroPrice,
  formatPricePerOunce,
  parseDollarsToCents,
  totalOunces,
} from "./money";

describe("formatCents", () => {
  it("drops the decimals on a whole dollar", () => {
    expect(formatCents(100)).toBe("$1");
    expect(formatCents(2000)).toBe("$20");
  });

  it("keeps two decimals otherwise", () => {
    expect(formatCents(595)).toBe("$5.95");
    expect(formatCents(150)).toBe("$1.50");
  });

  it("formats zero as a whole dollar, not as free", () => {
    // Only the hero price editorialises; this one is plain formatting.
    expect(formatCents(0)).toBe("$0");
  });
});

describe("formatHeroPrice", () => {
  it("calls a zero price what it is", () => {
    expect(formatHeroPrice(0)).toBe("Free");
  });

  it("is otherwise just the price", () => {
    expect(formatHeroPrice(100)).toBe("$1");
    expect(formatHeroPrice(595)).toBe("$5.95");
  });
});

describe("formatPricePerOunce", () => {
  it("returns null when the size is unknown", () => {
    // The whole point: an unknown size must never be rendered as a guess.
    expect(formatPricePerOunce(null)).toBeNull();
  });

  it("refuses a non-finite value rather than printing NaN", () => {
    expect(formatPricePerOunce(Number.NaN)).toBeNull();
    expect(formatPricePerOunce(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("renders cents-per-ounce as dollars", () => {
    expect(formatPricePerOunce(30)).toBe("$0.30/oz");
    expect(formatPricePerOunce(37.1875)).toBe("$0.37/oz");
  });
});

describe("parseDollarsToCents", () => {
  it("accepts the shapes people actually type", () => {
    expect(parseDollarsToCents("5")).toBe(500);
    expect(parseDollarsToCents("$5")).toBe(500);
    expect(parseDollarsToCents("5.50")).toBe(550);
    expect(parseDollarsToCents("$5.50")).toBe(550);
    expect(parseDollarsToCents("  $4.25 ")).toBe(425);
    expect(parseDollarsToCents("1,000")).toBe(100_000);
  });

  it("treats a free beer as zero, not as nothing entered", () => {
    expect(parseDollarsToCents("0")).toBe(0);
    expect(parseDollarsToCents("$0")).toBe(0);
  });

  it("returns null for an empty or junk value", () => {
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("   ")).toBeNull();
    expect(parseDollarsToCents("cheap")).toBeNull();
    expect(parseDollarsToCents("-5")).toBeNull();
    expect(parseDollarsToCents("5.")).toBe(500);
  });

  it("rejects more precision than money has", () => {
    expect(parseDollarsToCents("5.555")).toBeNull();
  });

  it("rounds in integer cents rather than drifting in floats", () => {
    // 1.15 * 100 is 114.99999999999999 in IEEE 754.
    expect(parseDollarsToCents("1.15")).toBe(115);
    expect(parseDollarsToCents("8.21")).toBe(821);
  });
});

describe("totalOunces", () => {
  it("multiplies out a bucket", () => {
    expect(totalOunces({ servingSizeOz: null, individualServingSizeOz: 12, quantity: 5 })).toBe(60);
  });

  it("prefers the per-item size over a total when both are present", () => {
    expect(totalOunces({ servingSizeOz: 16, individualServingSizeOz: 12, quantity: 5 })).toBe(60);
  });

  it("falls back to a single serving size", () => {
    expect(totalOunces({ servingSizeOz: 16, individualServingSizeOz: null, quantity: 1 })).toBe(16);
  });

  it("returns null when nothing is known, so callers cannot guess", () => {
    expect(
      totalOunces({ servingSizeOz: null, individualServingSizeOz: null, quantity: 1 }),
    ).toBeNull();
  });

  it("treats a zero size as unknown rather than dividing by it", () => {
    expect(totalOunces({ servingSizeOz: 0, individualServingSizeOz: 0, quantity: 2 })).toBeNull();
  });
});
