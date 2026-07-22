ALTER TABLE "consent" ADD COLUMN "signed_by_role" text;--> statement-breakpoint
ALTER TABLE "consent" ADD COLUMN "electronic_consent_given" boolean;--> statement-breakpoint
ALTER TABLE "consent" ADD COLUMN "attested_read" boolean;