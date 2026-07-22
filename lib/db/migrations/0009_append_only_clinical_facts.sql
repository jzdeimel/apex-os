-- APPEND-ONLY CLINICAL FACTS — enforced by the database, not by convention.
--
-- Paul Kennard set this rule on the 2026-07-21 sync and gave the example
-- himself:
--
--   "Certainly V2 needs to be written this way, that we always append data, we
--    never replace data. I tell you in my first appointment that I'm allergic to
--    penicillin. Six months later you ask me — 'I see you're allergic to
--    penicillin' — I go, no I'm not. Great, we change that, but we never lose
--    track of the fact that you told us on this date that you were, and then you
--    told us on another date that you were not."
--
-- Apex was HALFWAY there: `allergy.ended_at`, `problem.resolved_on` and the
-- ledger all existed, and nothing stopped an in-place UPDATE. A rule kept by
-- convention is a rule broken at 11pm by whoever is fixing a typo, and the
-- resulting chart is indistinguishable from one that was always correct.
--
-- WHY A TRIGGER RATHER THAN REVOKING UPDATE
-- -----------------------------------------
-- The obvious enforcement — REVOKE UPDATE, DELETE FROM the app role — is too
-- blunt, because superseding a fact REQUIRES an update: you insert the new row
-- and close the old one by stamping `ended_at`. A blanket ban makes correction
-- impossible, which is worse than no rule; people would stop recording
-- corrections at all.
--
-- So the trigger allows exactly the closing columns to change and refuses any
-- edit to clinical CONTENT. Correcting a substance, a severity or a diagnosis
-- means a new row, always.
--
-- DELETE IS REFUSED OUTRIGHT. There is no legitimate reason to remove a
-- clinical assertion. A retraction is a closure with a timestamp.

-- ── allergy ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION apex_allergy_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'allergy rows are append-only: close the row with ended_at instead of deleting it (id=%)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Content is immutable. Only the closure columns may move.
  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.substance IS DISTINCT FROM OLD.substance
     OR NEW.reaction IS DISTINCT FROM OLD.reaction
     OR NEW.severity IS DISTINCT FROM OLD.severity
     OR NEW.no_known_allergies IS DISTINCT FROM OLD.no_known_allergies
     OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
     OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at THEN
    RAISE EXCEPTION 'allergy content is append-only: insert a new row and close this one with ended_at (id=%)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Closing is one-way. Re-opening a closed fact rewrites history just as
  -- effectively as editing it.
  IF OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at THEN
    RAISE EXCEPTION 'allergy row % is already closed; its ended_at cannot be changed', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS allergy_append_only ON allergy;
CREATE TRIGGER allergy_append_only
  BEFORE UPDATE OR DELETE ON allergy
  FOR EACH ROW EXECUTE FUNCTION apex_allergy_append_only();

-- ── problem ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION apex_problem_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'problem rows are append-only: resolve the row instead of deleting it (id=%)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.label IS DISTINCT FROM OLD.label
     OR NEW.icd10 IS DISTINCT FROM OLD.icd10
     OR NEW.onset_on IS DISTINCT FROM OLD.onset_on
     OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
     OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at THEN
    RAISE EXCEPTION 'problem content is append-only: insert a new row instead of editing (id=%)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS problem_append_only ON problem;
CREATE TRIGGER problem_append_only
  BEFORE UPDATE OR DELETE ON problem
  FOR EACH ROW EXECUTE FUNCTION apex_problem_append_only();

-- ── vitals ──────────────────────────────────────────────────────────────────
-- Vitals are fully immutable: a correction is a NEW row pointing at the old one
-- through supersedes_id. There is no closure column, so nothing may change.
-- This is where the urge to just fix the number is strongest, which is exactly
-- why it is the strictest of the three.
CREATE OR REPLACE FUNCTION apex_vitals_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'vitals are append-only: supersede the row instead of deleting it (id=%)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RAISE EXCEPTION 'vitals are immutable: record a new reading with supersedes_id=% and a correction_reason', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vitals_append_only ON vitals;
CREATE TRIGGER vitals_append_only
  BEFORE UPDATE OR DELETE ON vitals
  FOR EACH ROW EXECUTE FUNCTION apex_vitals_append_only();

-- ── history_physical ────────────────────────────────────────────────────────
-- A signed H&P is immutable; corrections are addenda. Before signing it is a
-- draft and may be edited freely, so the trigger only bites once signed_at is
-- set — which is the moment the provider attested to it.
CREATE OR REPLACE FUNCTION apex_hp_immutable_after_signing() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a signed History & Physical cannot be deleted (id=%)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'History & Physical % is signed and immutable; record an addendum instead', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hp_immutable_after_signing ON history_physical;
CREATE TRIGGER hp_immutable_after_signing
  BEFORE UPDATE OR DELETE ON history_physical
  FOR EACH ROW EXECUTE FUNCTION apex_hp_immutable_after_signing();

-- ── ledger ──────────────────────────────────────────────────────────────────
-- The chain already detects tampering after the fact through hash verification.
-- This refuses it at the point of the attempt, so a tampered row never enters
-- the table and `verifyChain` never has to report a break that already happened.
CREATE OR REPLACE FUNCTION apex_ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'the audit ledger is append-only; row % cannot be modified or removed', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_immutable ON ledger;
CREATE TRIGGER ledger_immutable
  BEFORE UPDATE OR DELETE ON ledger
  FOR EACH ROW EXECUTE FUNCTION apex_ledger_immutable();
