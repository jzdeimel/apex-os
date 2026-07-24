CREATE TABLE "legacy_binary_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"source_system" text NOT NULL,
	"source_entity_type" text NOT NULL,
	"source_id" text NOT NULL,
	"client_id" text,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"content_sha256" text NOT NULL,
	"category" text,
	"source_created_by_id" text,
	"source_created_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_source_record" (
	"id" text PRIMARY KEY NOT NULL,
	"source_system" text NOT NULL,
	"source_entity_type" text NOT NULL,
	"source_id" text NOT NULL,
	"client_id" text,
	"occurred_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"payload_sha256" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_binary_asset_source_idx" ON "legacy_binary_asset" USING btree ("source_system","source_entity_type","source_id");--> statement-breakpoint
CREATE INDEX "legacy_binary_asset_client_idx" ON "legacy_binary_asset" USING btree ("client_id","source_created_at");--> statement-breakpoint
CREATE INDEX "legacy_binary_asset_checksum_idx" ON "legacy_binary_asset" USING btree ("content_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_source_record_source_idx" ON "legacy_source_record" USING btree ("source_system","source_entity_type","source_id");--> statement-breakpoint
CREATE INDEX "legacy_source_record_entity_idx" ON "legacy_source_record" USING btree ("source_entity_type","occurred_at");--> statement-breakpoint
CREATE INDEX "legacy_source_record_client_idx" ON "legacy_source_record" USING btree ("client_id","occurred_at");