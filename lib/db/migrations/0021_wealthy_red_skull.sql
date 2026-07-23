ALTER TABLE "consult_addendum" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "consult_addendum" ADD COLUMN "attestation" text;--> statement-breakpoint
ALTER TABLE "consult_addendum" ADD COLUMN "signer_credential" text;--> statement-breakpoint
ALTER TABLE "consult_addendum" ADD COLUMN "signed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "consult_addendum" SET
  "reason" = COALESCE(NULLIF("reason", ''), 'Migrated legacy addendum; original reason not captured'),
  "attestation" = COALESCE(NULLIF("attestation", ''), 'Migrated legacy addendum; signed attestation was not captured'),
  "signed_at" = COALESCE("signed_at", "created_at");--> statement-breakpoint
ALTER TABLE "consult_addendum" ALTER COLUMN "reason" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "consult_addendum" ALTER COLUMN "attestation" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "consult_addendum" ALTER COLUMN "signed_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "consult_addendum" ADD CONSTRAINT "consult_addendum_content_check" CHECK (length(trim("body")) > 0 AND length(trim("reason")) > 0 AND length(trim("attestation")) > 0);--> statement-breakpoint
ALTER TABLE "adverse_event" ADD CONSTRAINT "adverse_event_severity_check" CHECK ("severity" IN ('mild', 'moderate', 'severe', 'life-threatening'));--> statement-breakpoint
ALTER TABLE "adverse_event" ADD CONSTRAINT "adverse_event_reporter_check" CHECK ("reporter_kind" IN ('member', 'coach', 'clinician'));--> statement-breakpoint
UPDATE "adverse_event" SET
  "reviewed_at" = COALESCE("reviewed_at", "reported_at"),
  "reviewed_by" = COALESCE("reviewed_by", 'legacy-reviewer-unknown'),
  "outcome" = COALESCE(NULLIF("outcome", ''), 'Migrated legacy review; outcome not captured'),
  "action_taken" = COALESCE(NULLIF("action_taken", ''), 'Migrated legacy review; action not captured')
WHERE "reviewed_at" IS NOT NULL OR "reviewed_by" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "adverse_event" ADD CONSTRAINT "adverse_event_review_check" CHECK (
  ("reviewed_at" IS NULL AND "reviewed_by" IS NULL) OR
  ("reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL AND length(trim("outcome")) > 0 AND length(trim("action_taken")) > 0)
);--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_consult_addendum_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'consult addendum % is signed and immutable; append another addendum instead', OLD.id;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS consult_addendum_immutable ON consult_addendum;--> statement-breakpoint
CREATE TRIGGER consult_addendum_immutable BEFORE UPDATE OR DELETE ON consult_addendum
  FOR EACH ROW EXECUTE FUNCTION apex_consult_addendum_immutable();--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_adverse_event_review_once() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'adverse event % cannot be deleted', OLD.id;
  END IF;
  IF OLD.client_id IS DISTINCT FROM NEW.client_id
    OR OLD.reported_at IS DISTINCT FROM NEW.reported_at
    OR OLD.reported_by IS DISTINCT FROM NEW.reported_by
    OR OLD.reporter_kind IS DISTINCT FROM NEW.reporter_kind
    OR OLD.suspect_sku IS DISTINCT FROM NEW.suspect_sku
    OR OLD.description IS DISTINCT FROM NEW.description
    OR OLD.severity IS DISTINCT FROM NEW.severity THEN
    RAISE EXCEPTION 'adverse event % report facts are immutable', OLD.id;
  END IF;
  IF OLD.reviewed_at IS NOT NULL OR NEW.reviewed_at IS NULL THEN
    RAISE EXCEPTION 'adverse event % review is immutable; add a signed consult addendum for later facts', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS adverse_event_review_once ON adverse_event;--> statement-breakpoint
CREATE TRIGGER adverse_event_review_once BEFORE UPDATE OR DELETE ON adverse_event
  FOR EACH ROW EXECUTE FUNCTION apex_adverse_event_review_once();
