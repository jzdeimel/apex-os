import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const goLive = process.argv.includes("--go-live");

const staticEvidence = [
  "infra/main.bicep",
  "infra/app.bicep",
  ".github/workflows/deploy-nonprod-app.yml",
  "lib/db/migrations/0010_cutover-identity-foundation.sql",
  "lib/db/migrations/0011_immutable-signed-document-archive.sql",
  "lib/db/migrations/0014_staff-calendar-capacity.sql",
  "scripts/migrate-v1.ts",
  "scripts/spec-checks.ts",
  "scripts/contrast-sweep.mjs",
  "docs/CUTOVER_RUNBOOK.md",
];

const requiredApprovals = {
  CUTOVER_STAFF_HOURS_APPROVED: "effective staff hours loaded",
  CUTOVER_CREDENTIALS_APPROVED: "licenses, state scope, expiry, and supervision loaded",
  CUTOVER_NCV_POLICY_APPROVED: "continuity, female routing, telehealth NCV, and Raleigh DC decided",
  CUTOVER_CALENDAR_APPROVED: "calendar accounts and busy sync accepted",
  CUTOVER_CLOVER_APPROVED: "four merchants and payment acceptance tests passed",
  CUTOVER_CARD_VAULT_APPROVED: "vault migration or card recollection evidenced",
  CUTOVER_SMS_APPROVED: "ACS number, 10DLC, STOP/DNC, and delivery webhook passed",
  CUTOVER_EMAIL_APPROVED: "domain authentication, quota, warmup, and bounce handling passed",
  CUTOVER_EXPORTS_APPROVED: "MindBody/GHL exports and final delta rehearsed",
  CUTOVER_PORTAL_READS_APPROVED: "patient routes use the authenticated database client only",
  CUTOVER_HISTORY_APPROVED: "historical clinical and financial continuity is accepted",
  CUTOVER_PILOT_APPROVED: "named pilot cohort passed acceptance",
  CUTOVER_ROLLBACK_APPROVED: "write-freeze/replay rollback procedure was rehearsed",
  CUTOVER_QA_APPROVED: "final image digest passed owner QA",
};

const missingFiles = staticEvidence.filter((file) => !existsSync(resolve(root, file)));
const infraText = ["infra/main.bicep", "infra/app.bicep"]
  .filter((file) => existsSync(resolve(root, file)))
  .map((file) => readFileSync(resolve(root, file), "utf8"))
  .join("\n");
const unsafeInfraReferences = ["rg-alphaos-prod", "apex-prod"].filter((name) => infraText.includes(name));
const approvals = Object.entries(requiredApprovals).map(([key, label]) => ({
  key,
  label,
  approved: process.env[key] === "true",
}));
const missingApprovals = approvals.filter((item) => !item.approved);

const report = {
  verdict:
    missingFiles.length || unsafeInfraReferences.length || (goLive && missingApprovals.length)
      ? "NO-GO"
      : goLive
        ? "GO-EVIDENCE-PRESENT"
        : "STATIC-READY",
  mode: goLive ? "go-live" : "static",
  static: {
    evidenceFiles: staticEvidence.length,
    missingFiles,
    unsafeInfraReferences,
  },
  approvals: {
    required: approvals.length,
    present: approvals.length - missingApprovals.length,
    missing: missingApprovals.map(({ key, label }) => ({ key, label })),
  },
  note:
    "Environment approvals are evidence flags for a controlled change record, not substitutes for the underlying test artifacts.",
};

console.log(JSON.stringify(report, null, 2));
if (report.verdict === "NO-GO") process.exitCode = 2;
