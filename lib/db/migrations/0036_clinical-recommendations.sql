CREATE TABLE "clinical_recommendation" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"proposed_discussion" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_staff_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by_staff_id" text,
	"reviewed_at" timestamp with time zone,
	"decision_reason" text,
	"attestation" text,
	"provenance" jsonb NOT NULL,
	"ledger_id" text,
	CONSTRAINT "clinical_recommendation_status_check" CHECK ("status" IN ('draft','pending','approved','declined','withdrawn'))
);
--> statement-breakpoint
ALTER TABLE "clinical_recommendation" ADD CONSTRAINT "clinical_recommendation_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clinical_recommendation" ADD CONSTRAINT "clinical_recommendation_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clinical_recommendation" ADD CONSTRAINT "clinical_recommendation_reviewed_by_staff_id_staff_id_fk" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clinical_recommendation" ADD CONSTRAINT "clinical_recommendation_ledger_id_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledger"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "clinical_recommendation_client_idx" ON "clinical_recommendation" USING btree ("client_id","status","created_at");
--> statement-breakpoint
CREATE INDEX "clinical_recommendation_queue_idx" ON "clinical_recommendation" USING btree ("status","created_at");
