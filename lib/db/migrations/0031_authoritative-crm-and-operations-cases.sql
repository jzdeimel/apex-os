CREATE TABLE "lead_note" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"body" text NOT NULL,
	"author_staff_id" text NOT NULL,
	"author_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "lead_owner_event" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"from_staff_id" text,
	"to_staff_id" text,
	"reason" text NOT NULL,
	"by_staff_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "lead_task" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"title" text NOT NULL,
	"assignee_staff_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by_staff_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_staff_id" text,
	"completion_note" text,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "operational_case" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"subject" text NOT NULL,
	"detail" text NOT NULL,
	"client_id" text,
	"lead_id" text,
	"location_id" text,
	"owner_staff_id" text,
	"requested_by_kind" text NOT NULL,
	"requested_by_id" text NOT NULL,
	"requested_by_name" text NOT NULL,
	"first_response_due_at" timestamp with time zone NOT NULL,
	"first_responded_at" timestamp with time zone,
	"due_at" timestamp with time zone NOT NULL,
	"record_scope" text,
	"requested_format" text,
	"recipient" text,
	"amendment_record_reference" text,
	"amendment_requested_text" text,
	"identity_verification_status" text DEFAULT 'pending' NOT NULL,
	"resolution" text,
	"denial_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"retention_until" timestamp with time zone NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "operational_case_event" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"note" text,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "first_response_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "first_contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "lead"
SET
	"first_response_due_at" = "created_at" + interval '15 minutes',
	"updated_at" = "created_at";--> statement-breakpoint
ALTER TABLE "lead" ALTER COLUMN "first_response_due_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_note" ADD CONSTRAINT "lead_note_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_note" ADD CONSTRAINT "lead_note_ledger_id_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_owner_event" ADD CONSTRAINT "lead_owner_event_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_owner_event" ADD CONSTRAINT "lead_owner_event_ledger_id_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_task" ADD CONSTRAINT "lead_task_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_task" ADD CONSTRAINT "lead_task_ledger_id_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_case" ADD CONSTRAINT "operational_case_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_case" ADD CONSTRAINT "operational_case_ledger_id_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_case_event" ADD CONSTRAINT "operational_case_event_case_id_operational_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."operational_case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_case_event" ADD CONSTRAINT "operational_case_event_ledger_id_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_note_lead_idx" ON "lead_note" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_owner_event_lead_idx" ON "lead_owner_event" USING btree ("lead_id","at");--> statement-breakpoint
CREATE INDEX "lead_task_lead_idx" ON "lead_task" USING btree ("lead_id","status","due_at");--> statement-breakpoint
CREATE INDEX "lead_task_assignee_idx" ON "lead_task" USING btree ("assignee_staff_id","status","due_at");--> statement-breakpoint
CREATE INDEX "operational_case_queue_idx" ON "operational_case" USING btree ("status","priority","due_at");--> statement-breakpoint
CREATE INDEX "operational_case_owner_idx" ON "operational_case" USING btree ("owner_staff_id","status","due_at");--> statement-breakpoint
CREATE INDEX "operational_case_client_idx" ON "operational_case" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "operational_case_event_case_idx" ON "operational_case_event" USING btree ("case_id","at");
