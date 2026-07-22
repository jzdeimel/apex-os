import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const goLive = process.argv.includes("--go-live");

const staticEvidence = [
  "infra/main.bicep",
  "infra/app.bicep",
  "infra/migration-job.bicep",
  "scripts/deploy-nonprod-app.ps1",
  ".github/workflows/deploy-nonprod-app.yml",
  ".github/workflows/publish-nonprod-image.yml",
  ".github/workflows/deploy-nonprod-migration-job.yml",
  "lib/db/migrations/0010_cutover-identity-foundation.sql",
  "lib/db/migrations/0011_immutable-signed-document-archive.sql",
  "lib/db/migrations/0014_staff-calendar-capacity.sql",
  "scripts/migrate-v1.ts",
  "scripts/spec-checks.ts",
  "scripts/contrast-sweep.mjs",
  "app/patient/page.tsx",
  "lib/auth/patientRepo.ts",
  "app/intake/page.tsx",
  "components/intake/SecureIntakeEntry.tsx",
  "docs/CUTOVER_RUNBOOK.md",
  "docs/CUTOVER_REQUIREMENTS_MATRIX.md",
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
const infraText = ["infra/main.bicep", "infra/app.bicep", "infra/migration-job.bicep"]
  .filter((file) => existsSync(resolve(root, file)))
  .map((file) => readFileSync(resolve(root, file), "utf8"))
  .join("\n");
const unsafeInfraReferences = ["rg-alphaos-prod", "apex-prod"].filter((name) => infraText.includes(name));
const appTemplate = existsSync(resolve(root, "infra/app.bicep"))
  ? readFileSync(resolve(root, "infra/app.bicep"), "utf8")
  : "";
const migrationTemplate = existsSync(resolve(root, "infra/migration-job.bicep"))
  ? readFileSync(resolve(root, "infra/migration-job.bicep"), "utf8")
  : "";
const patientPage = existsSync(resolve(root, "app/patient/page.tsx"))
  ? readFileSync(resolve(root, "app/patient/page.tsx"), "utf8")
  : "";
const patientRepo = existsSync(resolve(root, "lib/auth/patientRepo.ts"))
  ? readFileSync(resolve(root, "lib/auth/patientRepo.ts"), "utf8")
  : "";
const pilotLinkRoute = existsSync(resolve(root, "app/api/patient-auth/pilot-link/route.ts"))
  ? readFileSync(resolve(root, "app/api/patient-auth/pilot-link/route.ts"), "utf8")
  : "";
const secureIntakeEntry = existsSync(resolve(root, "components/intake/SecureIntakeEntry.tsx"))
  ? readFileSync(resolve(root, "components/intake/SecureIntakeEntry.tsx"), "utf8")
  : "";
const staffLeadsRoute = existsSync(resolve(root, "app/api/leads/route.ts"))
  ? readFileSync(resolve(root, "app/api/leads/route.ts"), "utf8")
  : "";
const publicLeadsRoute = existsSync(resolve(root, "app/api/public/leads/route.ts"))
  ? readFileSync(resolve(root, "app/api/public/leads/route.ts"), "utf8")
  : "";
const deployAppScript = existsSync(resolve(root, "scripts/deploy-nonprod-app.ps1"))
  ? readFileSync(resolve(root, "scripts/deploy-nonprod-app.ps1"), "utf8")
  : "";
const deployMigrationScript = existsSync(resolve(root, "scripts/deploy-nonprod-migration-job.ps1"))
  ? readFileSync(resolve(root, "scripts/deploy-nonprod-migration-job.ps1"), "utf8")
  : "";
const demoModeDisabled = /name:\s*'APEX_DEMO_MODE'[\s\S]{0,300}?value:\s*'false'/.test(appTemplate);
const deploymentBoundaryFailures = [
  !appTemplate.includes("if (!empty(entraClientSecret))") &&
    "routine app deployments can still rewrite the EasyAuth client secret",
  appTemplate.includes("webAuthClientSecret.properties.secretUriWithVersion") &&
    "routine app deployments are coupled to a newly written EasyAuth secret version",
  !deployAppScript.includes("$parsedServicePrincipals") &&
    "Windows PowerShell may misread the existing Entra service principal as absent",
  !deployAppScript.includes("containerapp secret list") &&
    "routine deployments cannot verify the existing EasyAuth secret by metadata",
  !deployAppScript.includes("--enable-id-token-issuance true") &&
    "the Entra web registration does not enable the ID token required by EasyAuth login",
  !migrationTemplate.includes("value: 'false'") || !migrationTemplate.includes("triggerType: 'Manual'")
    ? "the migration job is not manual and hard-disabled by default"
    : false,
  migrationTemplate.includes("sourceDatabaseUrl.properties.secretUriWithVersion") &&
    "installing the dormant migration job still requires the V1 secret to exist",
  !migrationTemplate.includes("param sourceSecretAvailable bool = false") &&
    "the dormant migration job binds the V1 source before explicit approval",
  !migrationTemplate.includes("sourceSecretAvailable ?") &&
    "the V1 source secret is not conditionally bound",
  deployMigrationScript.includes("keyvault secret show") &&
    "routine migration-job deployment still reads Key Vault secret metadata",
].filter(Boolean);
const patientBoundaryFailures = [
  !appTemplate.includes("'/patient-sign-in'") && "patient sign-in is still intercepted by staff EasyAuth",
  !appTemplate.includes("'/api/patient-auth/exchange'") && "patient link exchange is still intercepted by staff EasyAuth",
  appTemplate.includes("'/api/patient-auth/pilot-link'") && "staff-only pilot link issuer was made public",
  appTemplate.includes("'/portal") && "seeded staff preview portal was made public",
  patientPage.includes("@/lib/mock/") && "database-only patient pilot imports seeded data",
  !patientPage.includes("patientPortalSummary(subject.clientId)") && "patient pilot is not scoped from the authenticated session",
  !patientRepo.includes("PATIENT_SESSION_IDLE_TTL_MS") && "patient sessions have no server-enforced idle timeout",
  !patientRepo.includes("gt(patientSession.lastSeenAt, idleCutoff)") && "idle-expired patient sessions can be refreshed",
  !pilotLinkRoute.includes("staffId") && "staff-as-patient pilot issuance cannot create an explicit identity link",
  !patientRepo.includes("tx.insert(staffPatientLink)") && "staff-as-patient identity mapping is not persisted",
  !appTemplate.includes("convention: 'FixedTime'") && "staff EasyAuth has no explicit absolute session cap",
  !appTemplate.includes("timeToExpiration: '08:00:00'") && "staff EasyAuth session cap is not eight hours",
  !demoModeDisabled && "the shared Azure deployment still enables or omits the fail-closed server demo-mode boundary",
].filter(Boolean);
const requiredPublicPaths = [
  "'/book'",
  "'/intake'",
  "'/api/public/leads'",
  "'/api/public/intake'",
];
const publicJourneyFailures = [
  ...requiredPublicPaths
    .filter((path) => !appTemplate.includes(path))
    .map((path) => `${path.slice(1, -1)} is still intercepted by staff EasyAuth`),
  appTemplate.includes("'/intake/*'") && "legacy path-carried intake credentials are publicly reachable",
  !secureIntakeEntry.includes("window.location.hash") && "intake bearer token is not read from a browser-only fragment",
  !secureIntakeEntry.includes('window.history.replaceState(null, "", window.location.pathname)') &&
    "intake bearer token remains visible in the address bar",
  !secureIntakeEntry.includes('"x-apex-intake-token": token') &&
    "intake resolve does not carry the credential in a request header",
  staffLeadsRoute.includes("`/intake/${minted.token}`") && "staff intake issuer puts the bearer token in a request path",
  publicLeadsRoute.includes("`/intake/${minted.token}`") && "public intake issuer puts the bearer token in a request path",
].filter(Boolean);
const approvals = Object.entries(requiredApprovals).map(([key, label]) => ({
  key,
  label,
  approved: process.env[key] === "true",
}));
const missingApprovals = approvals.filter((item) => !item.approved);

const report = {
  verdict:
    missingFiles.length ||
    unsafeInfraReferences.length ||
    deploymentBoundaryFailures.length ||
    patientBoundaryFailures.length ||
    publicJourneyFailures.length ||
    (goLive && missingApprovals.length)
      ? "NO-GO"
      : goLive
        ? "GO-EVIDENCE-PRESENT"
        : "STATIC-READY",
  mode: goLive ? "go-live" : "static",
  static: {
    evidenceFiles: staticEvidence.length,
    missingFiles,
    unsafeInfraReferences,
    deploymentBoundaryFailures,
    patientBoundaryFailures,
    publicJourneyFailures,
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
