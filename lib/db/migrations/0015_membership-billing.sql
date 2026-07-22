CREATE TABLE "membership" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"plan_code" text NOT NULL,
	"plan_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"monthly_rate_cents" integer NOT NULL,
	"started_on" text NOT NULL,
	"current_period_start" text,
	"current_period_end" text,
	"next_bill_on" text,
	"home_location_id" text NOT NULL,
	"merchant_account_id" text NOT NULL,
	"payment_method_id" text,
	"paused_at" timestamp with time zone,
	"pause_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"source_system" text,
	"source_id" text,
	"source_updated_at" timestamp with time zone,
	"ledger_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "membership_id" text;--> statement-breakpoint
ALTER TABLE "payment_attempt" ADD COLUMN "merchant_account_id" text;--> statement-breakpoint
ALTER TABLE "payment_attempt" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "payment_attempt" ADD COLUMN "original_payment_attempt_id" text;--> statement-breakpoint
ALTER TABLE "payment_attempt" ADD COLUMN "next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_attempt" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_method" ADD COLUMN "merchant_account_id" text;--> statement-breakpoint
CREATE INDEX "membership_client_idx" ON "membership" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_current_idx" ON "membership" USING btree ("client_id") WHERE status IN ('active','paused','past_due');--> statement-breakpoint
CREATE UNIQUE INDEX "membership_source_idx" ON "membership" USING btree ("source_system","source_id");--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_idempotency_idx" ON "payment_attempt" USING btree ("idempotency_key");