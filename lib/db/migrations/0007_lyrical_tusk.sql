ALTER TABLE "intake_submission" ADD COLUMN "answers" jsonb;--> statement-breakpoint
ALTER TABLE "intake_submission" ADD COLUMN "form_version" text;--> statement-breakpoint
ALTER TABLE "intake_submission" ADD COLUMN "form_sha256" text;--> statement-breakpoint
ALTER TABLE "intake_submission" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "intake_submission" ADD COLUMN "captured_by" text;