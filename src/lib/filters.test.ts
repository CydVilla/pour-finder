import { describe, expect, it } from "vitest";
import { parseFilters, serializeFilters } from "./filters";

const parse = (qs: string) => parseFilters(new URLSearchParams(qs));

describe("parseFilters", () => {
  it("reads the common filters off a URL", () => {
    const f = parse("maxPriceCents=300&state=ma&sort=value&servingTypes=draft,can");
    expect(f.maxPriceCents).toBe(300);
    expect(f.state).toBe("MA");
    expect(f.sort).toBe("value");
    expect(f.servingTypes).toEqual(["draft", "can"]);
  });

  it("reads booleans only from 1/true", () => {
    expect(parse("availableNow=1").availableNow).toBe(true);
    expect(parse("availableNow=true").availableNow).toBe(true);
    expect(parse("availableNow=0").availableNow).toBeUndefined();
    expect(parse("availableNow=yes").availableNow).toBeUndefined();
  });

  it("drops a single bad param instead of failing the whole page", () => {
    // A mangled shared link should still render something usable.
    const f = parse("maxPriceCents=banana&state=MA");
    expect(f.state).toBe("MA");
    expect(f.maxPriceCents).toBeUndefined();
  });

  it("survives every param being junk", () => {
    const f = parse("maxPriceCents=x&lat=y&lng=z&sort=sideways&limit=-4&state=TOOLONG");
    expect(f.sort).toBeDefined();
    expect(f.state).toBeUndefined();
  });

  it("ignores empty values rather than treating them as present", () => {
    expect(parse("state=&q=").state).toBeUndefined();
  });

  it("clamps an absurd limit instead of honouring it", () => {
    expect(parse("limit=999999").limit).toBeLessThanOrEqual(300);
  });
});

describe("serializeFilters", () => {
  it("omits defaults so a shared URL stays short", () => {
    expect(serializeFilters({}).toString()).toBe("");
  });

  it("round-trips the filters that matter", () => {
    const original = parse(
      "maxPriceCents=500&state=MA&citySlug=boston&sort=value&servingTypes=draft,can&beerTags=lager&availableNow=1",
    );
    const round = parseFilters(serializeFilters(original));
    expect(round.maxPriceCents).toBe(original.maxPriceCents);
    expect(round.state).toBe(original.state);
    expect(round.citySlug).toBe(original.citySlug);
    expect(round.sort).toBe(original.sort);
    expect(round.servingTypes).toEqual(original.servingTypes);
    expect(round.beerTags).toEqual(original.beerTags);
    expect(round.availableNow).toBe(true);
  });

  it("rounds coordinates so the URL does not leak precision", () => {
    // 5dp is ~1m. Anything finer is both useless and a privacy smell.
    const params = serializeFilters({ lat: 42.360123456, lng: -71.058987654 });
    expect(params.get("lat")).toBe("42.36012");
    expect(params.get("lng")).toBe("-71.05899");
  });

  it("round-trips a position without drift beyond that rounding", () => {
    const round = parseFilters(serializeFilters({ lat: 42.3601, lng: -71.0589 }));
    expect(round.lat).toBeCloseTo(42.3601, 5);
    expect(round.lng).toBeCloseTo(-71.0589, 5);
  });
});
