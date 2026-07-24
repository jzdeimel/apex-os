CREATE TABLE "encounter" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text,
	"client_id" text NOT NULL,
	"location_id" text NOT NULL,
	"kind" text NOT NULL,
	"modality" text DEFAULT 'in-person' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"abandoned_at" timestamp with time zone,
	"abandoned_reason" text,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "encounter_segment" (
	"id" text PRIMARY KEY NOT NULL,
	"encounter_id" text NOT NULL,
	"component" text NOT NULL,
	"sequence" integer NOT NULL,
	"required_credentials" jsonb,
	"assigned_staff_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"performed_by" text,
	"performed_by_credential" text,
	"waived_reason" text,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "history_physical" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"encounter_id" text,
	"segment_id" text,
	"provider_id" text NOT NULL,
	"provider_credential" text,
	"chief_complaint" text,
	"history_narrative" text,
	"exam_narrative" text,
	"assessment" text,
	"lab_indications" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signed_at" timestamp with time zone,
	"attestation" text,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "vitals" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"encounter_id" text,
	"segment_id" text,
	"systolic" integer,
	"diastolic" integer,
	"heart_rate" integer,
	"respiratory_rate" integer,
	"spo2" integer,
	"temperature_c" real,
	"weight_kg" real,
	"height_cm" real,
	"notes" text,
	"taken_by" text NOT NULL,
	"taken_by_credential" text,
	"taken_at" timestamp with time zone NOT NULL,
	"supersedes_id" text,
	"correction_reason" text,
	"ledger_id" text
);
--> statement-breakpoint
ALTER TABLE "encounter_segment" ADD CONSTRAINT "encounter_segment_encounter_id_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_physical" ADD CONSTRAINT "history_physical_encounter_id_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_physical" ADD CONSTRAINT "history_physical_segment_id_encounter_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."encounter_segment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_encounter_id_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_segment_id_encounter_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."encounter_segment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "encounter_client_idx" ON "encounter" USING btree ("client_id","started_at");--> statement-breakpoint
CREATE INDEX "encounter_appt_idx" ON "encounter" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "encounter_open_idx" ON "encounter" USING btree ("location_id","status");--> statement-breakpoint
CREATE INDEX "segment_encounter_idx" ON "encounter_segment" USING btree ("encounter_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "segment_component_idx" ON "encounter_segment" USING btree ("encounter_id","component");--> statement-breakpoint
CREATE INDEX "segment_queue_idx" ON "encounter_segment" USING btree ("component","status");--> statement-breakpoint
CREATE INDEX "hp_client_idx" ON "history_physical" USING btree ("client_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hp_encounter_idx" ON "history_physical" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "hp_provider_idx" ON "history_physical" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "vitals_client_idx" ON "vitals" USING btree ("client_id","taken_at");--> statement-breakpoint
CREATE INDEX "vitals_encounter_idx" ON "vitals" USING btree ("encounter_id");