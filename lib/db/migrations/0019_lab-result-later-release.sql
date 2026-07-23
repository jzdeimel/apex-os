CREATE TABLE "lab_result_release" (
	"id" text PRIMARY KEY NOT NULL,
	"lab_result_id" text NOT NULL,
	"released_by" text NOT NULL,
	"released_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"ledger_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lab_result_release" ADD CONSTRAINT "lab_result_release_lab_result_id_lab_result_id_fk" FOREIGN KEY ("lab_result_id") REFERENCES "public"."lab_result"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lab_result_release_result_idx" ON "lab_result_release" USING btree ("lab_result_id");
--> statement-breakpoint
DROP TRIGGER IF EXISTS lab_result_release_immutable ON lab_result_release;
--> statement-breakpoint
CREATE TRIGGER lab_result_release_immutable BEFORE UPDATE OR DELETE ON lab_result_release
  FOR EACH ROW EXECUTE FUNCTION apex_lab_record_immutable();
