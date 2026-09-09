import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimitEvents } from "@/db/schema";

/**
 * Database-backed fixed-window rate limiting.
 *
 * Chosen over in-memory counters because the app is expected to run on
 * serverless where instances don't share state. Swap the two functions here
 * for Redis/Upstash when write volume justifies it - nothing else changes.
 */
export interface RateLimitPolicy {
  /** Max allowed actions inside the window. */
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  /** Confirming/disputing is cheap and the unique index already caps it. */
  verify: { limit: 30, windowSeconds: 3600 },
  /** New deals and venues cost moderator time. */
  submit: { limit: 10, windowSeconds: 3600 },
  /** Reports are a competitor's favourite abuse vector. */
  report: { limit: 8, windowSeconds: 3600 },
  /** Comments are cheap to write and expensive to moderate. */
  comment: { limit: 12, windowSeconds: 3600 },
  /** Uploads cost storage and moderator attention; keep the tap tight. */
  upload: { limit: 15, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitPolicy>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function consumeRateLimit(
  bucketKey: string,
  action: keyof typeof RATE_LIMITS,
): Promise<RateLimitResult> {
  const policy = RATE_LIMITS[action];
  const since = new Date(Date.now() - policy.windowSeconds * 1000);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rateLimitEvents)
    .where(
      and(
        eq(rateLimitEvents.bucketKey, bucketKey),
        eq(rateLimitEvents.action, action),
        gt(rateLimitEvents.createdAt, since),
      ),
    );

  const used = row?.count ?? 0;
  if (used >= policy.limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: policy.windowSeconds };
  }

  await db.insert(rateLimitEvents).values({ bucketKey, action });

  // Opportunistic cleanup: ~2% of writes prune rows older than a day. Avoids
  // needing a cron for a table nobody reads historically.
  if (Math.random() < 0.02) {
    await db
      .delete(rateLimitEvents)
      .where(sql`${rateLimitEvents.createdAt} < now() - interval '1 day'`);
  }

  return {
    allowed: true,
    remaining: policy.limit - used - 1,
    retryAfterSeconds: 0,
  };
}
