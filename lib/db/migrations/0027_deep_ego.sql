CREATE TABLE "sale" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"kind" text NOT NULL,
	"external_ref" text NOT NULL,
	"order_number" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"location_id" text,
	"source_location_label" text,
	"coach_id" text,
	"total_cents" integer NOT NULL,
	"source_item_count" integer NOT NULL,
	"actual_item_count" integer NOT NULL,
	"legacy" boolean DEFAULT true NOT NULL,
	"source_system" text NOT NULL,
	"source_id" text NOT NULL,
	"source_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_line" (
	"id" text PRIMARY KEY NOT NULL,
	"sale_id" text NOT NULL,
	"line_index" integer NOT NULL,
	"sku" text,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"returned" boolean DEFAULT false NOT NULL,
	"source_system" text NOT NULL,
	"source_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_location_id_clinic_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."clinic_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sale_client_idx" ON "sale" USING btree ("client_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_source_idx" ON "sale" USING btree ("source_system","source_id");--> statement-breakpoint
CREATE INDEX "sale_external_idx" ON "sale" USING btree ("external_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_line_index_idx" ON "sale_line" USING btree ("sale_id","line_index");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_line_source_idx" ON "sale_line" USING btree ("source_system","source_id");--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_shape_check" CHECK (
  "kind" IN ('sale', 'return', 'zero-value')
  AND "source_item_count" >= 0 AND "actual_item_count" >= 0
  AND (("kind" = 'sale' AND "total_cents" > 0)
    OR ("kind" = 'return' AND "total_cents" < 0)
    OR ("kind" = 'zero-value' AND "total_cents" = 0))
);--> statement-breakpoint
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_shape_check" CHECK (
  "line_index" >= 0 AND length(trim("description")) > 0
);--> statement-breakpoint

CREATE OR REPLACE FUNCTION apex_historical_sale_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'posted historical commercial facts are immutable';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER sale_no_mutation BEFORE UPDATE OR DELETE ON sale
  FOR EACH ROW EXECUTE FUNCTION apex_historical_sale_immutable();--> statement-breakpoint
CREATE TRIGGER sale_line_no_mutation BEFORE UPDATE OR DELETE ON sale_line
  FOR EACH ROW EXECUTE FUNCTION apex_historical_sale_immutable();--> statement-breakpoint

CREATE OR REPLACE FUNCTION apex_sale_lines_reconcile() RETURNS trigger AS $$
DECLARE
  target_id text;
  expected_total integer;
  expected_count integer;
  actual_total bigint;
  actual_count integer;
BEGIN
  target_id := CASE WHEN TG_TABLE_NAME = 'sale' THEN NEW.id ELSE NEW.sale_id END;
  SELECT total_cents, actual_item_count INTO expected_total, expected_count
  FROM sale WHERE id = target_id;
  SELECT coalesce(sum(total_cents), 0), count(*)::int INTO actual_total, actual_count
  FROM sale_line WHERE sale_id = target_id;
  IF expected_total IS NULL OR expected_total <> actual_total OR expected_count <> actual_count THEN
    RAISE EXCEPTION 'historical sale % does not reconcile to its immutable lines', target_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sale_reconcile_after_sale
  AFTER INSERT ON sale DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION apex_sale_lines_reconcile();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sale_reconcile_after_line
  AFTER INSERT ON sale_line DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION apex_sale_lines_reconcile();
