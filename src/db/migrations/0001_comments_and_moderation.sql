CREATE TYPE "public"."comment_signal" AS ENUM('none', 'still_good', 'price_changed', 'no_longer_available', 'venue_closed');--> statement-breakpoint
CREATE TYPE "public"."comment_status" AS ENUM('visible', 'pending', 'hidden', 'removed');--> statement-breakpoint
CREATE TYPE "public"."moderation_task_kind" AS ENUM('deal_possibly_ended', 'venue_possibly_closed', 'price_dispute', 'content_review');--> statement-breakpoint
CREATE TYPE "public"."moderation_task_status" AS ENUM('open', 'in_progress', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"deal_id" uuid,
	"body" text NOT NULL,
	"signal" "comment_signal" DEFAULT 'none' NOT NULL,
	"reported_price_cents" integer,
	"display_name" text,
	"submitter_hash" text NOT NULL,
	"user_id" uuid,
	"status" "comment_status" DEFAULT 'visible' NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"flag_count" integer DEFAULT 0 NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"moderated_at" timestamp with time zone,
	"moderated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "moderation_task_kind" NOT NULL,
	"status" "moderation_task_status" DEFAULT 'open' NOT NULL,
	"venue_id" uuid,
	"deal_id" uuid,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"external_provider" text,
	"external_ref" text,
	"external_url" text,
	"external_synced_at" timestamp with time zone,
	"external_error" text,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_tasks" ADD CONSTRAINT "moderation_tasks_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_tasks" ADD CONSTRAINT "moderation_tasks_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_venue_idx" ON "comments" USING btree ("venue_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_deal_idx" ON "comments" USING btree ("deal_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_status_idx" ON "comments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "comments_signal_idx" ON "comments" USING btree ("signal","created_at");--> statement-breakpoint
CREATE INDEX "comments_submitter_idx" ON "comments" USING btree ("submitter_hash","created_at");--> statement-breakpoint
CREATE INDEX "moderation_tasks_status_idx" ON "moderation_tasks" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_tasks_open_deal_key" ON "moderation_tasks" USING btree ("deal_id","kind") WHERE status IN ('open', 'in_progress') AND deal_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_tasks_open_venue_key" ON "moderation_tasks" USING btree ("venue_id","kind") WHERE status IN ('open', 'in_progress') AND deal_id IS NULL AND venue_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "moderation_tasks_external_idx" ON "moderation_tasks" USING btree ("external_provider","external_ref");