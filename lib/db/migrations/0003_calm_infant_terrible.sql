CREATE TABLE "intake_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"token_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"prefill" jsonb
);
--> statement-breakpoint
CREATE TABLE "intake_submission" (
	"id" text PRIMARY KEY NOT NULL,
	"invite_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"date_of_birth" text,
	"sex" text,
	"goals" jsonb,
	"symptoms" jsonb,
	"history" jsonb,
	"submitted_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"ledger_id" text
);
--> statement-breakpoint
ALTER TABLE "consent" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "consent" ADD COLUMN "lead_id" text;--> statement-breakpoint
ALTER TABLE "consent" ADD COLUMN "text_sha256" text;--> statement-breakpoint
ALTER TABLE "intake_invite" ADD CONSTRAINT "intake_invite_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_submission" ADD CONSTRAINT "intake_submission_invite_id_intake_invite_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."intake_invite"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_submission" ADD CONSTRAINT "intake_submission_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "intake_invite_token_idx" ON "intake_invite" USING btree ("token_sha256");--> statement-breakpoint
CREATE INDEX "intake_invite_lead_idx" ON "intake_invite" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "intake_submission_lead_idx" ON "intake_submission" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intake_submission_invite_idx" ON "intake_submission" USING btree ("invite_id");--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_lead_idx" ON "consent" USING btree ("lead_id");