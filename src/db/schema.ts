/**
 * Pour Finder database schema.
 *
 * Design principles:
 *  1. Venues and deals are separate entities. A venue has many deals.
 *  2. Deal rows hold *current* state. `deal_revisions` is append-only history.
 *     We never lose a price change.
 *  3. Money is stored as integer cents. Never floats.
 *  4. Unknown is a first-class value. Serving size, address precision and
 *     timezone all record what we actually know, never a plausible guess.
 *  5. Nothing is Massachusetts-specific. `state` is a filter dimension, not a
 *     partition, and never a hard boundary for proximity search.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums */

export const venueStatusEnum = pgEnum("venue_status", [
  "active",
  "temporarily_closed",
  "permanently_closed",
  "unknown",
]);

export const venueTypeEnum = pgEnum("venue_type", [
  "bar",
  "dive_bar",
  "sports_bar",
  "pub",
  "restaurant",
  "brewery",
  "taproom",
  "beer_garden",
  "club",
  "hotel_bar",
  "package_store",
  "other",
]);

/** How much we trust the coordinates. Never fake a rooftop pin. */
export const geoPrecisionEnum = pgEnum("geo_precision", [
  "rooftop",
  "approximate",
  "city_centroid",
  "unknown",
]);

export const servingTypeEnum = pgEnum("serving_type", [
  "draft",
  "bottle",
  "can",
  "tallboy",
  "pitcher",
  "bucket",
  "flight",
  "stein",
  "crowler",
  "growler",
  "other",
]);

export const dealStatusEnum = pgEnum("deal_status", [
  "active",
  "expired",
  "superseded",
  "pending_review",
  "rejected",
  "removed",
]);

export const sourceTypeEnum = pgEnum("source_type", [
  "official_menu",
  "venue_website",
  "venue_social",
  "venue_owner",
  "reddit",
  "review_site",
  "news_article",
  "community_submission",
  "moderator",
  "other",
]);

export const verificationResultEnum = pgEnum("verification_result", [
  "still_available",
  "no_longer_available",
  "price_changed",
  "venue_closed",
]);

export const submissionTypeEnum = pgEnum("submission_type", [
  "new_venue",
  "new_deal",
  "update_deal",
  "deal_ended",
  "venue_closed",
  "venue_correction",
]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "pending",
  "approved",
  "rejected",
  "duplicate",
  "needs_info",
]);

export const reportReasonEnum = pgEnum("report_reason", [
  "price_wrong",
  "no_longer_available",
  "never_existed",
  "wrong_venue",
  "venue_closed",
  "duplicate",
  "spam_or_joke",
  "offensive",
  "other",
]);

export const changeTypeEnum = pgEnum("change_type", [
  "created",
  "price_change",
  "size_change",
  "schedule_change",
  "status_change",
  "source_change",
  "correction",
  "moderation",
  "import",
]);

/**
 * What a commenter is asserting about the deal. Captured as an explicit
 * choice rather than inferred from prose - "still $1, great" and "it's not $1
 * anymore" are impossible to tell apart reliably with keywords, and getting it
 * wrong means silently delisting a real deal.
 */
export const commentSignalEnum = pgEnum("comment_signal", [
  "none",
  "still_good",
  "price_changed",
  "no_longer_available",
  "venue_closed",
]);

export const commentStatusEnum = pgEnum("comment_status", [
  "visible",
  "pending",
  "hidden",
  "removed",
]);

export const moderationTaskKindEnum = pgEnum("moderation_task_kind", [
  "deal_possibly_ended",
  "venue_possibly_closed",
  "price_dispute",
  "content_review",
]);

export const moderationTaskStatusEnum = pgEnum("moderation_task_status", [
  "open",
  "in_progress",
  "resolved",
  "dismissed",
]);

export const placeKindEnum = pgEnum("place_kind", [
  "state",
  "city",
  "neighborhood",
  "postal_code",
]);

/* ----------------------------------------------------------------- venues */

export const venues = pgTable(
  "venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    name: text("name").notNull(),
    /**
     * Globally unique, human-readable: `coogans-boston`. Venue names are NOT
     * unique (chains, and two unrelated "The Tavern"s), so slugs carry a city
     * suffix and a numeric disambiguator when needed.
     */
    slug: text("slug").notNull(),
    /** Lowercased/punctuation-stripped name used for duplicate detection. */
    nameNormalized: text("name_normalized").notNull(),
    /** "Yard House" is not one venue - this is a label, not a foreign key. */
    chainName: text("chain_name"),

    address1: text("address1"),
    address2: text("address2"),
    city: text("city").notNull(),
    citySlug: text("city_slug").notNull(),
    neighborhood: text("neighborhood"),
    /** USPS two-letter code, uppercase. Organizational, never a search fence. */
    state: text("state").notNull(),
    postalCode: text("postal_code"),
    country: text("country").notNull().default("US"),

    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    geoPrecision: geoPrecisionEnum("geo_precision").notNull().default("unknown"),

    /**
     * IANA zone, e.g. "America/New_York". Required so recurring deal times are
     * evaluated in the venue's own wall clock, with correct DST, in any state.
     */
    timezone: text("timezone").notNull(),
    /** "explicit" when a human set it; "derived" when inferred from location. */
    timezoneSource: text("timezone_source").notNull().default("derived"),

    website: text("website"),
    phone: text("phone"),

    venueType: venueTypeEnum("venue_type").notNull().default("bar"),
    status: venueStatusEnum("status").notNull().default("active"),
    /** Set when the venue itself claims/confirms the listing. */
    isVenueVerified: boolean("is_venue_verified").notNull().default(false),

    /** Free-text operator notes, e.g. "street address unconfirmed". */
    notes: text("notes"),

    /** Anonymous contributor hash or moderator id. Never a raw IP. */
    submittedBy: text("submitted_by"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("venues_slug_key").on(t.slug),
    // Primary geo access path: bbox prefilter. Also serves the PostGIS
    // backend fine, which adds its own GiST index in the migration.
    index("venues_lat_lng_idx").on(t.latitude, t.longitude),
    index("venues_state_city_idx").on(t.state, t.citySlug),
    index("venues_status_idx").on(t.status),
    // Duplicate detection: "is there already a Coogan's around here?"
    index("venues_name_normalized_idx").on(t.nameNormalized),
  ],
);

/** Append-only venue history: renames, moves, closures. */
export const venueRevisions = pgTable(
  "venue_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    changeType: changeTypeEnum("change_type").notNull(),
    changedFields: jsonb("changed_fields").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Full row snapshot as of this revision. */
    snapshot: jsonb("snapshot").notNull(),
    actor: text("actor"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("venue_revisions_venue_idx").on(t.venueId, t.revision),
  ],
);

/* ------------------------------------------------------------------ deals */

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),

    /** What you order: "Bud Light", "PBR", "Narragansett". */
    beerName: text("beer_name").notNull(),
    brand: text("brand"),
    /** Free-ish text (lager, IPA, stout...). Kept loose on purpose. */
    beerStyle: text("beer_style"),
    abv: numeric("abv", { precision: 4, scale: 2 }),

    /** Integer cents. 0 is legal (free beer). No architectural upper bound. */
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("USD"),

    /**
     * Size of a single vessel, in fluid ounces. NULL means genuinely unknown -
     * "$1 draft, size unknown" is valid, complete data. Never guessed.
     */
    servingSizeOz: numeric("serving_size_oz", { precision: 6, scale: 2 }),
    /** Verbatim menu wording when there's no number: "medium", "large", "liter". */
    servingSizeLabel: text("serving_size_label"),
    servingType: servingTypeEnum("serving_type").notNull().default("other"),
    /** Items included: bucket of 5 -> 5. Single pour -> 1. */
    quantity: integer("quantity").notNull().default(1),
    /** Per-item size when quantity > 1: bucket of 5x12oz cans -> 12. */
    individualServingSizeOz: numeric("individual_serving_size_oz", { precision: 6, scale: 2 }),

    /**
     * Generated. NULL whenever total volume is unknown, so "best value" sort
     * can never silently invent a number.
     */
    pricePerOunceCents: numeric("price_per_ounce_cents", { precision: 10, scale: 4 }).generatedAlwaysAs(
      sql`CASE
            WHEN COALESCE(individual_serving_size_oz * quantity, serving_size_oz) > 0
            THEN price_cents::numeric / COALESCE(individual_serving_size_oz * quantity, serving_size_oz)
            ELSE NULL
          END`,
    ),

    description: text("description"),
    /** Conditions: "with food purchase", "cash only", "one per customer". */
    restrictions: text("restrictions"),
    /**
     * Human rule that no schedule table can encode:
     * "$1 beer during Red Sox home games".
     */
    ruleDescription: text("rule_description"),

    isHappyHour: boolean("is_happy_hour").notNull().default(false),
    isRecurring: boolean("is_recurring").notNull().default(true),
    /** True when availability depends on something we can't evaluate. */
    isConditional: boolean("is_conditional").notNull().default(false),

    /** Optional explicit window for limited-time promos. */
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    sourceType: sourceTypeEnum("source_type").notNull().default("community_submission"),
    sourceUrl: text("source_url"),
    /** Quoted text/title captured at submission: survives link rot. */
    sourceSnapshot: text("source_snapshot"),
    sourceCapturedAt: timestamp("source_captured_at", { withTimezone: true }),

    submittedBy: text("submitted_by"),

    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    /** Confirmations *at the current price*. Reset when price changes. */
    verificationCount: integer("verification_count").notNull().default(0),
    disputeCount: integer("dispute_count").notNull().default(0),

    status: dealStatusEnum("status").notNull().default("active"),
    /** Set when status moves to expired/superseded, for the history view. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedReason: text("ended_reason"),

    /** Normalized signature for likely-duplicate detection. Not unique. */
    dedupeKey: text("dedupe_key").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deals_venue_idx").on(t.venueId),
    index("deals_status_price_idx").on(t.status, t.priceCents),
    index("deals_price_per_oz_idx").on(t.pricePerOunceCents),
    index("deals_last_verified_idx").on(t.lastVerifiedAt),
    index("deals_serving_type_idx").on(t.servingType),
    index("deals_dedupe_idx").on(t.venueId, t.dedupeKey),
  ],
);

/**
 * Recurring availability windows in the venue's LOCAL wall clock.
 * A deal with zero rows and isHappyHour=false is an all-day, every-day deal.
 * end_time < start_time means the window wraps past midnight.
 */
export const dealSchedules = pgTable(
  "deal_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    /** 0 = Sunday ... 6 = Saturday, matching Postgres EXTRACT(DOW). */
    dayOfWeek: smallint("day_of_week").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
  },
  (t) => [
    index("deal_schedules_deal_idx").on(t.dealId),
    index("deal_schedules_dow_idx").on(t.dayOfWeek),
  ],
);

/** Append-only price/detail history. This is how we never lose $1 -> $2 -> $1. */
export const dealRevisions = pgTable(
  "deal_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    changeType: changeTypeEnum("change_type").notNull(),
    changedFields: jsonb("changed_fields").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    priceCents: integer("price_cents"),
    previousPriceCents: integer("previous_price_cents"),
    snapshot: jsonb("snapshot").notNull(),
    sourceType: sourceTypeEnum("source_type"),
    sourceUrl: text("source_url"),
    actor: text("actor"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deal_revisions_deal_idx").on(t.dealId, t.revision),
    index("deal_revisions_created_idx").on(t.createdAt),
  ],
);

/* ---------------------------------------------------- community signals */

export const dealVerifications = pgTable(
  "deal_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    result: verificationResultEnum("result").notNull(),
    /**
     * The price this vote was cast against. When a deal's price changes, older
     * confirmations no longer vouch for the new number.
     */
    verifiedPriceCents: integer("verified_price_cents"),
    /** Reported price when result = price_changed. */
    reportedPriceCents: integer("reported_price_cents"),
    /** sha256(ip + ua + rotating salt). Not a durable identity; no raw IPs. */
    submitterHash: text("submitter_hash").notNull(),
    /** Reserved for when accounts land. */
    userId: uuid("user_id"),
    note: text("note"),
    /** Weight for the confidence model: trusted contributors count more. */
    weight: numeric("weight", { precision: 4, scale: 2 }).notNull().default("1"),
    /** Set by moderation when a vote is judged bogus; excluded from counts. */
    isDiscarded: boolean("is_discarded").notNull().default(false),
    /** YYYY-MM-DD in UTC. Backs the one-vote-per-person-per-day constraint. */
    dayBucket: text("day_bucket").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Abuse prevention: one person cannot stack confirmations on one deal.
    uniqueIndex("deal_verifications_once_per_day")
      .on(t.dealId, t.submitterHash, t.dayBucket),
    index("deal_verifications_deal_idx").on(t.dealId, t.createdAt),
  ],
);

export const dealReports = pgTable(
  "deal_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "cascade" }),
    reason: reportReasonEnum("reason").notNull(),
    note: text("note"),
    submitterHash: text("submitter_hash").notNull(),
    dayBucket: text("day_bucket").notNull(),
    status: submissionStatusEnum("status").notNull().default("pending"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("deal_reports_once_per_day").on(t.dealId, t.submitterHash, t.reason, t.dayBucket),
    index("deal_reports_status_idx").on(t.status, t.createdAt),
  ],
);

/**
 * Every community write that changes authoritative data lands here first.
 * Payload is typed at the application boundary by Zod, stored as JSONB so the
 * moderation queue can render evidence without a schema migration per type.
 */
export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: submissionTypeEnum("type").notNull(),
    status: submissionStatusEnum("status").notNull().default("pending"),

    /** Set when the submission targets existing records. */
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),

    payload: jsonb("payload").notNull(),

    sourceType: sourceTypeEnum("source_type").notNull().default("community_submission"),
    sourceUrl: text("source_url"),
    sourceSnapshot: text("source_snapshot"),
    /** Object-storage keys for menu photos. Storage adapter is pluggable. */
    evidenceImageKeys: jsonb("evidence_image_keys").$type<string[]>().notNull().default(sql`'[]'::jsonb`),

    submitterHash: text("submitter_hash").notNull(),
    userId: uuid("user_id"),

    /** Populated by the duplicate detector so moderators see collisions. */
    possibleDuplicateOf: jsonb("possible_duplicate_of").$type<
      { kind: "venue" | "deal"; id: string; score: number; label: string }[]
    >().notNull().default(sql`'[]'::jsonb`),

    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    reviewNote: text("review_note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("submissions_status_idx").on(t.status, t.createdAt),
    index("submissions_submitter_idx").on(t.submitterHash, t.createdAt),
    index("submissions_venue_idx").on(t.venueId),
  ],
);

/**
 * Anonymous-first contributor record. Keyed by the rotating hash today; gets a
 * userId column populated when accounts land, so reputation is a later join
 * rather than a later migration.
 */
export const contributors = pgTable(
  "contributors",
  {
    submitterHash: text("submitter_hash").primaryKey(),
    userId: uuid("user_id"),
    displayName: text("display_name"),
    submissionCount: integer("submission_count").notNull().default(0),
    approvedCount: integer("approved_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    verificationCount: integer("verification_count").notNull().default(0),
    /** 0-100. Flat 50 for MVP; the inputs to compute it properly are all here. */
    trustScore: integer("trust_score").notNull().default(50),
    isBlocked: boolean("is_blocked").notNull().default(false),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/** Serverless-safe rate limiting. Swap for Redis when traffic warrants. */
export const rateLimitEvents = pgTable(
  "rate_limit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bucketKey: text("bucket_key").notNull(),
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_limit_lookup_idx").on(t.bucketKey, t.action, t.createdAt)],
);

/**
 * Gazetteer backing "search by city / ZIP / neighborhood" without a paid
 * geocoding call, and the future /ma, /ma/boston SEO routes.
 */
export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: placeKindEnum("kind").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    state: text("state"),
    /** Parent city for neighborhoods. */
    parentSlug: text("parent_slug"),
    postalCode: text("postal_code"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    /** Sensible default map radius, metres. */
    defaultRadiusMeters: integer("default_radius_meters").notNull().default(8000),
    /** Higher wins on ambiguous text search ("Springfield"). */
    population: integer("population"),
    searchText: text("search_text").notNull(),
  },
  (t) => [
    uniqueIndex("places_kind_slug_state_key").on(t.kind, t.slug, t.state),
    index("places_search_idx").on(t.searchText),
    index("places_postal_idx").on(t.postalCode),
  ],
);

/**
 * PlugShare-style comments.
 *
 * Attached to a venue, optionally to a specific deal. Every comment carries an
 * explicit `signal` so "this is gone" is structured data rather than something
 * we have to guess from prose - that signal is what drives escalation.
 */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),

    body: text("body").notNull(),
    signal: commentSignalEnum("signal").notNull().default("none"),
    /** Set when signal = price_changed. */
    reportedPriceCents: integer("reported_price_cents"),

    /** Optional free-text nickname. No account, no profile, no identity claim. */
    displayName: text("display_name"),
    submitterHash: text("submitter_hash").notNull(),
    userId: uuid("user_id"),

    status: commentStatusEnum("status").notNull().default("visible"),
    helpfulCount: integer("helpful_count").notNull().default(0),
    flagCount: integer("flag_count").notNull().default(0),

    /** Set when a keyword scan suggests the prose contradicts the signal. */
    needsReview: boolean("needs_review").notNull().default(false),

    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    moderatedBy: text("moderated_by"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("comments_venue_idx").on(t.venueId, t.createdAt),
    index("comments_deal_idx").on(t.dealId, t.createdAt),
    index("comments_status_idx").on(t.status, t.createdAt),
    index("comments_signal_idx").on(t.signal, t.createdAt),
    index("comments_submitter_idx").on(t.submitterHash, t.createdAt),
  ],
);

/**
 * Work queued for a human (or an assigned coding agent) to decide.
 *
 * Nothing in this table changes live data by itself. It exists so that a
 * pattern of community reports produces a tracked, auditable decision instead
 * of an automatic delisting - which would hand competitors a delete button.
 *
 * `external*` columns hold the mirror in an outside tracker (a GitHub issue),
 * so the round trip back into the database is idempotent.
 */
export const moderationTasks = pgTable(
  "moderation_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: moderationTaskKindEnum("kind").notNull(),
    status: moderationTaskStatusEnum("status").notNull().default("open"),

    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    reason: text("reason").notNull(),
    /** Comment ids, vote tallies, prices - whatever justified opening this. */
    evidence: jsonb("evidence").notNull().default(sql`'{}'::jsonb`),

    externalProvider: text("external_provider"),
    externalRef: text("external_ref"),
    externalUrl: text("external_url"),
    externalSyncedAt: timestamp("external_synced_at", { withTimezone: true }),
    externalError: text("external_error"),

    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("moderation_tasks_status_idx").on(t.status, t.createdAt),
    // One open task per deal per kind: re-reports join the existing task
    // rather than spamming a new issue for every commenter.
    uniqueIndex("moderation_tasks_open_deal_key")
      .on(t.dealId, t.kind)
      .where(sql`status IN ('open', 'in_progress') AND deal_id IS NOT NULL`),
    uniqueIndex("moderation_tasks_open_venue_key")
      .on(t.venueId, t.kind)
      .where(sql`status IN ('open', 'in_progress') AND deal_id IS NULL AND venue_id IS NOT NULL`),
    index("moderation_tasks_external_idx").on(t.externalProvider, t.externalRef),
  ],
);

/* ------------------------------------------------------------------ types */

export type Venue = typeof venues.$inferSelect;
export type NewVenue = typeof venues.$inferInsert;
export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type DealSchedule = typeof dealSchedules.$inferSelect;
export type NewDealSchedule = typeof dealSchedules.$inferInsert;
export type DealRevision = typeof dealRevisions.$inferSelect;
export type DealVerification = typeof dealVerifications.$inferSelect;
export type DealReport = typeof dealReports.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Place = typeof places.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type ModerationTask = typeof moderationTasks.$inferSelect;
export type NewModerationTask = typeof moderationTasks.$inferInsert;
export type NewPlace = typeof places.$inferInsert;

export type VenueStatus = (typeof venueStatusEnum.enumValues)[number];
export type VenueType = (typeof venueTypeEnum.enumValues)[number];
export type ServingType = (typeof servingTypeEnum.enumValues)[number];
export type DealStatus = (typeof dealStatusEnum.enumValues)[number];
export type SourceType = (typeof sourceTypeEnum.enumValues)[number];
export type VerificationResult = (typeof verificationResultEnum.enumValues)[number];
export type SubmissionType = (typeof submissionTypeEnum.enumValues)[number];
export type SubmissionStatus = (typeof submissionStatusEnum.enumValues)[number];
export type ReportReason = (typeof reportReasonEnum.enumValues)[number];
export type GeoPrecision = (typeof geoPrecisionEnum.enumValues)[number];
export type CommentSignal = (typeof commentSignalEnum.enumValues)[number];
export type CommentStatus = (typeof commentStatusEnum.enumValues)[number];
export type ModerationTaskKind = (typeof moderationTaskKindEnum.enumValues)[number];
export type ModerationTaskStatus = (typeof moderationTaskStatusEnum.enumValues)[number];
