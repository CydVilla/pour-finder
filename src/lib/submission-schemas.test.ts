import { describe, expect, it } from "vitest";
import {
  commentSchema,
  dealDetailsSchema,
  newVenueSchema,
  reportSchema,
  submissionSchema,
  verificationSchema,
} from "./submission-schemas";

const deal = (over: Record<string, unknown> = {}) => ({
  beerName: "Narragansett",
  priceCents: 300,
  ...over,
});

describe("dealDetailsSchema", () => {
  it("accepts the minimum a person can reasonably know", () => {
    // A beer and a price. Demanding more is how you get invented sizes.
    const parsed = dealDetailsSchema.parse(deal());
    expect(parsed.beerName).toBe("Narragansett");
    expect(parsed.priceCents).toBe(300);
    expect(parsed.servingSizeOz).toBeUndefined();
    expect(parsed.quantity).toBe(1);
  });

  it("allows a free beer but not a negative price", () => {
    expect(dealDetailsSchema.parse(deal({ priceCents: 0 })).priceCents).toBe(0);
    expect(dealDetailsSchema.safeParse(deal({ priceCents: -1 })).success).toBe(false);
  });

  it("rejects a price that is obviously a typo", () => {
    expect(dealDetailsSchema.safeParse(deal({ priceCents: 50_000_000 })).success).toBe(false);
  });

  it("requires whole cents", () => {
    expect(dealDetailsSchema.safeParse(deal({ priceCents: 300.5 })).success).toBe(false);
  });

  it("requires a beer name", () => {
    expect(dealDetailsSchema.safeParse(deal({ beerName: "" })).success).toBe(false);
    expect(dealDetailsSchema.safeParse(deal({ beerName: "   " })).success).toBe(false);
  });

  it("refuses a total size on a multi-item deal", () => {
    // Otherwise a 5-can bucket recorded as "60 oz" silently breaks $/oz.
    const result = dealDetailsSchema.safeParse(deal({ quantity: 5, servingSizeOz: 60 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["servingSizeOz"]);
    }
  });

  it("accepts a per-item size on a multi-item deal", () => {
    const parsed = dealDetailsSchema.parse(
      deal({ quantity: 5, individualServingSizeOz: 12, servingType: "bucket" }),
    );
    expect(parsed.quantity).toBe(5);
    expect(parsed.individualServingSizeOz).toBe(12);
  });

  it("rejects a zero or negative serving size rather than storing it", () => {
    expect(dealDetailsSchema.safeParse(deal({ servingSizeOz: 0 })).success).toBe(false);
    expect(dealDetailsSchema.safeParse(deal({ servingSizeOz: -16 })).success).toBe(false);
  });

  it("treats an empty optional string as absent, not as an empty value", () => {
    const parsed = dealDetailsSchema.parse(deal({ brand: "", servingSizeLabel: "" }));
    expect(parsed.brand).toBeUndefined();
    expect(parsed.servingSizeLabel).toBeUndefined();
  });

  it("requires a full URL for a source link", () => {
    expect(dealDetailsSchema.safeParse(deal({ sourceUrl: "example.com" })).success).toBe(false);
    expect(
      dealDetailsSchema.safeParse(deal({ sourceUrl: "https://example.com/menu" })).success,
    ).toBe(true);
  });

  it("validates schedule times as 24-hour HH:MM", () => {
    const ok = dealDetailsSchema.safeParse(
      deal({ schedule: [{ days: [1, 2], startTime: "16:00", endTime: "18:00" }] }),
    );
    expect(ok.success).toBe(true);
    const bad = dealDetailsSchema.safeParse(
      deal({ schedule: [{ days: [1], startTime: "4pm", endTime: "18:00" }] }),
    );
    expect(bad.success).toBe(false);
  });

  it("rejects a day outside 0-6", () => {
    expect(
      dealDetailsSchema.safeParse(deal({ schedule: [{ days: [7], startTime: "16:00" }] })).success,
    ).toBe(false);
  });
});

describe("newVenueSchema", () => {
  const venue = (over: Record<string, unknown> = {}) => ({
    name: "Croke Park",
    city: "Boston",
    state: "ma",
    latitude: 42.33,
    longitude: -71.05,
    ...over,
  });

  it("upper-cases the state code", () => {
    expect(newVenueSchema.parse(venue()).state).toBe("MA");
  });

  it("requires a two-letter state", () => {
    expect(newVenueSchema.safeParse(venue({ state: "Massachusetts" })).success).toBe(false);
    expect(newVenueSchema.safeParse(venue({ state: "M" })).success).toBe(false);
  });

  it("rejects impossible coordinates", () => {
    expect(newVenueSchema.safeParse(venue({ latitude: 91 })).success).toBe(false);
    expect(newVenueSchema.safeParse(venue({ longitude: -181 })).success).toBe(false);
  });

  it("needs a real name and a city", () => {
    expect(newVenueSchema.safeParse(venue({ name: "X" })).success).toBe(false);
    expect(newVenueSchema.safeParse(venue({ city: "" })).success).toBe(false);
  });
});

describe("submissionSchema", () => {
  it("accepts a deal against an existing venue", () => {
    const parsed = submissionSchema.safeParse({
      type: "new_deal",
      venueId: "3f4c2b1a-0000-4000-8000-000000000000",
      deal: deal(),
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-uuid venue id", () => {
    expect(
      submissionSchema.safeParse({ type: "new_deal", venueId: "coogans", deal: deal() }).success,
    ).toBe(false);
  });

  it("rejects an unknown submission type", () => {
    expect(submissionSchema.safeParse({ type: "delete_everything" }).success).toBe(false);
  });
});

describe("verificationSchema", () => {
  it("accepts the three outcomes and nothing else", () => {
    for (const result of ["still_available", "no_longer_available", "price_changed"]) {
      expect(verificationSchema.safeParse({ result }).success).toBe(true);
    }
    expect(verificationSchema.safeParse({ result: "maybe" }).success).toBe(false);
  });

  it("carries a corrected price when there is one", () => {
    const parsed = verificationSchema.parse({ result: "price_changed", reportedPriceCents: 425 });
    expect(parsed.reportedPriceCents).toBe(425);
  });
});

describe("reportSchema", () => {
  it("requires a known reason", () => {
    expect(reportSchema.safeParse({ reason: "price_wrong" }).success).toBe(true);
    expect(reportSchema.safeParse({ reason: "vibes" }).success).toBe(false);
    expect(reportSchema.safeParse({}).success).toBe(false);
  });

  it("caps the free-text note", () => {
    expect(reportSchema.safeParse({ reason: "other", note: "x".repeat(501) }).success).toBe(false);
  });
});

describe("commentSchema", () => {
  it("needs more than a single character", () => {
    expect(
      commentSchema.safeParse({ venueId: "3f4c2b1a-0000-4000-8000-000000000000", body: "x" })
        .success,
    ).toBe(false);
  });

  it("defaults the signal to none", () => {
    const parsed = commentSchema.parse({
      venueId: "3f4c2b1a-0000-4000-8000-000000000000",
      body: "Still $3 tonight",
    });
    expect(parsed.signal).toBe("none");
  });

  it("caps the body so one comment cannot be a wall of text", () => {
    expect(
      commentSchema.safeParse({
        venueId: "3f4c2b1a-0000-4000-8000-000000000000",
        body: "x".repeat(1001),
      }).success,
    ).toBe(false);
  });
});
