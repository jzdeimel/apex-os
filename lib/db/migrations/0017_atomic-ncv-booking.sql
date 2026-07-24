ALTER TABLE "appointment" ADD COLUMN "booking_group_id" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "component" text;--> statement-breakpoint
ALTER TABLE "clinic_location" ADD COLUMN "lpn_lab_draw_approved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "appt_booking_group_idx" ON "appointment" USING btree ("booking_group_id","start_at");