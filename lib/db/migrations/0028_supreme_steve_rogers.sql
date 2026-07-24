ALTER TABLE "contact_entry" ALTER COLUMN "staff_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_entry" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "contact_entry" ADD COLUMN "source_has_attachments" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_entry" ADD COLUMN "source_external_id" text;--> statement-breakpoint
ALTER TABLE "contact_entry" ADD COLUMN "source_system" text;--> statement-breakpoint
ALTER TABLE "contact_entry" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "contact_entry" ADD COLUMN "source_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_source_idx" ON "contact_entry" USING btree ("source_system","source_id");--> statement-breakpoint
ALTER TABLE "contact_entry" ADD CONSTRAINT "contact_source_pair_check" CHECK (
  ("source_system" IS NULL AND "source_id" IS NULL)
  OR ("source_system" IS NOT NULL AND "source_id" IS NOT NULL)
);--> statement-breakpoint

CREATE OR REPLACE FUNCTION apex_historical_contact_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.source_system = 'alpha-v1' THEN
    RAISE EXCEPTION 'imported historical contact facts are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER historical_contact_no_mutation
  BEFORE UPDATE OR DELETE ON contact_entry
  FOR EACH ROW EXECUTE FUNCTION apex_historical_contact_immutable();
