CREATE TABLE "migration_exception" (
	"id" text PRIMARY KEY NOT NULL,
	"source_system" text NOT NULL,
	"source_entity_type" text NOT NULL,
	"source_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_sha256" text NOT NULL,
	"status" text DEFAULT 'Pending review' NOT NULL,
	"source_updated_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "migration_exception_source_idx" ON "migration_exception" USING btree ("source_system","source_entity_type","source_id","reason_code");--> statement-breakpoint
CREATE INDEX "migration_exception_status_idx" ON "migration_exception" USING btree ("status","reason_code");--> statement-breakpoint
ALTER TABLE "migration_exception" ADD CONSTRAINT "migration_exception_status_check" CHECK (
  "status" IN ('Pending review', 'Resolved', 'Accepted as source')
);--> statement-breakpoint
ALTER TABLE "migration_exception" ADD CONSTRAINT "migration_exception_hash_check" CHECK (
  "payload_sha256" ~ '^[0-9a-f]{64}$'
);--> statement-breakpoint
ALTER TABLE "migration_exception" ADD CONSTRAINT "migration_exception_resolution_check" CHECK (
  ("status" = 'Pending review' AND "resolved_at" IS NULL AND "resolved_by" IS NULL)
  OR
  ("status" IN ('Resolved', 'Accepted as source') AND "resolved_at" IS NOT NULL
    AND length(trim("resolved_by")) > 0 AND length(trim("resolution_note")) > 0)
);--> statement-breakpoint

CREATE OR REPLACE FUNCTION apex_migration_exception_preserve_source() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'Pending review' AND (
    NEW.source_system IS DISTINCT FROM OLD.source_system OR
    NEW.source_entity_type IS DISTINCT FROM OLD.source_entity_type OR
    NEW.source_id IS DISTINCT FROM OLD.source_id OR
    NEW.reason_code IS DISTINCT FROM OLD.reason_code OR
    NEW.payload IS DISTINCT FROM OLD.payload OR
    NEW.payload_sha256 IS DISTINCT FROM OLD.payload_sha256
  ) THEN
    RAISE EXCEPTION 'resolved migration exception % has immutable source evidence', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER migration_exception_preserve_source
  BEFORE UPDATE ON migration_exception
  FOR EACH ROW EXECUTE FUNCTION apex_migration_exception_preserve_source();
