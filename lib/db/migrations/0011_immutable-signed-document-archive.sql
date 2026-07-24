CREATE TABLE "signed_document" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text,
	"kind" text NOT NULL,
	"document_id" text NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"regime" text NOT NULL,
	"document_sha256" text NOT NULL,
	"signature_name" text NOT NULL,
	"signed_by_role" text NOT NULL,
	"signed_by_account_id" text,
	"signed_at" timestamp with time zone NOT NULL,
	"ip_address" text NOT NULL,
	"user_agent" text NOT NULL,
	"electronic_consent_given" boolean NOT NULL,
	"attested_read" boolean NOT NULL,
	"ledger_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signed_document_artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"signed_document_id" text NOT NULL,
	"kind" text NOT NULL,
	"storage_provider" text NOT NULL,
	"object_key" text NOT NULL,
	"media_type" text DEFAULT 'application/pdf' NOT NULL,
	"artifact_sha256" text NOT NULL,
	"delivered_to" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signed_document" ADD CONSTRAINT "signed_document_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signed_document_artifact" ADD CONSTRAINT "signed_document_artifact_signed_document_id_signed_document_id_fk" FOREIGN KEY ("signed_document_id") REFERENCES "public"."signed_document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signed_document_client_idx" ON "signed_document" USING btree ("client_id","signed_at");--> statement-breakpoint
CREATE INDEX "signed_document_definition_idx" ON "signed_document" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "signed_document_hash_idx" ON "signed_document" USING btree ("document_sha256");--> statement-breakpoint
CREATE INDEX "signed_document_artifact_document_idx" ON "signed_document_artifact" USING btree ("signed_document_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "signed_document_artifact_object_idx" ON "signed_document_artifact" USING btree ("storage_provider","object_key");
--> statement-breakpoint
-- A signature covers the exact retained text and evidence tuple. Neither may
-- be edited or deleted; a correction is a newly signed document/version.
CREATE OR REPLACE FUNCTION apex_signed_document_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'signed document % is immutable; create a new signed record instead', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS signed_document_immutable ON signed_document;
--> statement-breakpoint
CREATE TRIGGER signed_document_immutable
  BEFORE UPDATE OR DELETE ON signed_document
  FOR EACH ROW EXECUTE FUNCTION apex_signed_document_immutable();
--> statement-breakpoint
-- Artifact and delivery receipts are evidence too. A replacement artifact is
-- a new row; the original receipt remains inspectable.
CREATE OR REPLACE FUNCTION apex_signed_document_artifact_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'signed document artifact % is append-only', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS signed_document_artifact_append_only ON signed_document_artifact;
--> statement-breakpoint
CREATE TRIGGER signed_document_artifact_append_only
  BEFORE UPDATE OR DELETE ON signed_document_artifact
  FOR EACH ROW EXECUTE FUNCTION apex_signed_document_artifact_append_only();
