import { describe, expect, it } from "vitest";
import { bansHappyHour, happyHourLaw } from "./happy-hour-law";

describe("happyHourLaw", () => {
  it("knows the launch state bans happy hour", () => {
    expect(happyHourLaw("MA")?.law).toBe("banned");
    expect(happyHourLaw("MA")?.note).toMatch(/1984/);
  });

  it("is null for a state with no special rule", () => {
    expect(happyHourLaw("NY")).toBeNull();
    expect(happyHourLaw("CA")).toBeNull();
  });

  it("is null for no state at all, rather than throwing", () => {
    // The filter sheet calls this with an optional state on every render.
    expect(happyHourLaw(undefined)).toBeNull();
    expect(happyHourLaw(null)).toBeNull();
    expect(happyHourLaw("")).toBeNull();
  });

  it("accepts whatever casing the URL carried", () => {
    expect(happyHourLaw("ma")?.law).toBe("banned");
    expect(happyHourLaw(" Ma ")?.law).toBe("banned");
  });

  it("records Indiana as restricted, not banned", () => {
    // Indiana's ban was repealed effective 2024-07-01, which is why the widely
    // reproduced "eight states ban happy hour" lists are now wrong.
    expect(happyHourLaw("IN")?.law).toBe("restricted");
    expect(bansHappyHour("IN")).toBe(false);
  });

  it("covers the states that do ban it outright", () => {
    for (const state of ["AK", "MA", "NC", "RI", "UT", "VT"]) {
      expect(bansHappyHour(state)).toBe(true);
    }
  });

  it("gives every entry a usable one-line note", () => {
    for (const state of ["AK", "MA", "NC", "RI", "UT", "VT", "IN", "OK"]) {
      const note = happyHourLaw(state)?.note ?? "";
      expect(note.length).toBeGreaterThan(20);
      expect(note.endsWith(".")).toBe(true);
    }
  });
});
