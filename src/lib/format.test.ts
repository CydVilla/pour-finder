import { describe, expect, it } from "vitest";
import {
  formatSchedule,
  formatServingDescription,
  formatServingSize,
  formatTime,
  formatTimeRange,
  pluralize,
} from "./format";

const size = (over: Partial<Parameters<typeof formatServingSize>[0]> = {}) => ({
  servingSizeOz: null,
  servingSizeLabel: null,
  quantity: 1,
  individualServingSizeOz: null,
  ...over,
});

describe("formatServingSize", () => {
  it("returns null when nothing about the pour is known", () => {
    // Callers render "size unknown" themselves; an empty string would leave a gap.
    expect(formatServingSize(size())).toBeNull();
  });

  it("prints a bare ounce count when that is all there is", () => {
    expect(formatServingSize(size({ servingSizeOz: 16 }))).toBe("16 oz");
  });

  it("leads with the bar's own name for the pour when there is one", () => {
    // Regression: this used to return "33.81 oz" and drop "liter" entirely,
    // which is both uglier and harder to actually order at the bar.
    expect(formatServingSize(size({ servingSizeOz: 33.81, servingSizeLabel: "liter" }))).toBe(
      "liter (33.81 oz)",
    );
  });

  it("falls back to the label when no ounces are known", () => {
    expect(formatServingSize(size({ servingSizeLabel: "bottle or can" }))).toBe("bottle or can");
  });

  it("describes a multi-serving deal by its count", () => {
    expect(formatServingSize(size({ quantity: 5, individualServingSizeOz: 12 }))).toBe("5 × 12 oz");
    expect(formatServingSize(size({ quantity: 5 }))).toBe("5");
  });

  it("trims float noise but keeps real precision", () => {
    expect(formatServingSize(size({ servingSizeOz: 16.0 }))).toBe("16 oz");
    expect(formatServingSize(size({ servingSizeOz: 12.5 }))).toBe("12.5 oz");
  });
});

describe("formatServingDescription", () => {
  it("says the size is unknown rather than inventing one", () => {
    expect(formatServingDescription({ ...size(), servingType: "draft" })).toBe(
      "Draft · size unknown",
    );
  });

  it("omits the redundant type for 'other'", () => {
    expect(formatServingDescription({ ...size(), servingType: "other" })).toBe("Size unknown");
    expect(
      formatServingDescription({
        ...size({ servingSizeLabel: "large" }),
        servingType: "other",
      }),
    ).toBe("large");
  });

  it("combines size and serving type", () => {
    expect(formatServingDescription({ ...size({ servingSizeOz: 16 }), servingType: "draft" })).toBe(
      "16 oz draft",
    );
  });
});

describe("formatTime", () => {
  it("drops :00 and uses lowercase meridiems", () => {
    expect(formatTime("16:00")).toBe("4pm");
    expect(formatTime("09:00")).toBe("9am");
  });

  it("keeps minutes when they matter", () => {
    expect(formatTime("16:30")).toBe("4:30pm");
    expect(formatTime("09:05")).toBe("9:05am");
  });

  it("handles both ends of the 12-hour wrap", () => {
    expect(formatTime("00:00")).toBe("12am");
    expect(formatTime("12:00")).toBe("12pm");
    expect(formatTime("23:59")).toBe("11:59pm");
  });
});

describe("formatTimeRange", () => {
  it("drops the repeated meridiem", () => {
    expect(formatTimeRange("16:00", "18:00")).toBe("4–6pm");
  });

  it("keeps both when they differ", () => {
    expect(formatTimeRange("11:00", "14:00")).toBe("11am–2pm");
  });
});

describe("formatSchedule", () => {
  const w = (
    dayOfWeek: number,
    startTime: string | null = null,
    endTime: string | null = null,
  ) => ({
    dayOfWeek,
    startTime,
    endTime,
  });

  it("returns null for an empty schedule, which means 'every day'", () => {
    expect(formatSchedule([])).toBeNull();
  });

  it("names the common week shapes", () => {
    expect(formatSchedule([1, 2, 3, 4, 5].map((d) => w(d, "16:00", "18:00")))).toBe(
      "Mon–Fri 4–6pm",
    );
    expect(formatSchedule([0, 1, 2, 3, 4, 5, 6].map((d) => w(d, "16:00", "18:00")))).toBe(
      "Daily 4–6pm",
    );
    expect(formatSchedule([0, 6].map((d) => w(d)))).toBe("Sat–Sun all day");
  });

  it("collapses consecutive days and lists the gaps", () => {
    expect(formatSchedule([1, 2, 3, 5].map((d) => w(d)))).toBe("Mon–Wed, Fri all day");
  });

  it("groups days by the window they share", () => {
    expect(
      formatSchedule([w(1, "16:00", "18:00"), w(2, "16:00", "18:00"), w(5, "20:00", "23:00")]),
    ).toBe("Mon–Tue 4–6pm · Fri 8–11pm");
  });

  it("calls a window with no times an all-day deal", () => {
    expect(formatSchedule([w(3)])).toBe("Wed all day");
  });
});

describe("pluralize", () => {
  it("does not say '1 deals'", () => {
    expect(pluralize(1, "deal")).toBe("1 deal");
    expect(pluralize(0, "deal")).toBe("0 deals");
    expect(pluralize(3, "deal")).toBe("3 deals");
  });

  it("takes an irregular plural", () => {
    expect(pluralize(2, "person", "people")).toBe("2 people");
  });
});
