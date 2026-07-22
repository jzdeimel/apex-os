CREATE TABLE "client" (
	"id" text PRIMARY KEY NOT NULL,
	"mrn" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"preferred_name" text,
	"date_of_birth" text,
	"sex" text,
	"email" text,
	"phone" text,
	"address1" text,
	"address2" text,
	"city" text,
	"state" text,
	"zip" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_prospect" boolean DEFAULT false NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"home_location_id" text,
	"assigned_coach_id" text,
	"assigned_provider_id" text,
	"source_system" text,
	"source_id" text,
	"source_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_location" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address1" text,
	"city" text,
	"state" text,
	"zip" text,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"merchant_account_id" text,
	"source_system" text,
	"source_id" text,
	"source_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_binding" (
	"id" text PRIMARY KEY NOT NULL,
	"source_system" text NOT NULL,
	"entity_type" text NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL,
	"source_updated_at" timestamp with time zone,
	"checksum" text NOT NULL,
	"first_run_id" text NOT NULL,
	"last_run_id" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_run" (
	"id" text PRIMARY KEY NOT NULL,
	"source_system" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"source_watermark" timestamp with time zone,
	"next_watermark" timestamp with time zone,
	"counts" jsonb,
	"checksum" text,
	"initiated_by" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "patient_identity" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"email_normalized" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_magic_link" (
	"id" text PRIMARY KEY NOT NULL,
	"identity_id" text NOT NULL,
	"token_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"issued_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_session" (
	"id" text PRIMARY KEY NOT NULL,
	"identity_id" text NOT NULL,
	"token_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent_sha256" text
);
--> statement-breakpoint
CREATE TABLE "staff_patient_link" (
	"staff_id" text NOT NULL,
	"client_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_patient_link_staff_id_client_id_pk" PRIMARY KEY("staff_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "appointment" ALTER COLUMN "staff_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appointment" ALTER COLUMN "location_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "modality" text DEFAULT 'in-person' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "source_system" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "exclude_from_scheduling" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "source_system" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_home_location_id_clinic_location_id_fk" FOREIGN KEY ("home_location_id") REFERENCES "public"."clinic_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_identity" ADD CONSTRAINT "patient_identity_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_magic_link" ADD CONSTRAINT "patient_magic_link_identity_id_patient_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."patient_identity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_session" ADD CONSTRAINT "patient_session_identity_id_patient_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."patient_identity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_patient_link" ADD CONSTRAINT "staff_patient_link_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_mrn_idx" ON "client" USING btree ("mrn");--> statement-breakpoint
CREATE UNIQUE INDEX "client_source_idx" ON "client" USING btree ("source_system","source_id");--> statement-breakpoint
CREATE INDEX "client_name_idx" ON "client" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE INDEX "client_location_idx" ON "client" USING btree ("home_location_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_location_code_idx" ON "clinic_location" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_location_source_idx" ON "clinic_location" USING btree ("source_system","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_binding_source_idx" ON "import_binding" USING btree ("source_system","entity_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_binding_target_idx" ON "import_binding" USING btree ("entity_type","target_id");--> statement-breakpoint
CREATE INDEX "migration_run_source_idx" ON "migration_run" USING btree ("source_system","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_identity_email_client_idx" ON "patient_identity" USING btree ("email_normalized","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_identity_client_idx" ON "patient_identity" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_magic_link_token_idx" ON "patient_magic_link" USING btree ("token_sha256");--> statement-breakpoint
CREATE INDEX "patient_magic_link_identity_idx" ON "patient_magic_link" USING btree ("identity_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_session_token_idx" ON "patient_session" USING btree ("token_sha256");--> statement-breakpoint
CREATE INDEX "patient_session_identity_idx" ON "patient_session" USING btree ("identity_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_patient_link_client_idx" ON "staff_patient_link" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appt_source_idx" ON "appointment" USING btree ("source_system","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_source_idx" ON "staff" USING btree ("source_system","source_id");