ALTER TABLE "intake_invite" ADD COLUMN "mode" text DEFAULT 'self-serve' NOT NULL;--> statement-breakpoint
ALTER TABLE "intake_invite" ADD COLUMN "captured_by" text;