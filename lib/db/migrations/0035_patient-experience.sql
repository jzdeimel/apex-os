CREATE TABLE "patient_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer NOT NULL,
	"authored_by_staff_id" text NOT NULL,
	"approved_by_staff_id" text,
	"effective_on" text,
	"published_at" timestamp with time zone,
	"replaced_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" text,
	CONSTRAINT "patient_plan_category_check" CHECK ("category" IN ('nutrition','training')),
	CONSTRAINT "patient_plan_status_check" CHECK ("status" IN ('draft','active','replaced','withdrawn')),
	CONSTRAINT "patient_plan_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
ALTER TABLE "patient_plan" ADD CONSTRAINT "patient_plan_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "patient_plan" ADD CONSTRAINT "patient_plan_authored_by_staff_id_staff_id_fk" FOREIGN KEY ("authored_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "patient_plan" ADD CONSTRAINT "patient_plan_approved_by_staff_id_staff_id_fk" FOREIGN KEY ("approved_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "patient_plan" ADD CONSTRAINT "patient_plan_ledger_id_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledger"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "patient_plan_client_idx" ON "patient_plan" USING btree ("client_id","category","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "patient_plan_version_idx" ON "patient_plan" USING btree ("client_id","category","version");
--> statement-breakpoint
CREATE UNIQUE INDEX "patient_plan_one_active_idx" ON "patient_plan" USING btree ("client_id","category") WHERE "status" = 'active';
--> statement-breakpoint
CREATE TABLE "patient_referral" (
	"id" text PRIMARY KEY NOT NULL,
	"referring_client_id" text NOT NULL,
	"code_sha256" text NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"attributed_lead_id" text,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attributed_at" timestamp with time zone,
	"qualified_at" timestamp with time zone,
	"rewarded_at" timestamp with time zone,
	"reward_description" text,
	"revoked_at" timestamp with time zone,
	"ledger_id" text,
	CONSTRAINT "patient_referral_status_check" CHECK ("status" IN ('issued','attributed','qualified','rewarded','expired','revoked'))
);
--> statement-breakpoint
ALTER TABLE "patient_referral" ADD CONSTRAINT "patient_referral_referring_client_id_client_id_fk" FOREIGN KEY ("referring_client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "patient_referral" ADD CONSTRAINT "patient_referral_attributed_lead_id_lead_id_fk" FOREIGN KEY ("attributed_lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "patient_referral" ADD CONSTRAINT "patient_referral_ledger_id_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledger"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "patient_referral_code_idx" ON "patient_referral" USING btree ("code_sha256");
--> statement-breakpoint
CREATE INDEX "patient_referral_client_idx" ON "patient_referral" USING btree ("referring_client_id","status","issued_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "patient_referral_lead_idx" ON "patient_referral" USING btree ("attributed_lead_id") WHERE "attributed_lead_id" IS NOT NULL;
