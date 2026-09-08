/**
 * Environment variable reading.
 *
 * `process.env.FOO ?? fallback` is the wrong idiom here, and it cost a
 * production build: `??` only catches `undefined`, but an unset variable very
 * often arrives as an empty string. Next.js in particular inlines missing
 * `NEXT_PUBLIC_*` variables as `''` at build time, so `?? "http://localhost"`
 * silently yielded `''` and `new URL('')` threw during page-data collection.
 *
 * Everything here treats empty and whitespace-only as "not set".
 */

export function envString(name: string, fallback: string): string;
export function envString(name: string, fallback?: undefined): string | undefined;
export function envString(name: string, fallback?: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  return trimmed === "" ? fallback : trimmed;
}

export function envBool(name: string, fallback = false): boolean {
  const value = envString(name);
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

export function envInt(name: string, fallback: number): number {
  const value = envString(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DEV_SITE_URL = "http://localhost:3000";

/**
 * The site's public origin, guaranteed parseable.
 *
 * Never throws: a bad value degrades to localhost with a warning rather than
 * failing the build, because metadata is not worth a failed deploy.
 */
export function siteUrl(): string {
  const configured = envString("NEXT_PUBLIC_SITE_URL");
  if (!configured) return DEV_SITE_URL;

  // Accept "example.com" as well as a full origin.
  const candidate = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;

  try {
    return new URL(candidate).origin;
  } catch {
    console.warn(
      `[env] NEXT_PUBLIC_SITE_URL is not a valid URL (${JSON.stringify(configured)}); ` +
        `falling back to ${DEV_SITE_URL}.`,
    );
    return DEV_SITE_URL;
  }
}
