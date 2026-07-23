CREATE TABLE "inventory_lot" (
	"id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"lot_number" text NOT NULL,
	"location_id" text NOT NULL,
	"unit_label" text NOT NULL,
	"expiry_on" text,
	"unit_cost_cents" integer,
	"vendor_ref" text,
	"requires_prescription" boolean DEFAULT false NOT NULL,
	"controlled_schedule" text,
	"status" text DEFAULT 'active' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"ledger_id" text
);
--> statement-breakpoint
CREATE TABLE "inventory_recall" (
	"id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"lot_number" text NOT NULL,
	"notice_ref" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"initiated_at" timestamp with time zone NOT NULL,
	"initiated_by" text NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"close_reason" text,
	"ledger_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dispense" ADD COLUMN "inventory_lot_id" text;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD COLUMN "inventory_lot_id" text;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "inventory_lot" ADD CONSTRAINT "inventory_lot_location_id_clinic_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."clinic_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_lot_identity_idx" ON "inventory_lot" USING btree ("location_id","sku","lot_number");--> statement-breakpoint
CREATE INDEX "inventory_lot_expiry_idx" ON "inventory_lot" USING btree ("status","expiry_on");--> statement-breakpoint
CREATE INDEX "inventory_lot_recall_idx" ON "inventory_lot" USING btree ("sku","lot_number");--> statement-breakpoint
CREATE INDEX "inventory_recall_lot_idx" ON "inventory_recall" USING btree ("sku","lot_number","status");--> statement-breakpoint
ALTER TABLE "dispense" ADD CONSTRAINT "dispense_inventory_lot_id_inventory_lot_id_fk" FOREIGN KEY ("inventory_lot_id") REFERENCES "public"."inventory_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_inventory_lot_id_inventory_lot_id_fk" FOREIGN KEY ("inventory_lot_id") REFERENCES "public"."inventory_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inv_lot_movement_idx" ON "inventory_movement" USING btree ("inventory_lot_id","at");--> statement-breakpoint
CREATE INDEX "inv_correlation_idx" ON "inventory_movement" USING btree ("correlation_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_recall_one_open_lot_idx" ON "inventory_recall" ("sku", "lot_number") WHERE "status" = 'open';
--> statement-breakpoint
ALTER TABLE "inventory_lot" ADD CONSTRAINT "inventory_lot_facts_valid" CHECK (
  length(btrim("sku")) > 0
  AND length(btrim("lot_number")) > 0
  AND length(btrim("unit_label")) > 0
  AND ("expiry_on" IS NULL OR "expiry_on" = ("expiry_on"::date)::text)
  AND ("unit_cost_cents" IS NULL OR "unit_cost_cents" >= 0)
  AND "status" IN ('active','quarantined','recalled','depleted')
  AND ("controlled_schedule" IS NULL OR "controlled_schedule" IN ('II','III','IV','V'))
  AND ("controlled_schedule" IS NULL OR "requires_prescription" = true)
);
--> statement-breakpoint
ALTER TABLE "inventory_recall" ADD CONSTRAINT "inventory_recall_facts_valid" CHECK (
  length(btrim("sku")) > 0
  AND length(btrim("lot_number")) > 0
  AND length(btrim("notice_ref")) >= 3
  AND length(btrim("reason")) >= 3
  AND "status" IN ('open','closed')
  AND (
    ("status" = 'open' AND "closed_at" IS NULL AND "closed_by" IS NULL AND "close_reason" IS NULL)
    OR
    ("status" = 'closed' AND "closed_at" IS NOT NULL AND length(btrim(coalesce("closed_by", ''))) > 0 AND length(btrim(coalesce("close_reason", ''))) >= 3)
  )
);
--> statement-breakpoint
ALTER TABLE "dispense" ADD CONSTRAINT "dispense_facts_valid" CHECK (
  "quantity" > 0 AND "method" IN ('shipped','picked-up','administered-in-clinic')
);
--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "authoritative_inventory_movement_valid" CHECK (
  "inventory_lot_id" IS NULL OR (
    "kind" IN ('receive','dispense','waste','transfer-in','transfer-out','count-adjust')
    AND (
      ("kind" IN ('receive','transfer-in') AND "quantity_delta" > 0)
      OR ("kind" IN ('dispense','waste','transfer-out') AND "quantity_delta" < 0)
      OR "kind" = 'count-adjust'
    )
  )
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_validate_inventory_movement() RETURNS trigger AS $$
DECLARE
  lot_row inventory_lot%ROWTYPE;
  balance integer;
BEGIN
  IF NEW."inventory_lot_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO lot_row FROM inventory_lot WHERE id = NEW."inventory_lot_id" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory movement requires a valid lot';
  END IF;
  IF NEW."sku" IS DISTINCT FROM lot_row."sku"
    OR NEW."lot_number" IS DISTINCT FROM lot_row."lot_number"
    OR NEW."location_id" IS DISTINCT FROM lot_row."location_id"
    OR NEW."expiry_on" IS DISTINCT FROM lot_row."expiry_on" THEN
    RAISE EXCEPTION 'inventory movement facts do not match the referenced lot';
  END IF;
  IF NEW."kind" = 'dispense' AND NEW."dispense_id" IS NULL THEN
    RAISE EXCEPTION 'dispense movement requires a dispense record';
  END IF;
  IF NEW."kind" IN ('dispense','transfer-out') AND (
    lot_row."status" <> 'active'
    OR (lot_row."expiry_on" IS NOT NULL AND lot_row."expiry_on"::date < NEW."at"::date)
  ) THEN
    RAISE EXCEPTION 'expired or inactive inventory cannot leave stock';
  END IF;
  IF NEW."kind" IN ('receive','transfer-in') AND lot_row."status" NOT IN ('active','depleted') THEN
    RAISE EXCEPTION 'quarantined or recalled inventory cannot enter available stock';
  END IF;
  IF NEW."kind" = 'dispense' AND NOT EXISTS (
    SELECT 1 FROM dispense d
    WHERE d."id" = NEW."dispense_id"
      AND d."inventory_lot_id" = NEW."inventory_lot_id"
      AND d."quantity" = -NEW."quantity_delta"
      AND d."sku" = NEW."sku"
      AND d."lot_number" = NEW."lot_number"
      AND d."location_id" = NEW."location_id"
  ) THEN
    RAISE EXCEPTION 'dispense movement does not match its patient dispense record';
  END IF;

  SELECT coalesce(sum("quantity_delta"), 0) INTO balance
  FROM inventory_movement WHERE "inventory_lot_id" = NEW."inventory_lot_id";
  IF balance + NEW."quantity_delta" < 0 THEN
    RAISE EXCEPTION 'inventory movement would make lot stock negative';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_movement_validate" BEFORE INSERT ON "inventory_movement"
FOR EACH ROW EXECUTE FUNCTION apex_validate_inventory_movement();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_block_inventory_movement_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'inventory movements are immutable; append a correcting movement';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_movement_no_mutation" BEFORE UPDATE OR DELETE ON "inventory_movement"
FOR EACH ROW EXECUTE FUNCTION apex_block_inventory_movement_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_block_dispense_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'dispense facts are immutable; append a documented correction';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "dispense_no_mutation" BEFORE UPDATE OR DELETE ON "dispense"
FOR EACH ROW EXECUTE FUNCTION apex_block_dispense_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_require_dispense_movement() RETURNS trigger AS $$
BEGIN
  IF NEW."inventory_lot_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM inventory_movement m
    WHERE m."dispense_id" = NEW."id"
      AND m."inventory_lot_id" = NEW."inventory_lot_id"
      AND m."kind" = 'dispense'
      AND m."quantity_delta" = -NEW."quantity"
  ) THEN
    RAISE EXCEPTION 'authoritative dispense requires an atomic inventory movement';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "dispense_requires_movement"
AFTER INSERT ON "dispense" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION apex_require_dispense_movement();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_protect_inventory_lot() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'inventory lots cannot be deleted';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."sku" IS DISTINCT FROM OLD."sku"
    OR NEW."lot_number" IS DISTINCT FROM OLD."lot_number"
    OR NEW."location_id" IS DISTINCT FROM OLD."location_id"
    OR NEW."unit_label" IS DISTINCT FROM OLD."unit_label"
    OR NEW."expiry_on" IS DISTINCT FROM OLD."expiry_on"
    OR NEW."unit_cost_cents" IS DISTINCT FROM OLD."unit_cost_cents"
    OR NEW."vendor_ref" IS DISTINCT FROM OLD."vendor_ref"
    OR NEW."requires_prescription" IS DISTINCT FROM OLD."requires_prescription"
    OR NEW."controlled_schedule" IS DISTINCT FROM OLD."controlled_schedule"
    OR NEW."received_at" IS DISTINCT FROM OLD."received_at"
    OR NEW."created_by" IS DISTINCT FROM OLD."created_by" THEN
    RAISE EXCEPTION 'inventory lot identity and safety facts are immutable';
  END IF;
  IF OLD."status" = 'recalled' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'recalled inventory cannot be reactivated';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_lot_protect" BEFORE UPDATE OR DELETE ON "inventory_lot"
FOR EACH ROW EXECUTE FUNCTION apex_protect_inventory_lot();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_protect_inventory_recall() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'inventory recalls cannot be deleted';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."sku" IS DISTINCT FROM OLD."sku"
    OR NEW."lot_number" IS DISTINCT FROM OLD."lot_number"
    OR NEW."notice_ref" IS DISTINCT FROM OLD."notice_ref"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."initiated_at" IS DISTINCT FROM OLD."initiated_at"
    OR NEW."initiated_by" IS DISTINCT FROM OLD."initiated_by"
    OR NEW."ledger_id" IS DISTINCT FROM OLD."ledger_id" THEN
    RAISE EXCEPTION 'recall notice facts are immutable';
  END IF;
  IF NOT (OLD."status" = 'open' AND NEW."status" = 'closed'
    AND NEW."closed_at" IS NOT NULL
    AND length(btrim(coalesce(NEW."closed_by", ''))) > 0
    AND length(btrim(coalesce(NEW."close_reason", ''))) >= 3) THEN
    RAISE EXCEPTION 'a recall may only transition once from open to closed with closure evidence';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "inventory_recall_protect" BEFORE UPDATE OR DELETE ON "inventory_recall"
FOR EACH ROW EXECUTE FUNCTION apex_protect_inventory_recall();
