CREATE TYPE "public"."change_type" AS ENUM('created', 'price_change', 'size_change', 'schedule_change', 'status_change', 'source_change', 'correction', 'moderation', 'import');--> statement-breakpoint
CREATE TYPE "public"."deal_status" AS ENUM('active', 'expired', 'superseded', 'pending_review', 'rejected', 'removed');--> statement-breakpoint
CREATE TYPE "public"."geo_precision" AS ENUM('rooftop', 'approximate', 'city_centroid', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."place_kind" AS ENUM('state', 'city', 'neighborhood', 'postal_code');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('price_wrong', 'no_longer_available', 'never_existed', 'wrong_venue', 'venue_closed', 'duplicate', 'spam_or_joke', 'offensive', 'other');--> statement-breakpoint
CREATE TYPE "public"."serving_type" AS ENUM('draft', 'bottle', 'can', 'tallboy', 'pitcher', 'bucket', 'flight', 'stein', 'crowler', 'growler', 'other');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('official_menu', 'venue_website', 'venue_social', 'venue_owner', 'reddit', 'review_site', 'news_article', 'community_submission', 'moderator', 'other');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'rejected', 'duplicate', 'needs_info');--> statement-breakpoint
CREATE TYPE "public"."submission_type" AS ENUM('new_venue', 'new_deal', 'update_deal', 'deal_ended', 'venue_closed', 'venue_correction');--> statement-breakpoint
CREATE TYPE "public"."venue_status" AS ENUM('active', 'temporarily_closed', 'permanently_closed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."venue_type" AS ENUM('bar', 'dive_bar', 'sports_bar', 'pub', 'restaurant', 'brewery', 'taproom', 'beer_garden', 'club', 'hotel_bar', 'package_store', 'other');--> statement-breakpoint
CREATE TYPE "public"."verification_result" AS ENUM('still_available', 'no_longer_available', 'price_changed', 'venue_closed');--> statement-breakpoint
CREATE TABLE "contributors" (
	"submitter_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"display_name" text,
	"submission_count" integer DEFAULT 0 NOT NULL,
	"approved_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"verification_count" integer DEFAULT 0 NOT NULL,
	"trust_score" integer DEFAULT 50 NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid,
	"venue_id" uuid,
	"reason" "report_reason" NOT NULL,
	"note" text,
	"submitter_hash" text NOT NULL,
	"day_bucket" text NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"change_type" "change_type" NOT NULL,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_cents" integer,
	"previous_price_cents" integer,
	"snapshot" jsonb NOT NULL,
	"source_type" "source_type",
	"source_url" text,
	"actor" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_time" time,
	"end_time" time
);
--> statement-breakpoint
CREATE TABLE "deal_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"result" "verification_result" NOT NULL,
	"verified_price_cents" integer,
	"reported_price_cents" integer,
	"submitter_hash" text NOT NULL,
	"user_id" uuid,
	"note" text,
	"weight" numeric(4, 2) DEFAULT '1' NOT NULL,
	"is_discarded" boolean DEFAULT false NOT NULL,
	"day_bucket" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"beer_name" text NOT NULL,
	"brand" text,
	"beer_style" text,
	"abv" numeric(4, 2),
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"serving_size_oz" numeric(6, 2),
	"serving_size_label" text,
	"serving_type" "serving_type" DEFAULT 'other' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"individual_serving_size_oz" numeric(6, 2),
	"price_per_ounce_cents" numeric(10, 4) GENERATED ALWAYS AS (CASE
            WHEN COALESCE(individual_serving_size_oz * quantity, serving_size_oz) > 0
            THEN price_cents::numeric / COALESCE(individual_serving_size_oz * quantity, serving_size_oz)
            ELSE NULL
          END) STORED,
	"description" text,
	"restrictions" text,
	"rule_description" text,
	"is_happy_hour" boolean DEFAULT false NOT NULL,
	"is_recurring" boolean DEFAULT true NOT NULL,
	"is_conditional" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"source_type" "source_type" DEFAULT 'community_submission' NOT NULL,
	"source_url" text,
	"source_snapshot" text,
	"source_captured_at" timestamp with time zone,
	"submitted_by" text,
	"last_verified_at" timestamp with time zone,
	"verification_count" integer DEFAULT 0 NOT NULL,
	"dispute_count" integer DEFAULT 0 NOT NULL,
	"status" "deal_status" DEFAULT 'active' NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_reason" text,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "place_kind" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"state" text,
	"parent_slug" text,
	"postal_code" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"default_radius_meters" integer DEFAULT 8000 NOT NULL,
	"population" integer,
	"search_text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket_key" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "submission_type" NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"venue_id" uuid,
	"deal_id" uuid,
	"payload" jsonb NOT NULL,
	"source_type" "source_type" DEFAULT 'community_submission' NOT NULL,
	"source_url" text,
	"source_snapshot" text,
	"evidence_image_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submitter_hash" text NOT NULL,
	"user_id" uuid,
	"possible_duplicate_of" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"change_type" "change_type" NOT NULL,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"name_normalized" text NOT NULL,
	"chain_name" text,
	"address1" text,
	"address2" text,
	"city" text NOT NULL,
	"city_slug" text NOT NULL,
	"neighborhood" text,
	"state" text NOT NULL,
	"postal_code" text,
	"country" text DEFAULT 'US' NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"geo_precision" "geo_precision" DEFAULT 'unknown' NOT NULL,
	"timezone" text NOT NULL,
	"timezone_source" text DEFAULT 'derived' NOT NULL,
	"website" text,
	"phone" text,
	"venue_type" "venue_type" DEFAULT 'bar' NOT NULL,
	"status" "venue_status" DEFAULT 'active' NOT NULL,
	"is_venue_verified" boolean DEFAULT false NOT NULL,
	"notes" text,
	"submitted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deal_reports" ADD CONSTRAINT "deal_reports_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_reports" ADD CONSTRAINT "deal_reports_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_revisions" ADD CONSTRAINT "deal_revisions_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_schedules" ADD CONSTRAINT "deal_schedules_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_verifications" ADD CONSTRAINT "deal_verifications_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_revisions" ADD CONSTRAINT "venue_revisions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_reports_once_per_day" ON "deal_reports" USING btree ("deal_id","submitter_hash","reason","day_bucket");--> statement-breakpoint
CREATE INDEX "deal_reports_status_idx" ON "deal_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "deal_revisions_deal_idx" ON "deal_revisions" USING btree ("deal_id","revision");--> statement-breakpoint
CREATE INDEX "deal_revisions_created_idx" ON "deal_revisions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "deal_schedules_deal_idx" ON "deal_schedules" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "deal_schedules_dow_idx" ON "deal_schedules" USING btree ("day_of_week");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_verifications_once_per_day" ON "deal_verifications" USING btree ("deal_id","submitter_hash","day_bucket");--> statement-breakpoint
CREATE INDEX "deal_verifications_deal_idx" ON "deal_verifications" USING btree ("deal_id","created_at");--> statement-breakpoint
CREATE INDEX "deals_venue_idx" ON "deals" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "deals_status_price_idx" ON "deals" USING btree ("status","price_cents");--> statement-breakpoint
CREATE INDEX "deals_price_per_oz_idx" ON "deals" USING btree ("price_per_ounce_cents");--> statement-breakpoint
CREATE INDEX "deals_last_verified_idx" ON "deals" USING btree ("last_verified_at");--> statement-breakpoint
CREATE INDEX "deals_serving_type_idx" ON "deals" USING btree ("serving_type");--> statement-breakpoint
CREATE INDEX "deals_dedupe_idx" ON "deals" USING btree ("venue_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "places_kind_slug_state_key" ON "places" USING btree ("kind","slug","state");--> statement-breakpoint
CREATE INDEX "places_search_idx" ON "places" USING btree ("search_text");--> statement-breakpoint
CREATE INDEX "places_postal_idx" ON "places" USING btree ("postal_code");--> statement-breakpoint
CREATE INDEX "rate_limit_lookup_idx" ON "rate_limit_events" USING btree ("bucket_key","action","created_at");--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "submissions_submitter_idx" ON "submissions" USING btree ("submitter_hash","created_at");--> statement-breakpoint
CREATE INDEX "submissions_venue_idx" ON "submissions" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "venue_revisions_venue_idx" ON "venue_revisions" USING btree ("venue_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "venues_slug_key" ON "venues" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "venues_lat_lng_idx" ON "venues" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "venues_state_city_idx" ON "venues" USING btree ("state","city_slug");--> statement-breakpoint
CREATE INDEX "venues_status_idx" ON "venues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "venues_name_normalized_idx" ON "venues" USING btree ("name_normalized");