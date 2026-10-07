import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { envBool, envInt, envString, siteUrl } from "./env";

const KEYS = ["PF_TEST", "NEXT_PUBLIC_SITE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

describe("envString", () => {
  it("treats an empty or whitespace-only value as unset", () => {
    // This is the whole reason the module exists: `?? fallback` only catches
    // undefined, and Next inlines a missing NEXT_PUBLIC_* as '' at build time.
    process.env.PF_TEST = "";
    expect(envString("PF_TEST", "fallback")).toBe("fallback");
    process.env.PF_TEST = "   ";
    expect(envString("PF_TEST", "fallback")).toBe("fallback");
  });

  it("returns undefined with no fallback", () => {
    delete process.env.PF_TEST;
    expect(envString("PF_TEST")).toBeUndefined();
  });

  it("trims a real value", () => {
    process.env.PF_TEST = "  hello  ";
    expect(envString("PF_TEST", "fallback")).toBe("hello");
  });
});

describe("envBool", () => {
  it("accepts the usual truthy spellings", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on"]) {
      process.env.PF_TEST = value;
      expect(envBool("PF_TEST")).toBe(true);
    }
  });

  it("is false for anything else", () => {
    for (const value of ["0", "false", "no", "off", "maybe"]) {
      process.env.PF_TEST = value;
      expect(envBool("PF_TEST")).toBe(false);
    }
  });

  it("falls back when unset or blank", () => {
    delete process.env.PF_TEST;
    expect(envBool("PF_TEST", true)).toBe(true);
    process.env.PF_TEST = "";
    expect(envBool("PF_TEST", true)).toBe(true);
  });
});

describe("envInt", () => {
  it("falls back on a blank value rather than yielding zero", () => {
    // DATABASE_POOL_MAX="" previously parsed to a pool of 0 connections.
    process.env.PF_TEST = "";
    expect(envInt("PF_TEST", 10)).toBe(10);
  });

  it("falls back on garbage", () => {
    process.env.PF_TEST = "lots";
    expect(envInt("PF_TEST", 10)).toBe(10);
  });

  it("parses a real number", () => {
    process.env.PF_TEST = "25";
    expect(envInt("PF_TEST", 10)).toBe(25);
  });
});

describe("siteUrl", () => {
  it("degrades to localhost rather than throwing on a missing value", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(siteUrl()).toBe("http://localhost:3000");
    process.env.NEXT_PUBLIC_SITE_URL = "";
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("returns the origin, dropping any path", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://pour-finder.vercel.app/some/path";
    expect(siteUrl()).toBe("https://pour-finder.vercel.app");
  });

  it("adds a scheme to a bare host", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "pour-finder.vercel.app";
    expect(siteUrl()).toBe("https://pour-finder.vercel.app");
  });

  it("warns and degrades instead of failing the build on a bad value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NEXT_PUBLIC_SITE_URL = "https://exa mple.com";
    expect(siteUrl()).toBe("http://localhost:3000");
    expect(warn).toHaveBeenCalled();
  });
});
