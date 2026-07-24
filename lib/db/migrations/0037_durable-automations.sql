CREATE TABLE "automation_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"trigger_type" text NOT NULL,
	"config" jsonb NOT NULL,
	"action_type" text DEFAULT 'create-task' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"cadence_minutes" integer DEFAULT 15 NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"owner_staff_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by_staff_id" text NOT NULL,
	"ledger_id" text,
	CONSTRAINT "automation_rule_trigger_check" CHECK ("trigger_type" IN ('unread-coach-message','critical-lab-review','inactive-patient-review')),
	CONSTRAINT "automation_rule_action_check" CHECK ("action_type" = 'create-task'),
	CONSTRAINT "automation_rule_cadence_check" CHECK ("cadence_minutes" BETWEEN 5 AND 1440)
);
--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_owner_staff_id_staff_id_fk" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_updated_by_staff_id_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_ledger_id_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledger"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "automation_rule_due_idx" ON "automation_rule" USING btree ("enabled","next_run_at");
--> statement-breakpoint
CREATE TABLE "automation_run" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"evaluated_count" integer DEFAULT 0 NOT NULL,
	"action_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"ledger_id" text,
	CONSTRAINT "automation_run_trigger_check" CHECK ("trigger" IN ('scheduled','manual')),
	CONSTRAINT "automation_run_status_check" CHECK ("status" IN ('running','succeeded','failed'))
);
--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_rule_id_automation_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rule"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_ledger_id_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledger"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "automation_run_rule_idx" ON "automation_run" USING btree ("rule_id","started_at");
--> statement-breakpoint
CREATE INDEX "automation_run_worker_idx" ON "automation_run" USING btree ("worker_id","started_at");
--> statement-breakpoint
CREATE TABLE "automation_action" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"dedup_key" text NOT NULL,
	"client_id" text,
	"task_id" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_action" ADD CONSTRAINT "automation_action_run_id_automation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_run"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_action" ADD CONSTRAINT "automation_action_rule_id_automation_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rule"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_action" ADD CONSTRAINT "automation_action_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_action" ADD CONSTRAINT "automation_action_task_id_work_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_task"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "automation_action_dedup_idx" ON "automation_action" USING btree ("dedup_key");
--> statement-breakpoint
CREATE INDEX "automation_action_run_idx" ON "automation_action" USING btree ("run_id");
--> statement-breakpoint
CREATE TABLE "automation_worker" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"version" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"last_completed_at" timestamp with time zone,
	"last_run_id" text,
	"last_error_code" text
);
