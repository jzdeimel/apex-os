CREATE TABLE "emergency_card" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"token_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"issued_by" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_card_token_idx" ON "emergency_card" USING btree ("token_sha256");--> statement-breakpoint
CREATE INDEX "emergency_card_client_idx" ON "emergency_card" USING btree ("client_id");