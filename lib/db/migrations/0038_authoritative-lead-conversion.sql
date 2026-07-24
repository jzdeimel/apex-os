ALTER TABLE "intake_submission" ADD COLUMN "client_id" text;
--> statement-breakpoint
ALTER TABLE "intake_submission" ADD CONSTRAINT "intake_submission_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "intake_submission_client_idx" ON "intake_submission" USING btree ("client_id","submitted_at");
