CREATE TABLE "work_task" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"task_type" text NOT NULL,
	"detail" text,
	"client_id" text,
	"location_id" text,
	"assignee_staff_id" text NOT NULL,
	"created_by_staff_id" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_staff_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
ALTER TABLE "work_task" ADD CONSTRAINT "work_task_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_task" ADD CONSTRAINT "work_task_assignee_staff_id_staff_id_fk" FOREIGN KEY ("assignee_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_task" ADD CONSTRAINT "work_task_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_task" ADD CONSTRAINT "work_task_completed_by_staff_id_staff_id_fk" FOREIGN KEY ("completed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_task" ADD CONSTRAINT "work_task_ledger_id_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_task_assignee_idx" ON "work_task" USING btree ("assignee_staff_id","status","due_at");--> statement-breakpoint
CREATE INDEX "work_task_client_idx" ON "work_task" USING btree ("client_id","status","due_at");--> statement-breakpoint
CREATE INDEX "work_task_status_idx" ON "work_task" USING btree ("status","priority","due_at");