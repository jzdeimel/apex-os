CREATE TABLE "fulfillment_order" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"coach_id" text NOT NULL,
	"location_id" text NOT NULL,
	"status" text NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"shipping_mode" text NOT NULL,
	"ship_to" jsonb,
	"fulfillment_partner" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"visible_to_client" boolean DEFAULT false NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"credit_applied_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"discount_reason" text,
	"total_cents" integer NOT NULL,
	"tracking" text,
	"carrier" text,
	"est_delivery" text,
	"last_activity" timestamp with time zone NOT NULL,
	"delayed" boolean DEFAULT false NOT NULL,
	"delay_reason" text,
	"medsource_ref" text,
	"origin" text DEFAULT 'coach' NOT NULL,
	"created_by" text NOT NULL,
	"ledger_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfillment_order_event" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"applied" boolean DEFAULT true NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"source" text NOT NULL,
	"note" text,
	"rejection_reason" text,
	"external_event_id" text,
	"ledger_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfillment_order_line" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"is_addon" boolean DEFAULT false NOT NULL,
	"inventory_lot_id" text,
	"lot_ref" text
);
--> statement-breakpoint
CREATE TABLE "fulfillment_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_error" text,
	"ledger_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fulfillment_order" ADD CONSTRAINT "fulfillment_order_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_order" ADD CONSTRAINT "fulfillment_order_location_id_clinic_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."clinic_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_order_event" ADD CONSTRAINT "fulfillment_order_event_order_id_fulfillment_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."fulfillment_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_order_line" ADD CONSTRAINT "fulfillment_order_line_order_id_fulfillment_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."fulfillment_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_order_line" ADD CONSTRAINT "fulfillment_order_line_inventory_lot_id_inventory_lot_id_fk" FOREIGN KEY ("inventory_lot_id") REFERENCES "public"."inventory_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_outbox" ADD CONSTRAINT "fulfillment_outbox_order_id_fulfillment_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."fulfillment_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fulfillment_order_client_idx" ON "fulfillment_order" USING btree ("client_id","placed_at");--> statement-breakpoint
CREATE INDEX "fulfillment_order_location_status_idx" ON "fulfillment_order" USING btree ("location_id","status","last_activity");--> statement-breakpoint
CREATE INDEX "fulfillment_order_coach_idx" ON "fulfillment_order" USING btree ("coach_id","last_activity");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_order_idempotency_idx" ON "fulfillment_order" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "fulfillment_order_event_order_idx" ON "fulfillment_order_event" USING btree ("order_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_order_event_external_idx" ON "fulfillment_order_event" USING btree ("source","external_event_id");--> statement-breakpoint
CREATE INDEX "fulfillment_order_line_order_idx" ON "fulfillment_order_line" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "fulfillment_order_line_sku_idx" ON "fulfillment_order_line" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "fulfillment_order_line_lot_idx" ON "fulfillment_order_line" USING btree ("inventory_lot_id");--> statement-breakpoint
CREATE INDEX "fulfillment_outbox_pending_idx" ON "fulfillment_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_outbox_order_kind_idx" ON "fulfillment_outbox" USING btree ("order_id","kind");
--> statement-breakpoint
ALTER TABLE "fulfillment_order" ADD CONSTRAINT "fulfillment_order_facts_valid" CHECK (
  "status" IN ('Draft','Submitted','Accepted','Insufficient stock','Picking','QC hold','Packed','Label created','In transit','Out for delivery','Delivered','Cancelled','Failed')
  AND "shipping_mode" IN ('ship','pickup')
  AND (("shipping_mode" = 'ship' AND "ship_to" IS NOT NULL) OR ("shipping_mode" = 'pickup' AND "ship_to" IS NULL))
  AND "fulfillment_partner" IN ('MedSource','In-clinic')
  AND "origin" IN ('coach','refill')
  AND length(btrim("idempotency_key")) >= 8
  AND "subtotal_cents" >= 0
  AND "credit_applied_cents" >= 0 AND "credit_applied_cents" <= "subtotal_cents"
  AND "discount_cents" >= 0 AND "discount_cents" <= "subtotal_cents" - "credit_applied_cents"
  AND "total_cents" = "subtotal_cents" - "credit_applied_cents" - "discount_cents"
  AND ("discount_cents" = 0 OR length(btrim(coalesce("discount_reason", ''))) >= 3)
  AND ("carrier" IS NULL OR "carrier" IN ('UPS','FedEx','USPS','Courier'))
  AND ("fulfillment_partner" = 'In-clinic' OR "status" NOT IN ('Label created','In transit','Out for delivery','Delivered') OR (length(btrim(coalesce("tracking", ''))) >= 4 AND "carrier" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "fulfillment_order_line" ADD CONSTRAINT "fulfillment_order_line_facts_valid" CHECK (
  length(btrim("sku")) > 0 AND length(btrim("name")) > 0 AND "quantity" > 0 AND "unit_price_cents" >= 0
);
--> statement-breakpoint
ALTER TABLE "fulfillment_order_event" ADD CONSTRAINT "fulfillment_order_event_facts_valid" CHECK (
  ("from_status" IS NULL OR "from_status" IN ('Draft','Submitted','Accepted','Insufficient stock','Picking','QC hold','Packed','Label created','In transit','Out for delivery','Delivered','Cancelled','Failed'))
  AND "to_status" IN ('Draft','Submitted','Accepted','Insufficient stock','Picking','QC hold','Packed','Label created','In transit','Out for delivery','Delivered','Cancelled','Failed')
  AND "source" IN ('apex','medsource','carrier')
  AND length(btrim("actor_id")) > 0 AND length(btrim("actor_name")) > 0 AND length(btrim("actor_role")) > 0
  AND (("applied" = true AND "rejection_reason" IS NULL) OR ("applied" = false AND length(btrim(coalesce("rejection_reason", ''))) >= 3))
);
--> statement-breakpoint
ALTER TABLE "fulfillment_outbox" ADD CONSTRAINT "fulfillment_outbox_facts_valid" CHECK (
  "kind" IN ('submit-order','cancel-order','notify-client','request-restock')
  AND "status" IN ('pending','delivered','dead-letter')
  AND "attempts" >= 0
  AND (("status" = 'delivered' AND "delivered_at" IS NOT NULL) OR ("status" <> 'delivered' AND "delivered_at" IS NULL))
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_block_order_append_only_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'order lines and status events are immutable; append a new event';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "fulfillment_order_line_no_mutation" BEFORE UPDATE OR DELETE ON "fulfillment_order_line"
FOR EACH ROW EXECUTE FUNCTION apex_block_order_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER "fulfillment_order_event_no_mutation" BEFORE UPDATE OR DELETE ON "fulfillment_order_event"
FOR EACH ROW EXECUTE FUNCTION apex_block_order_append_only_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_order_status_rank(value text) RETURNS integer AS $$
BEGIN
  RETURN CASE value
    WHEN 'Draft' THEN 0 WHEN 'Submitted' THEN 10 WHEN 'Accepted' THEN 20
    WHEN 'Insufficient stock' THEN 25 WHEN 'Picking' THEN 30 WHEN 'QC hold' THEN 35
    WHEN 'Packed' THEN 40 WHEN 'Label created' THEN 50 WHEN 'In transit' THEN 60
    WHEN 'Out for delivery' THEN 70 WHEN 'Delivered' THEN 80
    WHEN 'Cancelled' THEN 900 WHEN 'Failed' THEN 910 ELSE -1 END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_protect_fulfillment_order() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'patient orders cannot be deleted';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."client_id" IS DISTINCT FROM OLD."client_id"
    OR NEW."coach_id" IS DISTINCT FROM OLD."coach_id"
    OR NEW."location_id" IS DISTINCT FROM OLD."location_id"
    OR NEW."placed_at" IS DISTINCT FROM OLD."placed_at"
    OR NEW."shipping_mode" IS DISTINCT FROM OLD."shipping_mode"
    OR NEW."ship_to" IS DISTINCT FROM OLD."ship_to"
    OR NEW."fulfillment_partner" IS DISTINCT FROM OLD."fulfillment_partner"
    OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
    OR NEW."subtotal_cents" IS DISTINCT FROM OLD."subtotal_cents"
    OR NEW."credit_applied_cents" IS DISTINCT FROM OLD."credit_applied_cents"
    OR NEW."discount_cents" IS DISTINCT FROM OLD."discount_cents"
    OR NEW."discount_reason" IS DISTINCT FROM OLD."discount_reason"
    OR NEW."total_cents" IS DISTINCT FROM OLD."total_cents"
    OR NEW."origin" IS DISTINCT FROM OLD."origin"
    OR NEW."created_by" IS DISTINCT FROM OLD."created_by"
    OR NEW."ledger_id" IS DISTINCT FROM OLD."ledger_id" THEN
    RAISE EXCEPTION 'issued order commercial and identity facts are immutable';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" IN ('Delivered','Cancelled','Failed') OR apex_order_status_rank(NEW."status") <= apex_order_status_rank(OLD."status") THEN
      RAISE EXCEPTION 'orders may only move forward and terminal orders cannot reopen';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM fulfillment_order_event e
      WHERE e."order_id" = OLD."id" AND e."from_status" = OLD."status"
        AND e."to_status" = NEW."status" AND e."applied" = true
    ) THEN
      RAISE EXCEPTION 'order status projection requires an applied immutable event';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "fulfillment_order_protect" BEFORE UPDATE OR DELETE ON "fulfillment_order"
FOR EACH ROW EXECUTE FUNCTION apex_protect_fulfillment_order();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_protect_fulfillment_outbox() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fulfillment outbox obligations cannot be deleted';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."order_id" IS DISTINCT FROM OLD."order_id"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."payload" IS DISTINCT FROM OLD."payload"
    OR NEW."ledger_id" IS DISTINCT FROM OLD."ledger_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'fulfillment outbox identity and payload are immutable';
  END IF;
  IF NEW."attempts" < OLD."attempts" THEN
    RAISE EXCEPTION 'fulfillment delivery attempts cannot decrease';
  END IF;
  IF OLD."status" IN ('delivered','dead-letter') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'terminal fulfillment outbox state cannot reopen';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "fulfillment_outbox_protect" BEFORE UPDATE OR DELETE ON "fulfillment_outbox"
FOR EACH ROW EXECUTE FUNCTION apex_protect_fulfillment_outbox();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_require_complete_order() RETURNS trigger AS $$
DECLARE
  line_subtotal integer;
  line_count integer;
BEGIN
  SELECT coalesce(sum("quantity" * "unit_price_cents"), 0), count(*) INTO line_subtotal, line_count
  FROM fulfillment_order_line WHERE "order_id" = NEW."id";
  IF line_count = 0 THEN
    RAISE EXCEPTION 'order requires immutable line facts';
  END IF;
  IF line_subtotal <> NEW."subtotal_cents" THEN
    RAISE EXCEPTION 'order subtotal does not equal immutable lines';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM fulfillment_order_event e
    WHERE e."order_id" = NEW."id" AND e."to_status" = 'Draft' AND e."applied" = true
  ) OR NOT EXISTS (
    SELECT 1 FROM fulfillment_order_event e
    WHERE e."order_id" = NEW."id" AND e."to_status" = NEW."status" AND e."applied" = true
  ) THEN
    RAISE EXCEPTION 'order requires initial and current immutable status events';
  END IF;
  IF NEW."fulfillment_partner" = 'MedSource' AND NOT EXISTS (
    SELECT 1 FROM fulfillment_outbox o
    WHERE o."order_id" = NEW."id" AND o."kind" = 'submit-order'
  ) THEN
    RAISE EXCEPTION 'MedSource order requires a durable submit obligation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "fulfillment_order_complete"
AFTER INSERT ON "fulfillment_order" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION apex_require_complete_order();
