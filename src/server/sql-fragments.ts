/**
 * Reusable SQL expressions.
 *
 * Freshness thresholds are interpolated from the TypeScript constants so the
 * badge, the filter and the sort ranking can never disagree.
 */
import { sql, type SQL } from "drizzle-orm";
import { FRESHNESS_THRESHOLD_DAYS } from "@/lib/freshness";

/**
 * Orderable freshness: 0 fresh, 1 aging, 2 stale, 3 likely outdated,
 * 4 unverified. Lower is better, so MIN() over a venue's deals gives the
 * venue's best freshness.
 */
export const freshnessRank: SQL<number> = sql<number>`
  CASE
    WHEN deals.last_verified_at IS NULL THEN 4
    WHEN deals.last_verified_at > now() - (${FRESHNESS_THRESHOLD_DAYS.fresh} * interval '1 day') THEN 0
    WHEN deals.last_verified_at > now() - (${FRESHNESS_THRESHOLD_DAYS.aging} * interval '1 day') THEN 1
    WHEN deals.last_verified_at > now() - (${FRESHNESS_THRESHOLD_DAYS.stale} * interval '1 day') THEN 2
    ELSE 3
  END`;

/** Whole days since last verification; NULL when never verified. */
export const daysSinceVerified: SQL<number | null> = sql<number | null>`
  CASE
    WHEN deals.last_verified_at IS NULL THEN NULL
    ELSE FLOOR(EXTRACT(EPOCH FROM (now() - deals.last_verified_at)) / 86400)::int
  END`;

/** The venue's current local timestamp. Postgres handles DST per zone. */
const venueLocalNow = sql`(now() AT TIME ZONE venues.timezone)`;

/**
 * Is this deal available right now, in the venue's own wall clock?
 *
 * - No schedule rows  -> always available (all-day, every-day deal).
 * - Rows without times -> available all day on those days.
 * - end_time < start_time -> the window wraps past midnight, so we also test
 *   yesterday's wrapping windows against today's early hours.
 */
export const isAvailableNow: SQL<boolean> = sql<boolean>`
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM deal_schedules s WHERE s.deal_id = deals.id) THEN TRUE
    ELSE (
      EXISTS (
        SELECT 1 FROM deal_schedules s
        WHERE s.deal_id = deals.id
          AND s.day_of_week = EXTRACT(DOW FROM ${venueLocalNow})::int
          AND (
            s.start_time IS NULL
            OR s.end_time IS NULL
            OR (
              s.start_time <= s.end_time
              AND ${venueLocalNow}::time BETWEEN s.start_time AND s.end_time
            )
            OR (
              s.start_time > s.end_time
              AND ${venueLocalNow}::time >= s.start_time
            )
          )
      )
      OR EXISTS (
        -- yesterday's window that wrapped past midnight
        SELECT 1 FROM deal_schedules s
        WHERE s.deal_id = deals.id
          AND s.day_of_week = ((EXTRACT(DOW FROM ${venueLocalNow})::int + 6) % 7)
          AND s.start_time IS NOT NULL
          AND s.end_time IS NOT NULL
          AND s.start_time > s.end_time
          AND ${venueLocalNow}::time <= s.end_time
      )
    )
  END`;

/** A deal has no time-of-day restriction at all. */
export const isAllDay: SQL<boolean> = sql<boolean>`
  NOT EXISTS (
    SELECT 1 FROM deal_schedules s
    WHERE s.deal_id = deals.id AND s.start_time IS NOT NULL
  )`;

/** Schedule rows as JSON, ordered, `[]` when the deal has none. */
export const scheduleJson: SQL<unknown> = sql`
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'dayOfWeek', s.day_of_week,
          'startTime', to_char(s.start_time, 'HH24:MI'),
          'endTime', to_char(s.end_time, 'HH24:MI')
        ) ORDER BY s.day_of_week, s.start_time
      )
      FROM deal_schedules s WHERE s.deal_id = deals.id
    ),
    '[]'::json
  )`;

/** Live status window: not started yet / already expired. */
export const withinLifecycleWindow: SQL = sql`
  (deals.starts_at IS NULL OR deals.starts_at <= now())
  AND (deals.expires_at IS NULL OR deals.expires_at > now())`;
