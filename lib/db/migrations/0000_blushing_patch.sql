CREATE TABLE "adverse_event" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"reported_by" text NOT NULL,
	"reporter_kind" text NOT NULL,
	"suspect_sku" text,
	"description" text NOT NULL,
	"severity" text NOT NULL,
	"outcome" text,
	"action_taken" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"external_report_ref" text,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "allergy" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"substance" text NOT NULL,
	"reaction" text,
	"severity" text DEFAULT 'unknown' NOT NULL,
	"no_known_allergies" boolean DEFAULT false NOT NULL,
	"recorded_by" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "appointment" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"location_id" text NOT NULL,
	"visit_type" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'Scheduled' NOT NULL,
	"arrived_at" timestamp with time zone,
	"roomed_at" timestamp with time zone,
	"room" text,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancel_reason" text,
	"patient_state" text,
	"booked_by" text,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"scope" text NOT NULL,
	"document_version" text NOT NULL,
	"granted" boolean NOT NULL,
	"signature_name" text,
	"signed_at" timestamp with time zone,
	"ip_address" text,
	"user_agent" text,
	"revoked_at" timestamp with time zone,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "consult" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"author_id" text NOT NULL,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_min" integer,
	"subjective" text,
	"objective" text,
	"assessment" text,
	"plan" text,
	"raw_notes" text,
	"ai_summary" jsonb,
	"status" text NOT NULL,
	"signed_at" timestamp with time zone,
	"signed_by" text,
	"attestation" text,
	"signer_credential" text,
	"visible_to_client" boolean DEFAULT false NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "consult_addendum" (
	"id" text PRIMARY KEY NOT NULL,
	"consult_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "contact_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"outcome" text,
	"notes" text,
	"template_id" text,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "dispense" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"prescription_id" text,
	"sku" text NOT NULL,
	"lot_number" text NOT NULL,
	"expiry_on" text,
	"quantity" integer NOT NULL,
	"method" text NOT NULL,
	"location_id" text,
	"dispensed_by" text NOT NULL,
	"dispensed_at" timestamp with time zone NOT NULL,
	"order_id" text,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "dose_log" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"prescription_id" text NOT NULL,
	"date" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"site" text,
	"skipped" boolean DEFAULT false NOT NULL,
	"skip_reason" text,
	"retracted_at" timestamp with time zone,
	"retracted_by" text,
	"source" text DEFAULT 'member-self-report' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalation" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"raised_by_staff_id" text NOT NULL,
	"raised_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"priority" text NOT NULL,
	"question" text NOT NULL,
	"member_quote" text,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'Open' NOT NULL,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone,
	"answered_by" text,
	"answered_at" timestamp with time zone,
	"answer" text,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "instrument_score" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"instrument" text NOT NULL,
	"version" text NOT NULL,
	"administered_at" timestamp with time zone NOT NULL,
	"items" jsonb NOT NULL,
	"total" real,
	"band" text,
	"administered_by" text
);
--> statement-breakpoint
CREATE TABLE "inventory_movement" (
	"id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"lot_number" text NOT NULL,
	"location_id" text NOT NULL,
	"kind" text NOT NULL,
	"quantity_delta" integer NOT NULL,
	"expiry_on" text,
	"reason" text,
	"staff_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"dispense_id" text,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"number" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"discount_reason" text,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"hsa_eligible_cents" integer,
	"location_id" text,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "invoice_line" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"sku" text,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"hsa_eligibility" text DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"track" text,
	"preferred_location_id" text,
	"modality" text,
	"reason" text,
	"source" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"referrer_client_id" text,
	"owner_staff_id" text,
	"stage" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"converted_client_id" text,
	"converted_at" timestamp with time zone,
	"lost_reason" text
);
--> statement-breakpoint
CREATE TABLE "lead_stage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"by_staff_id" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"subject_id" text,
	"subject_name" text,
	"location_id" text,
	"reason" text,
	"before" jsonb,
	"after" jsonb,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"external" boolean DEFAULT true NOT NULL,
	"dose" text,
	"frequency" text,
	"started_on" text,
	"stopped_on" text,
	"prescriber" text,
	"recorded_by" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_day" (
	"client_id" text NOT NULL,
	"date" text NOT NULL,
	"weight_lb" real,
	"feel" jsonb,
	"protected_day" boolean DEFAULT false NOT NULL,
	"protected_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_day_client_id_date_pk" PRIMARY KEY("client_id","date")
);
--> statement-breakpoint
CREATE TABLE "member_prefs" (
	"client_id" text PRIMARY KEY NOT NULL,
	"gamification_enabled" boolean DEFAULT true NOT NULL,
	"leaderboard_opt_in" boolean DEFAULT false NOT NULL,
	"community_opt_in" boolean DEFAULT false NOT NULL,
	"notification_prefs" jsonb,
	"quiet_hours_start" integer DEFAULT 21,
	"quiet_hours_end" integer DEFAULT 8,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"thread" text NOT NULL,
	"sender_id" text NOT NULL,
	"sender_kind" text NOT NULL,
	"recipient_id" text,
	"recipient_role" text,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"escalation_id" text
);
--> statement-breakpoint
CREATE TABLE "payment_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text,
	"client_id" text NOT NULL,
	"payment_method_id" text,
	"processor" text NOT NULL,
	"processor_ref" text,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"attempted_at" timestamp with time zone NOT NULL,
	"dunning_attempt" integer DEFAULT 0 NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "payment_method" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"processor" text NOT NULL,
	"processor_token" text NOT NULL,
	"brand" text,
	"last4" text,
	"exp_month" integer,
	"exp_year" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pdmp_check" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"checked_by" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"external_ref" text,
	"result" text NOT NULL,
	"notes" text,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "prescription" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"sku" text NOT NULL,
	"dose_amount" real NOT NULL,
	"dose_unit" text NOT NULL,
	"supply" jsonb NOT NULL,
	"days" jsonb NOT NULL,
	"time_of_day" text NOT NULL,
	"schedule_class" text,
	"quantity_authorised" integer,
	"refills_authorised" integer,
	"refills_used" integer DEFAULT 0 NOT NULL,
	"expires_on" text,
	"prescribed_by" text NOT NULL,
	"prescribed_at" timestamp with time zone NOT NULL,
	"prescriber_dea" text,
	"patient_state" text,
	"status" text DEFAULT 'active' NOT NULL,
	"discontinued_at" timestamp with time zone,
	"discontinued_reason" text,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "problem" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"label" text NOT NULL,
	"icd10" text,
	"status" text DEFAULT 'active' NOT NULL,
	"onset_on" text,
	"resolved_on" text,
	"recorded_by" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"credential" text NOT NULL,
	"state" text NOT NULL,
	"license_number" text,
	"issued_on" text,
	"expires_on" text,
	"dea_number" text,
	"dea_expires_on" text,
	"supervising_staff_id" text,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consult_addendum" ADD CONSTRAINT "consult_addendum_consult_id_consult_id_fk" FOREIGN KEY ("consult_id") REFERENCES "public"."consult"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_stage_event" ADD CONSTRAINT "lead_stage_event_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ae_client_idx" ON "adverse_event" USING btree ("client_id","reported_at");--> statement-breakpoint
CREATE INDEX "ae_unreviewed_idx" ON "adverse_event" USING btree ("reviewed_at");--> statement-breakpoint
CREATE INDEX "allergy_client_idx" ON "allergy" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "appt_day_idx" ON "appointment" USING btree ("location_id","start_at");--> statement-breakpoint
CREATE INDEX "appt_client_idx" ON "appointment" USING btree ("client_id","start_at");--> statement-breakpoint
CREATE INDEX "appt_staff_idx" ON "appointment" USING btree ("staff_id","start_at");--> statement-breakpoint
CREATE INDEX "consent_client_scope_idx" ON "consent" USING btree ("client_id","scope");--> statement-breakpoint
CREATE INDEX "consult_client_idx" ON "consult" USING btree ("client_id","started_at");--> statement-breakpoint
CREATE INDEX "consult_unsigned_idx" ON "consult" USING btree ("author_id","status");--> statement-breakpoint
CREATE INDEX "contact_client_idx" ON "contact_entry" USING btree ("client_id","at");--> statement-breakpoint
CREATE INDEX "dispense_lot_idx" ON "dispense" USING btree ("lot_number");--> statement-breakpoint
CREATE INDEX "dispense_client_idx" ON "dispense" USING btree ("client_id","dispensed_at");--> statement-breakpoint
CREATE INDEX "dose_log_client_date_idx" ON "dose_log" USING btree ("client_id","date");--> statement-breakpoint
CREATE INDEX "escalation_open_idx" ON "escalation" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "escalation_client_idx" ON "escalation" USING btree ("client_id","raised_at");--> statement-breakpoint
CREATE INDEX "instrument_client_idx" ON "instrument_score" USING btree ("client_id","instrument","administered_at");--> statement-breakpoint
CREATE INDEX "inv_stock_idx" ON "inventory_movement" USING btree ("sku","location_id","lot_number");--> statement-breakpoint
CREATE INDEX "inv_lot_idx" ON "inventory_movement" USING btree ("lot_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_number_idx" ON "invoice" USING btree ("number");--> statement-breakpoint
CREATE INDEX "invoice_client_idx" ON "invoice" USING btree ("client_id","issued_at");--> statement-breakpoint
CREATE INDEX "lead_stage_idx" ON "lead" USING btree ("stage","created_at");--> statement-breakpoint
CREATE INDEX "lead_source_idx" ON "lead" USING btree ("source","created_at");--> statement-breakpoint
CREATE INDEX "lead_stage_lead_idx" ON "lead_stage_event" USING btree ("lead_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_seq_idx" ON "ledger" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "ledger_subject_at_idx" ON "ledger" USING btree ("subject_id","at");--> statement-breakpoint
CREATE INDEX "ledger_entity_idx" ON "ledger" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "medication_client_idx" ON "medication" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "member_day_client_date_idx" ON "member_day" USING btree ("client_id","date");--> statement-breakpoint
CREATE INDEX "message_thread_idx" ON "message" USING btree ("client_id","thread","sent_at");--> statement-breakpoint
CREATE INDEX "payment_invoice_idx" ON "payment_attempt" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_failed_idx" ON "payment_attempt" USING btree ("status","attempted_at");--> statement-breakpoint
CREATE INDEX "pm_client_idx" ON "payment_method" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "pdmp_client_idx" ON "pdmp_check" USING btree ("client_id","checked_at");--> statement-breakpoint
CREATE INDEX "rx_client_idx" ON "prescription" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "rx_controlled_idx" ON "prescription" USING btree ("schedule_class","prescribed_at");--> statement-breakpoint
CREATE INDEX "problem_client_idx" ON "problem" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "cred_staff_idx" ON "staff_credential" USING btree ("staff_id","state");--> statement-breakpoint
CREATE INDEX "cred_expiry_idx" ON "staff_credential" USING btree ("expires_on");