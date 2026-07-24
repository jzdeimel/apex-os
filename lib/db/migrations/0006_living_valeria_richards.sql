CREATE TABLE "feature_flag" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"target_id" text DEFAULT '*' NOT NULL,
	"enabled" boolean NOT NULL,
	"reason" text,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flag_scope_idx" ON "feature_flag" USING btree ("key","scope","target_id");--> statement-breakpoint
CREATE INDEX "feature_flag_key_idx" ON "feature_flag" USING btree ("key");