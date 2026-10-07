import { describe, expect, it } from "vitest";
import { buildDealDedupeKey, normalizeBeerName, normalizeVenueName, slugify } from "./slug";

describe("slugify", () => {
  it("makes a URL-safe name", () => {
    expect(slugify("Coogan's Bar & Grill")).toBe("coogans-bar-and-grill");
    expect(slugify("J.J. Donovan's Tavern")).toBe("j-j-donovans-tavern");
  });

  it("strips accents rather than dropping the letters", () => {
    expect(slugify("Café Münchener")).toBe("cafe-munchener");
  });

  it("handles a curly apostrophe the same as a straight one", () => {
    expect(slugify("Coogan’s")).toBe(slugify("Coogan's"));
  });

  it("leaves no leading or trailing separators", () => {
    expect(slugify("  !!! The Tam !!!  ")).toBe("the-tam");
  });

  it("caps the length so a slug cannot become a URL hazard", () => {
    expect(slugify("a".repeat(200)).length).toBe(80);
  });

  it("returns an empty string when there is nothing sluggable", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("normalizeVenueName", () => {
  it("collapses the ways one bar gets typed", () => {
    const target = normalizeVenueName("Coogan's Bar & Grill");
    expect(normalizeVenueName("Coogans")).toBe(target);
    expect(normalizeVenueName("COOGAN'S BAR AND GRILL")).toBe(target);
    expect(normalizeVenueName("  coogans   bar  ")).toBe(target);
  });

  it("drops a leading article", () => {
    expect(normalizeVenueName("The Tam")).toBe(normalizeVenueName("Tam"));
  });

  it("keeps distinct bars distinct", () => {
    expect(normalizeVenueName("Sullivan's Tap")).not.toBe(normalizeVenueName("Sissy K's"));
  });
});

describe("normalizeBeerName", () => {
  it("ignores packaging words so one beer is one beer", () => {
    expect(normalizeBeerName("Narragansett tallboy")).toBe(normalizeBeerName("Narragansett"));
    expect(normalizeBeerName("Bud Light draft")).toBe(normalizeBeerName("Bud Light"));
    expect(normalizeBeerName("PBR 16 oz can")).toBe(normalizeBeerName("PBR 16"));
  });

  it("keeps the brand words that distinguish beers", () => {
    expect(normalizeBeerName("Bud Light")).not.toBe(normalizeBeerName("Bud"));
  });
});

describe("buildDealDedupeKey", () => {
  const base = {
    beerName: "Narragansett",
    servingType: "draft",
    servingSizeOz: 16 as number | null,
    servingSizeLabel: null as string | null,
    isHappyHour: false,
  };

  it("matches the same deal typed two ways", () => {
    expect(buildDealDedupeKey({ ...base, beerName: "Narragansett draft" })).toBe(
      buildDealDedupeKey(base),
    );
  });

  it("does not collide a happy-hour price with an all-day one", () => {
    // A real "$3 happy hour / $5 all day" pair on the same beer must survive.
    expect(buildDealDedupeKey({ ...base, isHappyHour: true })).not.toBe(buildDealDedupeKey(base));
  });

  it("separates different pour sizes", () => {
    expect(buildDealDedupeKey({ ...base, servingSizeOz: 12 })).not.toBe(buildDealDedupeKey(base));
  });

  it("separates different serving types", () => {
    expect(buildDealDedupeKey({ ...base, servingType: "bottle" })).not.toBe(
      buildDealDedupeKey(base),
    );
  });

  it("distinguishes an unknown size from a labelled one", () => {
    const unknown = buildDealDedupeKey({ ...base, servingSizeOz: null });
    const labelled = buildDealDedupeKey({
      ...base,
      servingSizeOz: null,
      servingSizeLabel: "liter",
    });
    expect(unknown).toContain("unknown");
    expect(labelled).not.toBe(unknown);
  });

  it("never produces an empty beer segment", () => {
    expect(buildDealDedupeKey({ ...base, beerName: "draft" })).toContain("unnamed");
  });
});
