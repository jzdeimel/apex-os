CREATE TABLE "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"entra_object_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"location_ids" jsonb NOT NULL,
	"credentials" text,
	"can_approve" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "staff_email_idx" ON "staff" USING btree ("email");--> statement-breakpoint
CREATE INDEX "staff_oid_idx" ON "staff" USING btree ("entra_object_id");