CREATE TABLE "calendar_busy_block" (
	"id" text PRIMARY KEY NOT NULL,
	"calendar_id" text NOT NULL,
	"external_event_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'busy' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_calendar" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_calendar_id" text NOT NULL,
	"credential_secret_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sync_cursor" text,
	"last_synced_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_availability_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"location_id" text NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"timezone" text NOT NULL,
	"effective_from" text NOT NULL,
	"effective_until" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_busy_block" ADD CONSTRAINT "calendar_busy_block_calendar_id_external_calendar_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."external_calendar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_busy_block_event_idx" ON "calendar_busy_block" USING btree ("calendar_id","external_event_id");--> statement-breakpoint
CREATE INDEX "calendar_busy_block_window_idx" ON "calendar_busy_block" USING btree ("calendar_id","start_at","end_at");--> statement-breakpoint
CREATE UNIQUE INDEX "external_calendar_staff_provider_idx" ON "external_calendar" USING btree ("staff_id","provider");--> statement-breakpoint
CREATE INDEX "staff_availability_rule_day_idx" ON "staff_availability_rule" USING btree ("staff_id","weekday","effective_from");--> statement-breakpoint
CREATE INDEX "staff_availability_rule_location_idx" ON "staff_availability_rule" USING btree ("location_id","weekday");