ALTER TABLE "staff" ADD COLUMN "access_profile" text DEFAULT 'unassigned' NOT NULL;
--> statement-breakpoint
UPDATE "staff"
SET "access_profile" = CASE
  WHEN "id" = 'st-owner' THEN 'owner'
  WHEN "id" IN ('st-009', 'st-012') THEN 'front-desk'
  WHEN "id" = 'st-010' THEN 'operations'
  WHEN "role" = 'Coach' THEN 'coach'
  WHEN "role" = 'Medical' AND upper(coalesce("credentials", '')) IN ('MD', 'DO', 'NP', 'PA', 'PA-C') THEN 'provider'
  WHEN "role" = 'Medical' AND upper(coalesce("credentials", '')) IN ('RN', 'LPN') THEN 'nursing'
  WHEN "role" = 'Admin' AND upper(coalesce("title", '')) ~ '(OFFICE MANAGER|FRONT DESK|PATIENT EXPERIENCE|RECEPTION)' THEN 'front-desk'
  WHEN "role" = 'Admin' AND upper(coalesce("title", '')) ~ '(FULFILL|ORDER|SUPPLY|WAREHOUSE)' THEN 'fulfillment'
  WHEN "role" = 'Admin' AND upper(coalesce("title", '')) ~ '(BILL|FINANCE|CFO|ACCOUNT)' THEN 'billing'
  WHEN "role" = 'Admin' AND upper(coalesce("title", '')) ~ '(MARKETING|GROWTH|CAMPAIGN)' THEN 'marketing'
  WHEN "role" = 'Admin' AND upper(coalesce("title", '')) ~ '(OWNER|CEO|COO|EXECUTIVE)' THEN 'executive'
  WHEN "role" = 'Admin' AND upper(coalesce("title", '')) ~ '(OPERATIONS|PRODUCT MANAGER)' THEN 'operations'
  ELSE 'unassigned'
END
WHERE "access_profile" = 'unassigned';
