CREATE TYPE "public"."media_kind" AS ENUM('photo', 'video');--> statement-breakpoint
CREATE TYPE "public"."media_purpose" AS ENUM('price_evidence', 'menu', 'pour', 'venue');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('pending', 'visible', 'rejected', 'removed');--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"deal_id" uuid,
	"comment_id" uuid,
	"kind" "media_kind" NOT NULL,
	"purpose" "media_purpose" DEFAULT 'pour' NOT NULL,
	"storage_key" text NOT NULL,
	"thumbnail_key" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" numeric(6, 2),
	"caption" text,
	"asserted_price_cents" integer,
	"submitter_hash" text NOT NULL,
	"user_id" uuid,
	"status" "media_status" DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"review_note" text,
	"uploaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_venue_idx" ON "media" USING btree ("venue_id","status","created_at");--> statement-breakpoint
CREATE INDEX "media_deal_idx" ON "media" USING btree ("deal_id","status");--> statement-breakpoint
CREATE INDEX "media_status_idx" ON "media" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "media_submitter_idx" ON "media" USING btree ("submitter_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_storage_key_key" ON "media" USING btree ("storage_key");