CREATE TABLE "membership_event" (
	"id" text PRIMARY KEY NOT NULL,
	"membership_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"actor_id" text NOT NULL,
	"ledger_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership_event" ADD CONSTRAINT "membership_event_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_event_membership_idx" ON "membership_event" USING btree ("membership_id","effective_at");
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_status_valid" CHECK ("status" IN ('active','paused','past_due','cancelled'));
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_rate_valid" CHECK ("monthly_rate_cents" >= 0);
--> statement-breakpoint
ALTER TABLE "membership_event" ADD CONSTRAINT "membership_event_status_valid" CHECK (
  ("from_status" IS NULL OR "from_status" IN ('active','paused','past_due','cancelled'))
  AND "to_status" IN ('active','paused','past_due','cancelled')
  AND "from_status" IS DISTINCT FROM "to_status"
  AND length(btrim("reason")) >= 3
);
--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_money_valid" CHECK (
  "subtotal_cents" >= 0 AND "discount_cents" >= 0 AND "discount_cents" <= "subtotal_cents"
  AND "tax_cents" >= 0 AND "total_cents" = "subtotal_cents" - "discount_cents" + "tax_cents"
  AND "paid_cents" >= 0 AND "paid_cents" <= "total_cents"
  AND ("discount_cents" = 0 OR length(btrim(coalesce("discount_reason", ''))) >= 3)
  AND "status" IN ('open','partially_paid','paid','void','uncollectible','refunded')
);
--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_money_valid" CHECK (
  "quantity" > 0 AND "unit_price_cents" >= 0 AND "total_cents" = "quantity" * "unit_price_cents"
  AND length(btrim("description")) > 0
  AND "hsa_eligibility" IN ('eligible','ineligible','unknown')
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_block_membership_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'membership lifecycle events are immutable; append a new event';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "membership_event_no_update" BEFORE UPDATE OR DELETE ON "membership_event"
FOR EACH ROW EXECUTE FUNCTION apex_block_membership_event_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_block_invoice_line_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'issued invoice lines are immutable; void and reissue the invoice';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "invoice_line_no_update" BEFORE UPDATE OR DELETE ON "invoice_line"
FOR EACH ROW EXECUTE FUNCTION apex_block_invoice_line_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_protect_issued_invoice_facts() RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."client_id" IS DISTINCT FROM OLD."client_id"
    OR NEW."membership_id" IS DISTINCT FROM OLD."membership_id"
    OR NEW."number" IS DISTINCT FROM OLD."number"
    OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at"
    OR NEW."due_at" IS DISTINCT FROM OLD."due_at"
    OR NEW."subtotal_cents" IS DISTINCT FROM OLD."subtotal_cents"
    OR NEW."discount_cents" IS DISTINCT FROM OLD."discount_cents"
    OR NEW."discount_reason" IS DISTINCT FROM OLD."discount_reason"
    OR NEW."tax_cents" IS DISTINCT FROM OLD."tax_cents"
    OR NEW."total_cents" IS DISTINCT FROM OLD."total_cents"
    OR NEW."hsa_eligible_cents" IS DISTINCT FROM OLD."hsa_eligible_cents"
    OR NEW."location_id" IS DISTINCT FROM OLD."location_id" THEN
    RAISE EXCEPTION 'issued invoice facts are immutable; void and reissue the invoice';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "invoice_protect_facts" BEFORE UPDATE ON "invoice"
FOR EACH ROW EXECUTE FUNCTION apex_protect_issued_invoice_facts();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apex_block_invoice_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'issued invoices cannot be deleted';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "invoice_no_delete" BEFORE DELETE ON "invoice"
FOR EACH ROW EXECUTE FUNCTION apex_block_invoice_delete();
