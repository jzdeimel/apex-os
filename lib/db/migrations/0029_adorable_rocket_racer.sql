CREATE TABLE "historical_fulfillment_record" (
	"id" text PRIMARY KEY NOT NULL,
	"record_kind" text NOT NULL,
	"client_id" text NOT NULL,
	"sale_id" text,
	"order_number" text,
	"external_order_ref" text,
	"partner" text NOT NULL,
	"status" text NOT NULL,
	"source_channel" text,
	"location_id" text,
	"source_location_label" text,
	"coach_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"sku" text,
	"item_name" text,
	"quantity" integer,
	"items" jsonb,
	"pickup" boolean DEFAULT false NOT NULL,
	"shipping_type" text,
	"tracking" text,
	"carrier" text,
	"est_delivery" text,
	"delayed" boolean DEFAULT false NOT NULL,
	"delay_reason" text,
	"status_history" jsonb,
	"destination_snapshot" jsonb,
	"routing_snapshot" jsonb,
	"source_system" text NOT NULL,
	"source_entity_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "historical_fulfillment_record" ADD CONSTRAINT "historical_fulfillment_record_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_fulfillment_record" ADD CONSTRAINT "historical_fulfillment_record_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_fulfillment_record" ADD CONSTRAINT "historical_fulfillment_record_location_id_clinic_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."clinic_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historical_fulfillment_client_idx" ON "historical_fulfillment_record" USING btree ("client_id","occurred_at");--> statement-breakpoint
CREATE INDEX "historical_fulfillment_order_idx" ON "historical_fulfillment_record" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "historical_fulfillment_source_idx" ON "historical_fulfillment_record" USING btree ("source_system","source_entity_type","source_id");--> statement-breakpoint
ALTER TABLE "historical_fulfillment_record" ADD CONSTRAINT "historical_fulfillment_shape_check" CHECK (
  "source_system" = 'alpha-v1'
  AND "destination_snapshot" IS NOT NULL
  AND "routing_snapshot" IS NOT NULL
  AND (
    ("record_kind" = 'routed-line' AND "source_entity_type" = 'RoutedOrder'
      AND "item_name" IS NOT NULL AND "quantity" > 0 AND "items" IS NULL)
    OR
    ("record_kind" = 'shipment' AND "source_entity_type" = 'ShipmentNotification'
      AND jsonb_typeof("items") = 'array' AND "quantity" IS NULL)
  )
);--> statement-breakpoint

CREATE OR REPLACE FUNCTION apex_historical_fulfillment_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'imported historical fulfillment facts are immutable';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER historical_fulfillment_no_mutation
  BEFORE UPDATE OR DELETE ON historical_fulfillment_record
  FOR EACH ROW EXECUTE FUNCTION apex_historical_fulfillment_immutable();
--> statement-breakpoint

-- PostgreSQL records expose only the fields of their triggering table. The
-- original CASE expression referenced NEW.sale_id even for the parent `sale`
-- trigger, which fails at commit before the immutable ledger can reconcile.
CREATE OR REPLACE FUNCTION apex_sale_lines_reconcile() RETURNS trigger AS $$
DECLARE
  target_id text;
  expected_total integer;
  expected_count integer;
  actual_total bigint;
  actual_count integer;
BEGIN
  IF TG_TABLE_NAME = 'sale' THEN
    target_id := NEW.id;
  ELSE
    target_id := NEW.sale_id;
  END IF;
  SELECT total_cents, actual_item_count INTO expected_total, expected_count
  FROM sale WHERE id = target_id;
  SELECT coalesce(sum(total_cents), 0), count(*)::int INTO actual_total, actual_count
  FROM sale_line WHERE sale_id = target_id;
  IF expected_total IS NULL OR expected_total <> actual_total OR expected_count <> actual_count THEN
    RAISE EXCEPTION 'historical sale % does not reconcile to its immutable lines', target_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
