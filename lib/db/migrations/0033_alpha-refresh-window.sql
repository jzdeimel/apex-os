-- Alpha remains the source of truth until the approved cutover. Rows may be
-- corrected there between rehearsal snapshots, while Apex's historical tables
-- are otherwise immutable. The importer opens a transaction-local refresh
-- window; ordinary application sessions and DELETE operations remain blocked.

CREATE OR REPLACE FUNCTION apex_historical_contact_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.source_system = 'alpha-v1' THEN
    IF TG_OP = 'UPDATE'
       AND current_setting('apex.migration_mode', true) = 'alpha-refresh'
       AND NEW.source_system = OLD.source_system
       AND NEW.source_id = OLD.source_id THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'imported historical contact facts are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION apex_historical_sale_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_setting('apex.migration_mode', true) = 'alpha-refresh'
     AND OLD.source_system = 'alpha-v1'
     AND NEW.source_system = OLD.source_system
     AND NEW.source_id = OLD.source_id THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'posted historical commercial facts are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION apex_historical_fulfillment_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_setting('apex.migration_mode', true) = 'alpha-refresh'
     AND OLD.source_system = 'alpha-v1'
     AND NEW.source_system = OLD.source_system
     AND NEW.source_id = OLD.source_id THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'imported historical fulfillment facts are immutable';
END;
$$ LANGUAGE plpgsql;
