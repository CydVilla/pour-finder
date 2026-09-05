import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Anonymous contributor identity.
 *
 * We never store raw IP addresses. `submitterHash` is a salted digest of
 * (IP + user agent) that is stable over time so contributor reputation can
 * accumulate, and is invalidated wholesale by rotating SUBMITTER_HASH_SALT.
 *
 * This is deliberately weak as an identity: it is enough to stop casual
 * confirmation spam and to rate limit, and not enough to track anybody. When
 * real accounts land, `userId` on the same rows takes over and this becomes a
 * fallback for logged-out contributions.
 */
export function submitterHashFromRequest(request: NextRequest | Request): string {
  const headers = request.headers;
  const ip =
    firstForwardedFor(headers.get("x-forwarded-for")) ??
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    "0.0.0.0";
  const userAgent = headers.get("user-agent") ?? "unknown";
  const salt = process.env.SUBMITTER_HASH_SALT ?? "dev-salt";

  return createHash("sha256").update(`${salt}|${ip}|${userAgent}`).digest("hex").slice(0, 40);
}

function firstForwardedFor(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/** UTC YYYY-MM-DD. Backs the one-action-per-person-per-day unique indexes. */
export function dayBucket(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
