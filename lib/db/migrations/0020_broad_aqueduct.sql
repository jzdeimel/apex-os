CREATE TABLE "clinic_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"label" text NOT NULL,
	"resource_type" text DEFAULT 'room' NOT NULL,
	"kind" text NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_reservation" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"appointment_id" text,
	"encounter_id" text,
	"status" text DEFAULT 'reserved' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"reserved_by" text NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_in_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"release_reason" text,
	"ledger_id" text
);
--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "resource_id" text;--> statement-breakpoint
ALTER TABLE "clinic_resource" ADD CONSTRAINT "clinic_resource_location_id_clinic_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."clinic_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_reservation" ADD CONSTRAINT "resource_reservation_resource_id_clinic_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."clinic_resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_reservation" ADD CONSTRAINT "resource_reservation_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_resource_location_label_idx" ON "clinic_resource" USING btree ("location_id","label");--> statement-breakpoint
CREATE INDEX "clinic_resource_availability_idx" ON "clinic_resource" USING btree ("location_id","status","kind");--> statement-breakpoint
CREATE INDEX "resource_reservation_window_idx" ON "resource_reservation" USING btree ("resource_id","start_at","end_at");--> statement-breakpoint
CREATE INDEX "resource_reservation_appointment_idx" ON "resource_reservation" USING btree ("appointment_id","status");--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_resource_id_clinic_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."clinic_resource"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clinic_resource" ADD CONSTRAINT "clinic_resource_type_check" CHECK ("resource_type" IN ('room', 'equipment'));
--> statement-breakpoint
ALTER TABLE "clinic_resource" ADD CONSTRAINT "clinic_resource_kind_check" CHECK ("kind" IN ('exam', 'consult', 'draw', 'infusion', 'scan', 'general'));
--> statement-breakpoint
ALTER TABLE "clinic_resource" ADD CONSTRAINT "clinic_resource_status_check" CHECK ("status" IN ('active', 'out-of-service', 'retired'));
--> statement-breakpoint
ALTER TABLE "clinic_resource" ADD CONSTRAINT "clinic_resource_capacity_check" CHECK ("capacity" BETWEEN 1 AND 100);
--> statement-breakpoint
ALTER TABLE "resource_reservation" ADD CONSTRAINT "resource_reservation_status_check" CHECK ("status" IN ('reserved', 'in-use', 'released', 'cancelled'));
--> statement-breakpoint
ALTER TABLE "resource_reservation" ADD CONSTRAINT "resource_reservation_interval_check" CHECK ("end_at" > "start_at");
--> statement-breakpoint
ALTER TABLE "resource_reservation" ADD CONSTRAINT "resource_reservation_subject_check" CHECK ("appointment_id" IS NOT NULL OR "encounter_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "resource_reservation" ADD CONSTRAINT "resource_reservation_encounter_id_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounter"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "resource_reservation" ADD CONSTRAINT "resource_reservation_no_overlap" EXCLUDE USING gist (
	"resource_id" WITH =,
	tstzrange("start_at", "end_at", '[)') WITH &&
) WHERE ("status" IN ('reserved', 'in-use'));
