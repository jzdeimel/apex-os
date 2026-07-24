ALTER TABLE "consult" ADD COLUMN "source_system" text;--> statement-breakpoint
ALTER TABLE "consult" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "consult" ADD COLUMN "source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consult" ADD COLUMN "supersedes_consult_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "consult_source_idx" ON "consult" USING btree ("source_system","source_id");--> statement-breakpoint

-- A finalized clinical note is a record, not a mutable document. The only
-- post-sign update the application performs is attaching the ledger witness
-- created in the same transaction. Everything else must be an addendum.
CREATE OR REPLACE FUNCTION apex_signed_consult_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'signed consult % is immutable; append an addendum instead', OLD.id;
  END IF;
  IF OLD.status = 'Signed' THEN
    IF OLD.ledger_id IS NULL
       AND NEW.ledger_id IS NOT NULL
       AND (to_jsonb(NEW) - 'ledger_id') = (to_jsonb(OLD) - 'ledger_id') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'signed consult % is immutable; append an addendum instead', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS signed_consult_immutable ON consult;--> statement-breakpoint
CREATE TRIGGER signed_consult_immutable
  BEFORE UPDATE OR DELETE ON consult
  FOR EACH ROW WHEN (OLD.status = 'Signed')
  EXECUTE FUNCTION apex_signed_consult_immutable();
