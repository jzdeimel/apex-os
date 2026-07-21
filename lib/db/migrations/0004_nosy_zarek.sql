DROP INDEX "staff_oid_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "staff_oid_idx" ON "staff" USING btree ("entra_object_id") WHERE entra_object_id IS NOT NULL;--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- HARD INVARIANTS.
--
-- These were comments in schema.ts describing rules the application intended to
-- keep. A rule the database does not enforce is a rule that holds until the
-- first bug, and every one of these guards a clinical or financial fact.
-- ---------------------------------------------------------------------------

-- Consent must belong to exactly one of a client or a lead. Both-null orphans
-- the signature (nobody consented to anything); both-set makes it ambiguous
-- which person is bound by it.
ALTER TABLE "consent" DROP CONSTRAINT IF EXISTS "consent_subject_xor";--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_subject_xor"
  CHECK ((client_id IS NOT NULL) <> (lead_id IS NOT NULL));--> statement-breakpoint

-- A dispense of zero or fewer units is not a dispense, and a negative one
-- silently CREATES controlled-substance stock.
ALTER TABLE "dispense" DROP CONSTRAINT IF EXISTS "dispense_qty_positive";--> statement-breakpoint
ALTER TABLE "dispense" ADD CONSTRAINT "dispense_qty_positive"
  CHECK (quantity > 0);--> statement-breakpoint

-- The ledger's monotonic counter must start at 1 and never be reused. The
-- unique index already prevents reuse; this prevents a zero/negative seq being
-- inserted ahead of the chain.
ALTER TABLE "ledger" DROP CONSTRAINT IF EXISTS "ledger_seq_positive";--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_seq_positive"
  CHECK (seq > 0);--> statement-breakpoint

-- LEDGER IMMUTABILITY, enforced by the database rather than by convention.
-- The repository layer has no UPDATE or DELETE path, but "we did not write the
-- code" is not tamper-evidence. A trigger makes the append-only claim true even
-- against a direct psql session using the app's own credential.
CREATE OR REPLACE FUNCTION apex_ledger_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger is append-only: % on ledger row % is not permitted', TG_OP, OLD.id
    USING HINT = 'Corrections are new compensating rows, never edits.';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS apex_ledger_no_update ON "ledger";--> statement-breakpoint
CREATE TRIGGER apex_ledger_no_update
  BEFORE UPDATE ON "ledger"
  FOR EACH ROW EXECUTE FUNCTION apex_ledger_is_append_only();--> statement-breakpoint

DROP TRIGGER IF EXISTS apex_ledger_no_delete ON "ledger";--> statement-breakpoint
CREATE TRIGGER apex_ledger_no_delete
  BEFORE DELETE ON "ledger"
  FOR EACH ROW EXECUTE FUNCTION apex_ledger_is_append_only();
