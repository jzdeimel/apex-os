CREATE TABLE "lab_critical_alert" (
	"id" text PRIMARY KEY NOT NULL,
	"lab_result_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone,
	"resolution" text,
	"ledger_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_observation" (
	"id" text PRIMARY KEY NOT NULL,
	"lab_result_id" text NOT NULL,
	"code_system" text,
	"code" text,
	"name" text NOT NULL,
	"value_text" text,
	"value_numeric" real,
	"unit" text,
	"reference_range" text,
	"flag" text DEFAULT 'normal' NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"source_page" integer,
	"source_region" jsonb
);
--> statement-breakpoint
CREATE TABLE "lab_order" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"encounter_id" text,
	"appointment_id" text,
	"location_id" text NOT NULL,
	"panel_code" text NOT NULL,
	"panel_name" text NOT NULL,
	"vendor" text,
	"priority" text DEFAULT 'routine' NOT NULL,
	"fasting_required" boolean DEFAULT false NOT NULL,
	"indications" text NOT NULL,
	"instructions" text,
	"status" text DEFAULT 'ordered' NOT NULL,
	"ordered_by" text NOT NULL,
	"ordered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_by" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"source_system" text,
	"source_id" text,
	"ledger_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_result" (
	"id" text PRIMARY KEY NOT NULL,
	"lab_order_id" text NOT NULL,
	"client_id" text NOT NULL,
	"vendor" text NOT NULL,
	"external_result_id" text NOT NULL,
	"status" text DEFAULT 'final' NOT NULL,
	"resulted_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"abnormal" boolean DEFAULT false NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"source_hash" text NOT NULL,
	"source_artifact_id" text,
	"supersedes_id" text,
	"recorded_by" text NOT NULL,
	"ledger_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_review" (
	"id" text PRIMARY KEY NOT NULL,
	"lab_result_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"summary" text NOT NULL,
	"critical_acknowledged" boolean DEFAULT false NOT NULL,
	"follow_up" text,
	"patient_release_status" text DEFAULT 'held' NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"ledger_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_specimen" (
	"id" text PRIMARY KEY NOT NULL,
	"lab_order_id" text NOT NULL,
	"accession" text NOT NULL,
	"vendor" text NOT NULL,
	"specimen_type" text NOT NULL,
	"status" text DEFAULT 'collected' NOT NULL,
	"collected_by" text NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"ledger_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lab_critical_alert" ADD CONSTRAINT "lab_critical_alert_lab_result_id_lab_result_id_fk" FOREIGN KEY ("lab_result_id") REFERENCES "public"."lab_result"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_observation" ADD CONSTRAINT "lab_observation_lab_result_id_lab_result_id_fk" FOREIGN KEY ("lab_result_id") REFERENCES "public"."lab_result"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_order" ADD CONSTRAINT "lab_order_encounter_id_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_result" ADD CONSTRAINT "lab_result_lab_order_id_lab_order_id_fk" FOREIGN KEY ("lab_order_id") REFERENCES "public"."lab_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_review" ADD CONSTRAINT "lab_review_lab_result_id_lab_result_id_fk" FOREIGN KEY ("lab_result_id") REFERENCES "public"."lab_result"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_specimen" ADD CONSTRAINT "lab_specimen_lab_order_id_lab_order_id_fk" FOREIGN KEY ("lab_order_id") REFERENCES "public"."lab_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lab_critical_result_idx" ON "lab_critical_alert" USING btree ("lab_result_id");--> statement-breakpoint
CREATE INDEX "lab_critical_status_idx" ON "lab_critical_alert" USING btree ("status","opened_at");--> statement-breakpoint
CREATE INDEX "lab_observation_result_idx" ON "lab_observation" USING btree ("lab_result_id","name");--> statement-breakpoint
CREATE INDEX "lab_order_client_idx" ON "lab_order" USING btree ("client_id","ordered_at");--> statement-breakpoint
CREATE INDEX "lab_order_worklist_idx" ON "lab_order" USING btree ("location_id","status","ordered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_order_source_idx" ON "lab_order" USING btree ("source_system","source_id");--> statement-breakpoint
CREATE INDEX "lab_result_client_idx" ON "lab_result" USING btree ("client_id","resulted_at");--> statement-breakpoint
CREATE INDEX "lab_result_order_idx" ON "lab_result" USING btree ("lab_order_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_result_external_idx" ON "lab_result" USING btree ("vendor","external_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_review_result_idx" ON "lab_review" USING btree ("lab_result_id");--> statement-breakpoint
CREATE INDEX "lab_review_reviewer_idx" ON "lab_review" USING btree ("reviewer_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "lab_specimen_order_idx" ON "lab_specimen" USING btree ("lab_order_id","collected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_specimen_accession_idx" ON "lab_specimen" USING btree ("vendor","accession");
--> statement-breakpoint
ALTER TABLE "lab_order" ADD CONSTRAINT "lab_order_status_check" CHECK ("status" IN ('ordered','collected','in-transit','partial','resulted','reviewed','cancelled'));
--> statement-breakpoint
ALTER TABLE "lab_order" ADD CONSTRAINT "lab_order_priority_check" CHECK ("priority" IN ('routine','urgent'));
--> statement-breakpoint
ALTER TABLE "lab_specimen" ADD CONSTRAINT "lab_specimen_status_check" CHECK ("status" IN ('collected','rejected','shipped','received'));
--> statement-breakpoint
ALTER TABLE "lab_result" ADD CONSTRAINT "lab_result_status_check" CHECK ("status" IN ('preliminary','final','corrected'));
--> statement-breakpoint
ALTER TABLE "lab_result" ADD CONSTRAINT "lab_result_hash_check" CHECK ("source_hash" ~ '^[a-f0-9]{64}$');
--> statement-breakpoint
ALTER TABLE "lab_observation" ADD CONSTRAINT "lab_observation_flag_check" CHECK ("flag" IN ('normal','abnormal-low','abnormal-high','critical-low','critical-high','unknown'));
--> statement-breakpoint
ALTER TABLE "lab_observation" ADD CONSTRAINT "lab_observation_value_check" CHECK ("value_text" IS NOT NULL OR "value_numeric" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "lab_review" ADD CONSTRAINT "lab_review_release_check" CHECK ("patient_release_status" IN ('held','released'));
--> statement-breakpoint
ALTER TABLE "lab_critical_alert" ADD CONSTRAINT "lab_critical_status_check" CHECK ("status" IN ('open','acknowledged','resolved'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_lab_record_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% % is immutable; append a corrected result version instead', TG_TABLE_NAME, OLD.id
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS lab_result_immutable ON lab_result;
--> statement-breakpoint
CREATE TRIGGER lab_result_immutable BEFORE UPDATE OR DELETE ON lab_result
  FOR EACH ROW EXECUTE FUNCTION apex_lab_record_immutable();
--> statement-breakpoint
DROP TRIGGER IF EXISTS lab_observation_immutable ON lab_observation;
--> statement-breakpoint
CREATE TRIGGER lab_observation_immutable BEFORE UPDATE OR DELETE ON lab_observation
  FOR EACH ROW EXECUTE FUNCTION apex_lab_record_immutable();
--> statement-breakpoint
DROP TRIGGER IF EXISTS lab_review_immutable ON lab_review;
--> statement-breakpoint
CREATE TRIGGER lab_review_immutable BEFORE UPDATE OR DELETE ON lab_review
  FOR EACH ROW EXECUTE FUNCTION apex_lab_record_immutable();
