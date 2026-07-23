CREATE TABLE "community_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"scan_status" text DEFAULT 'pending' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scanned_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"retention_until" timestamp with time zone NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "community_group" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"charter" text NOT NULL,
	"location_id" text,
	"owner_staff_id" text NOT NULL,
	"backup_staff_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"critical_response_minutes" integer DEFAULT 15 NOT NULL,
	"high_response_minutes" integer DEFAULT 60 NOT NULL,
	"medium_response_minutes" integer DEFAULT 240 NOT NULL,
	"low_response_minutes" integer DEFAULT 1440 NOT NULL,
	"content_retention_days" integer DEFAULT 365 NOT NULL,
	"moderation_evidence_retention_days" integer DEFAULT 2555 NOT NULL,
	"attachment_retention_days" integer DEFAULT 365 NOT NULL,
	"attachments_enabled" boolean DEFAULT false NOT NULL,
	"max_attachment_bytes" integer DEFAULT 10485760 NOT NULL,
	"allowed_attachment_mime_types" jsonb DEFAULT '["image/jpeg","image/png","application/pdf"]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "community_member_block" (
	"id" text PRIMARY KEY NOT NULL,
	"blocker_client_id" text NOT NULL,
	"blocked_client_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "community_membership" (
	"group_id" text NOT NULL,
	"client_id" text NOT NULL,
	"handle" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"real_name_opt_in" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_membership_group_id_client_id_pk" PRIMARY KEY("group_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "community_moderation_case" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"post_id" text NOT NULL,
	"owner_staff_id" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"first_response_due_at" timestamp with time zone NOT NULL,
	"resolution_due_at" timestamp with time zone NOT NULL,
	"first_responded_at" timestamp with time zone,
	"first_responded_by" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"action" text,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retention_until" timestamp with time zone NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "community_post" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"parent_post_id" text,
	"author_kind" text NOT NULL,
	"author_client_id" text,
	"author_staff_id" text,
	"author_handle" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by" text,
	"removal_reason" text,
	"retention_until" timestamp with time zone NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "community_report" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"case_id" text NOT NULL,
	"post_id" text NOT NULL,
	"reporter_kind" text NOT NULL,
	"reporter_client_id" text,
	"reporter_staff_id" text,
	"reason" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_attachment" ADD CONSTRAINT "community_attachment_post_id_community_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_post"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_membership" ADD CONSTRAINT "community_membership_group_id_community_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."community_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_moderation_case" ADD CONSTRAINT "community_moderation_case_group_id_community_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."community_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_moderation_case" ADD CONSTRAINT "community_moderation_case_post_id_community_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_post"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post" ADD CONSTRAINT "community_post_group_id_community_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."community_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_report" ADD CONSTRAINT "community_report_case_id_community_moderation_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."community_moderation_case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_report" ADD CONSTRAINT "community_report_post_id_community_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_post"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_attachment_post_idx" ON "community_attachment" USING btree ("post_id","scan_status");--> statement-breakpoint
CREATE UNIQUE INDEX "community_attachment_storage_idx" ON "community_attachment" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "community_attachment_hash_idx" ON "community_attachment" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "community_group_owner_idx" ON "community_group" USING btree ("owner_staff_id","status");--> statement-breakpoint
CREATE INDEX "community_group_location_idx" ON "community_group" USING btree ("location_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "community_member_block_pair_idx" ON "community_member_block" USING btree ("blocker_client_id","blocked_client_id");--> statement-breakpoint
CREATE INDEX "community_member_block_blocker_idx" ON "community_member_block" USING btree ("blocker_client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "community_membership_handle_idx" ON "community_membership" USING btree ("group_id","handle");--> statement-breakpoint
CREATE INDEX "community_membership_client_idx" ON "community_membership" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "community_moderation_queue_idx" ON "community_moderation_case" USING btree ("owner_staff_id","status","first_response_due_at");--> statement-breakpoint
CREATE INDEX "community_moderation_post_idx" ON "community_moderation_case" USING btree ("post_id","status");--> statement-breakpoint
CREATE INDEX "community_moderation_group_idx" ON "community_moderation_case" USING btree ("group_id","status");--> statement-breakpoint
CREATE INDEX "community_post_feed_idx" ON "community_post" USING btree ("group_id","status","posted_at");--> statement-breakpoint
CREATE INDEX "community_post_author_idx" ON "community_post" USING btree ("author_client_id","posted_at");--> statement-breakpoint
CREATE INDEX "community_post_parent_idx" ON "community_post" USING btree ("parent_post_id","posted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "community_report_request_idx" ON "community_report" USING btree ("reporter_kind","request_id");--> statement-breakpoint
CREATE INDEX "community_report_case_idx" ON "community_report" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "community_report_post_idx" ON "community_report" USING btree ("post_id","created_at");--> statement-breakpoint
ALTER TABLE "community_group" ADD CONSTRAINT "community_group_owner_backup_check"
  CHECK ("backup_staff_id" IS NULL OR "backup_staff_id" <> "owner_staff_id");--> statement-breakpoint
ALTER TABLE "community_group" ADD CONSTRAINT "community_group_status_check"
  CHECK ("status" IN ('active','paused','archived'));--> statement-breakpoint
ALTER TABLE "community_group" ADD CONSTRAINT "community_group_sla_check"
  CHECK (
    "critical_response_minutes" BETWEEN 5 AND 10080
    AND "high_response_minutes" BETWEEN 5 AND 10080
    AND "medium_response_minutes" BETWEEN 5 AND 10080
    AND "low_response_minutes" BETWEEN 5 AND 10080
    AND "critical_response_minutes" <= "high_response_minutes"
    AND "high_response_minutes" <= "medium_response_minutes"
    AND "medium_response_minutes" <= "low_response_minutes"
  );--> statement-breakpoint
ALTER TABLE "community_group" ADD CONSTRAINT "community_group_retention_check"
  CHECK (
    "content_retention_days" BETWEEN 30 AND 3650
    AND "moderation_evidence_retention_days" BETWEEN 30 AND 3650
    AND "attachment_retention_days" BETWEEN 30 AND 3650
  );--> statement-breakpoint
ALTER TABLE "community_group" ADD CONSTRAINT "community_group_attachment_policy_check"
  CHECK (
    "max_attachment_bytes" BETWEEN 1 AND 26214400
    AND jsonb_typeof("allowed_attachment_mime_types") = 'array'
  );--> statement-breakpoint
ALTER TABLE "community_member_block" ADD CONSTRAINT "community_member_block_distinct_check"
  CHECK ("blocker_client_id" <> "blocked_client_id");--> statement-breakpoint
ALTER TABLE "community_member_block" ADD CONSTRAINT "community_member_block_status_check"
  CHECK ("status" IN ('active','lifted'));--> statement-breakpoint
ALTER TABLE "community_membership" ADD CONSTRAINT "community_membership_status_check"
  CHECK ("status" IN ('active','left','suspended'));--> statement-breakpoint
ALTER TABLE "community_membership" ADD CONSTRAINT "community_membership_handle_check"
  CHECK ("handle" ~ '^[A-Za-z][A-Za-z0-9_-]{2,31}$');--> statement-breakpoint
ALTER TABLE "community_post" ADD CONSTRAINT "community_post_status_check"
  CHECK ("status" IN ('published','hidden','removed'));--> statement-breakpoint
ALTER TABLE "community_post" ADD CONSTRAINT "community_post_author_check"
  CHECK (
    ("author_kind" = 'member' AND "author_client_id" IS NOT NULL AND "author_staff_id" IS NULL)
    OR
    ("author_kind" = 'staff' AND "author_staff_id" IS NOT NULL AND "author_client_id" IS NULL)
  );--> statement-breakpoint
ALTER TABLE "community_post" ADD CONSTRAINT "community_post_body_check"
  CHECK (length(btrim("body")) BETWEEN 1 AND 3000);--> statement-breakpoint
ALTER TABLE "community_attachment" ADD CONSTRAINT "community_attachment_scan_status_check"
  CHECK ("scan_status" IN ('pending','clean','quarantined','failed'));--> statement-breakpoint
ALTER TABLE "community_attachment" ADD CONSTRAINT "community_attachment_release_check"
  CHECK ("released_at" IS NULL OR "scan_status" = 'clean');--> statement-breakpoint
ALTER TABLE "community_attachment" ADD CONSTRAINT "community_attachment_metadata_check"
  CHECK (
    "byte_size" BETWEEN 1 AND 26214400
    AND "mime_type" IN ('image/jpeg','image/png','application/pdf')
    AND "sha256" ~ '^[0-9a-f]{64}$'
  );--> statement-breakpoint
ALTER TABLE "community_moderation_case" ADD CONSTRAINT "community_moderation_severity_check"
  CHECK ("severity" IN ('critical','high','medium','low'));--> statement-breakpoint
ALTER TABLE "community_moderation_case" ADD CONSTRAINT "community_moderation_status_check"
  CHECK ("status" IN ('open','in-review','resolved','dismissed'));--> statement-breakpoint
ALTER TABLE "community_moderation_case" ADD CONSTRAINT "community_moderation_due_check"
  CHECK (
    "first_response_due_at" <= "resolution_due_at"
    AND "created_at" <= "first_response_due_at"
    AND "created_at" <= "retention_until"
  );--> statement-breakpoint
ALTER TABLE "community_moderation_case" ADD CONSTRAINT "community_moderation_resolution_check"
  CHECK (
    ("status" IN ('open','in-review') AND "resolved_at" IS NULL AND "resolved_by" IS NULL)
    OR
    ("status" IN ('resolved','dismissed') AND "resolved_at" IS NOT NULL AND "resolved_by" IS NOT NULL
      AND "action" IS NOT NULL AND length(btrim("resolution")) > 0)
  );--> statement-breakpoint
ALTER TABLE "community_report" ADD CONSTRAINT "community_report_reason_check"
  CHECK ("reason" IN ('privacy','unsafe-medical-advice','self-harm-or-threat','harassment','impersonation','spam','other'));--> statement-breakpoint
ALTER TABLE "community_report" ADD CONSTRAINT "community_reporter_check"
  CHECK (
    ("reporter_kind" = 'patient' AND "reporter_client_id" IS NOT NULL AND "reporter_staff_id" IS NULL)
    OR
    ("reporter_kind" = 'staff' AND "reporter_staff_id" IS NOT NULL AND "reporter_client_id" IS NULL)
  );--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_community_report_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'community reports are immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER community_report_immutable
BEFORE UPDATE OR DELETE ON "community_report"
FOR EACH ROW EXECUTE FUNCTION apex_community_report_immutable();--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_community_post_evidence_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."group_id" IS DISTINCT FROM OLD."group_id"
    OR NEW."parent_post_id" IS DISTINCT FROM OLD."parent_post_id"
    OR NEW."author_kind" IS DISTINCT FROM OLD."author_kind"
    OR NEW."author_client_id" IS DISTINCT FROM OLD."author_client_id"
    OR NEW."author_staff_id" IS DISTINCT FROM OLD."author_staff_id"
    OR NEW."author_handle" IS DISTINCT FROM OLD."author_handle"
    OR NEW."body" IS DISTINCT FROM OLD."body"
    OR NEW."posted_at" IS DISTINCT FROM OLD."posted_at"
    OR NEW."retention_until" IS DISTINCT FROM OLD."retention_until"
  THEN
    RAISE EXCEPTION 'community post evidence is immutable; moderate by status';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER community_post_evidence_guard
BEFORE UPDATE ON "community_post"
FOR EACH ROW EXECUTE FUNCTION apex_community_post_evidence_guard();--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_community_attachment_evidence_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."post_id" IS DISTINCT FROM OLD."post_id"
    OR NEW."storage_key" IS DISTINCT FROM OLD."storage_key"
    OR NEW."original_name" IS DISTINCT FROM OLD."original_name"
    OR NEW."mime_type" IS DISTINCT FROM OLD."mime_type"
    OR NEW."byte_size" IS DISTINCT FROM OLD."byte_size"
    OR NEW."sha256" IS DISTINCT FROM OLD."sha256"
    OR NEW."created_by" IS DISTINCT FROM OLD."created_by"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    OR NEW."retention_until" IS DISTINCT FROM OLD."retention_until"
  THEN
    RAISE EXCEPTION 'community attachment evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER community_attachment_evidence_guard
BEFORE UPDATE ON "community_attachment"
FOR EACH ROW EXECUTE FUNCTION apex_community_attachment_evidence_guard();
