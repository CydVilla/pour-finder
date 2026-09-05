/**
 * Deal freshness and confidence.
 *
 * Freshness is DERIVED, never stored. A stored `is_fresh` flag is wrong the
 * moment a cron job doesn't run; a computed one cannot rot. The day thresholds
 * live here and are interpolated into SQL by src/server/scoring.ts, so the
 * filter, the sort and the badge can never disagree.
 */
import type { SourceType } from "@/db/schema";

export const FRESHNESS_THRESHOLD_DAYS = {
  fresh: 7,
  aging: 30,
  stale: 90,
} as const;

export type Freshness = "fresh" | "aging" | "stale" | "likely_outdated" | "unverified";

export const FRESHNESS_ORDER: Record<Freshness, number> = {
  fresh: 0,
  aging: 1,
  stale: 2,
  likely_outdated: 3,
  unverified: 4,
};

export function freshnessFromDays(daysSinceVerified: number | null): Freshness {
  if (daysSinceVerified === null) return "unverified";
  if (daysSinceVerified <= FRESHNESS_THRESHOLD_DAYS.fresh) return "fresh";
  if (daysSinceVerified <= FRESHNESS_THRESHOLD_DAYS.aging) return "aging";
  if (daysSinceVerified <= FRESHNESS_THRESHOLD_DAYS.stale) return "stale";
  return "likely_outdated";
}

export function daysSince(date: Date | string | null, now: Date = new Date()): number | null {
  if (!date) return null;
  const then = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(then.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000));
}

/** Short badge text. Day granularity keeps SSR and client output identical. */
export function freshnessLabel(days: number | null): string {
  if (days === null) return "Not yet verified";
  if (days === 0) return "Verified today";
  if (days === 1) return "Verified yesterday";
  if (days <= FRESHNESS_THRESHOLD_DAYS.fresh) return `Verified ${days} days ago`;
  if (days <= FRESHNESS_THRESHOLD_DAYS.aging) {
    return `Verified ${countOf(Math.round(days / 7), "week")} ago`;
  }
  if (days <= 365) {
    return `Verified ${countOf(Math.max(1, Math.round(days / 30)), "month")} ago`;
  }
  return "Verified over a year ago";
}

function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** The blunt, honest one-liner used when a deal is old. */
export function freshnessHint(freshness: Freshness, days: number | null): string | null {
  switch (freshness) {
    case "stale":
      return "Getting old — worth double-checking";
    case "likely_outdated":
      return days !== null && days > 365
        ? "Likely outdated — not confirmed in over a year"
        : "Likely outdated — confirm before you go";
    case "unverified":
      return "Nobody has confirmed this yet";
    default:
      return null;
  }
}

/* --------------------------------------------------------- confidence v1 */

/**
 * Deliberately simple. Every input the eventual real model needs is already
 * persisted (source provenance, independent confirmation count, disputes,
 * contributor trust weight), so this can be replaced without a migration.
 */
const SOURCE_BASE: Record<SourceType, number> = {
  moderator: 80,
  venue_owner: 75,
  official_menu: 70,
  venue_website: 65,
  venue_social: 55,
  news_article: 55,
  review_site: 45,
  reddit: 40,
  community_submission: 40,
  other: 35,
};

export interface ConfidenceInput {
  sourceType: SourceType;
  daysSinceVerified: number | null;
  verificationCount: number;
  disputeCount: number;
}

export function confidenceScore(input: ConfidenceInput): number {
  let score = SOURCE_BASE[input.sourceType] ?? 40;

  const days = input.daysSinceVerified;
  if (days === null) {
    score -= 5;
  } else if (days <= FRESHNESS_THRESHOLD_DAYS.fresh) {
    score += 25;
  } else if (days <= FRESHNESS_THRESHOLD_DAYS.aging) {
    score += 15;
  } else if (days <= FRESHNESS_THRESHOLD_DAYS.stale) {
    score += 5;
  } else if (days <= 365) {
    score -= 10;
  } else {
    score -= 20;
  }

  score += Math.min(20, input.verificationCount * 5);
  score -= Math.min(40, input.disputeCount * 12);

  return Math.max(0, Math.min(100, Math.round(score)));
}

export type ConfidenceLevel = "high" | "medium" | "low";

export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function sourceLabel(source: SourceType): string {
  const labels: Record<SourceType, string> = {
    official_menu: "Official menu",
    venue_website: "Venue website",
    venue_social: "Venue social media",
    venue_owner: "Venue owner",
    reddit: "Reddit report",
    review_site: "Review site",
    news_article: "News article",
    community_submission: "Community report",
    moderator: "Moderator",
    other: "Other source",
  };
  return labels[source] ?? "Unknown source";
}
