import type { AzureService, AzureServiceStatus } from "@/lib/azure/types";

/**
 * THE ESTATE, DESCRIBED HONESTLY.
 *
 * WHAT THE REAL THING IS
 *   The list of Azure services Apex runs on in Alpha Health's tenant.
 *
 * WHAT THIS BUILD DOES
 *   Renders the same list as static data so the Settings platform panel can show
 *   the truth rather than a wall of green checkmarks. Three of these are `wired`
 *   in the sense that the *demo* genuinely depends on them conceptually and the
 *   production shape is settled; most are `adapter`; a few are `planned`.
 *
 * TO GO LIVE
 *   Provisioning is Bicep/Terraform in a separate repo. This file becomes the
 *   documentation surface that a deployment can be diffed against — if a service
 *   is `wired` here and absent from the resource group, that is a bug in one of
 *   the two places, and the disagreement is visible.
 *
 * WHY THE STATUS FIELD IS THE POINT
 *   The system Apex replaces was described to its own operators as "integrated"
 *   for years. Nobody could name which parts were integrated and which were a
 *   person copying values between two browser tabs. A status column that is
 *   allowed to say "adapter" is the cheapest possible defense against that.
 *
 * WHY BAA COVERAGE IS ON EVERY ROW
 *   Microsoft's HIPAA BAA covers most, but not all, Azure services, and coverage
 *   is per-service, not per-tenant. A service outside it may never receive PHI.
 *   Recording that per row makes "can this hold member data?" answerable by
 *   reading the registry rather than by asking whoever set it up.
 */

export const AZURE_SERVICES: AzureService[] = [
  {
    id: "postgres-flexible",
    name: "Azure Database for PostgreSQL — Flexible Server",
    purpose: "The system of record. One database, one truth, no mirrored source.",
    status: "adapter",
    baaCovered: true,
    whatItDoes:
      "Managed Postgres with private networking, customer-managed keys, PITR and read replicas. Holds members, consults, plans, orders, consent and the hash-chained ledger — the ledger insert sharing a transaction with the mutation it records.",
    whatWeDoNow:
      "Every table is an in-memory array in lib/mock/*, generated deterministically at module load. Nothing persists across a refresh.",
    toGoLive:
      "Provision the server with private endpoint + Entra auth, port the mock generators to seed migrations, and move appendLedger() into the same transaction as each write.",
  },
  {
    id: "container-apps",
    name: "Azure Container Apps + Jobs",
    purpose: "Runs the Next.js app and every background job in one scale-to-zero platform.",
    status: "adapter",
    baaCovered: true,
    whatItDoes:
      "Hosts the app with a system-assigned managed identity (so no secret ever lands in an env var), plus Jobs for the outbox drainer, the MedSource reconciler, the lab-ingest worker and the ledger anchoring job.",
    whatWeDoNow:
      "The demo runs as a plain Next.js app. The 'jobs' are pure functions you can call from a page — reconcile(), backoffMs(), anchorBatch() — with no scheduler behind them.",
    toGoLive:
      "One container app + four jobs on cron/queue triggers; grant the managed identity Key Vault Secrets User and Postgres db-owner.",
  },
  {
    id: "key-vault",
    name: "Azure Key Vault",
    purpose: "No secret exists anywhere a human or a repo can read it.",
    status: "adapter",
    baaCovered: true,
    whatItDoes:
      "Holds the ACS connection string, the MedSource HMAC signing key, the OpenAI key and DB credentials. Read at startup through DefaultAzureCredential; rotation is a Key Vault operation with no redeploy.",
    whatWeDoNow:
      "There are no secrets, because there is nothing to authenticate to. AcsProvider in lib/comms/send.ts throws rather than reading one.",
    toGoLive: "Create the vault, add RBAC for the container app identity, move each value in.",
  },
  {
    id: "entra-id",
    name: "Microsoft Entra ID",
    purpose: "Staff identity. Roles come from the directory, not from a column we can edit.",
    status: "adapter",
    baaCovered: true,
    whatItDoes:
      "Authenticates Admin/Coach/Medical staff with conditional access and MFA. Group membership maps to the StaffRole union in lib/types.ts, so revoking access is an HR action, not an application one.",
    whatWeDoNow:
      "lib/viewer.ts holds a client-side role switcher. It exists to demonstrate that every surface really is role-shaped — it is not authentication and never claims to be.",
    toGoLive:
      "App registration + MSAL, map group object-ids to StaffRole, and make can() in lib/authz/capabilities.ts read the token's claims instead of a local viewer.",
  },
  {
    id: "entra-external-id",
    name: "Microsoft Entra External ID (CIAM)",
    purpose: "Member identity, kept structurally separate from staff identity.",
    status: "adapter",
    baaCovered: true,
    whatItDoes:
      "A separate consumer directory for the member portal, with self-service sign-up and passwordless. A member credential cannot resolve to a staff session because the two live in different directories — that separation is the point.",
    whatWeDoNow:
      "lib/portals.ts models the member as a distinct identity class with its own capability set. The boundary is real in the type system; the login is not.",
    toGoLive: "Stand up the external tenant, wire the portal's auth route to it, keep the two token audiences disjoint.",
  },
  {
    id: "communication-services",
    name: "Azure Communication Services",
    purpose: "Email, SMS and native video — one PHI path fewer than a third-party vendor.",
    status: "adapter",
    baaCovered: true,
    whatItDoes:
      "Transactional email, SMS with delivery reports, and WebRTC video rooms for telehealth visits under the same BAA as the rest of the estate.",
    whatWeDoNow:
      "lib/comms/send.ts enforces consent, quiet hours, weekly cap and idempotency, then hands to an inert DemoProvider. lib/azure/communication.ts models the email/SMS/video surface that send.ts does not.",
    toGoLive:
      "Provision ACS, verify a sending domain, buy a toll-free number and complete SMS verification, then swap DemoProvider for AcsProvider.",
  },
  {
    id: "openai",
    name: "Azure OpenAI Service",
    purpose: "Consult summarization and plan drafting, inside the tenant and inside the BAA.",
    status: "adapter",
    baaCovered: true,
    whatItDoes:
      "Hosts GPT-class models with no training on customer data and no data leaving the tenant boundary. Apex's contract with it is unusual and deliberate: the model must return a source quote and character offset for every assertion, or the assertion is discarded.",
    whatWeDoNow:
      "lib/consult/summarize.ts is a real extractive summarizer running locally. It responds to whatever a coach types and cites the exact substring for every item — deterministically, with no model call.",
    toGoLive:
      "Deploy the model, keep the extractive contract and the provenance stamp, and route anything the model cannot source into `unclassified` exactly as the local engine already does.",
  },
  {
    id: "blob-storage",
    name: "Azure Blob Storage",
    purpose: "Lab PDFs, scan exports, signed documents — with immutability where it matters.",
    status: "adapter",
    baaCovered: true,
    whatItDoes:
      "Private containers with customer-managed keys, versioning, and a legal-hold/immutability policy on signed clinical documents so a signed note cannot be silently replaced.",
    whatWeDoNow:
      "No file is stored. The lab upload flow works on a fixed set of fixture markers; nothing is written anywhere.",
    toGoLive: "Create the account with hierarchical namespace off, private endpoint on, and SAS issued per-request by the app identity.",
  },
  {
    id: "monitor",
    name: "Azure Monitor + Application Insights",
    purpose: "The alarm that the audited system never had.",
    status: "adapter",
    baaCovered: true,
    whatItDoes:
      "Traces, metrics and alert rules. The alerts that matter here are business ones: outbox entries owed for over an hour, orders stuck past their SLA, ledger anchoring skipped, webhook rejection rate above baseline.",
    whatWeDoNow:
      "isStuck()/stuckReason() in lib/orders/lifecycle.ts compute the same conditions on the page. The detection logic is real; the paging is not.",
    toGoLive: "Emit those predicates as custom metrics and attach action groups. The queries already exist as functions.",
  },
  {
    id: "confidential-ledger",
    name: "Azure Confidential Ledger",
    purpose: "Hardware outside our control attests that we did not edit the record.",
    status: "adapter",
    baaCovered: true,
    whatItDoes:
      "An append-only, TEE-backed ledger on a permissioned blockchain that issues cryptographic receipts. Anchoring the Apex chain head there converts 'we verify our own arithmetic' into an attestation Alpha Health cannot forge even with full database access.",
    whatWeDoNow:
      "lib/trace/ledger.ts really does hash-chain every event with a real SHA-256, and verifyChain() really does break on tamper. lib/azure/confidentialLedger.ts models the anchoring and receipts over that chain, deterministically.",
    toGoLive:
      "Provision the ledger, grant the anchoring job's identity Contributor, and schedule anchorBatch() over the chain head every 15 minutes.",
  },
  {
    id: "document-intelligence",
    name: "Azure AI Document Intelligence",
    purpose: "Turns a lab PDF into charted biomarkers — with a page and a box for every number.",
    status: "adapter",
    baaCovered: true,
    whatItDoes:
      "Layout + custom extraction models that return field values with confidence scores and bounding-box coordinates on a specific page.",
    whatWeDoNow:
      "lib/azure/documentIntelligence.ts returns deterministic fixture markers in the real response shape, including page and bounding box, so the provenance UI can be built against the true contract.",
    toGoLive:
      "Train a custom model on Alpha Health's actual lab vendor layouts, then keep the rule that a marker with no boundingBox is never auto-charted.",
  },
  {
    id: "text-analytics-health",
    name: "Azure AI Language — Text Analytics for Health",
    purpose: "Clinical NLP that knows 'no chest pain' is not a chest-pain finding.",
    status: "adapter",
    baaCovered: true,
    whatItDoes:
      "Extracts clinical entities (Diagnosis, SymptomOrSign, MedicationName, Dosage, Frequency, BodyStructure), detects negation, and links entities to UMLS/SNOMED/RxNorm concept ids.",
    whatWeDoNow:
      "lib/consult/summarize.ts does keyword matching with offsets. lib/azure/textAnalyticsHealth.ts models the richer output using the same offset contract, so the upgrade is additive.",
    toGoLive: "Call the /:analyze-text/jobs endpoint and map entities onto ExtractedItem — the offsets already line up.",
  },
  {
    id: "speech",
    name: "Azure AI Speech",
    purpose: "Consult dictation with speaker separation, so the coach's hands stay free.",
    status: "adapter",
    baaCovered: true,
    whatItDoes: "Batch and real-time transcription with diarization, timestamps and per-segment confidence.",
    whatWeDoNow:
      "lib/azure/speech.ts returns a deterministic transcript in the real segment shape. No audio is captured, uploaded or stored.",
    toGoLive:
      "Provision the resource, capture audio in the browser, and — critically — retain the transcript alongside the summary exactly as rawNotes is retained today.",
  },
  {
    id: "fhir",
    name: "Azure Health Data Services — FHIR service",
    purpose: "The information-blocking answer, and the door every future partner walks through.",
    status: "adapter",
    baaCovered: true,
    whatItDoes:
      "A managed FHIR R4 server with SMART-on-FHIR authorization and $export. Gives members a standards-based API to their own record and gives partner health systems something to integrate with that is not a CSV.",
    whatWeDoNow:
      "lib/azure/fhir.ts maps Apex's own types onto FHIR R4 resources and builds a Bundle in memory. The mapping is real; the server is not.",
    toGoLive: "Provision the workspace + FHIR service and PUT the mapped resources; the projection functions are already the hard part.",
  },
  {
    id: "service-bus",
    name: "Azure Service Bus",
    purpose: "Makes the Apex→MedSource seam at-least-once instead of at-most-once.",
    status: "adapter",
    baaCovered: true,
    whatItDoes:
      "Durable queues with sessions, scheduled delivery, exponential retry and a real dead-letter queue that an operator can inspect and re-drive.",
    whatWeDoNow:
      "lib/orders/types.ts models OutboxEntry and lib/orders/medsource.ts defines the deterministic backoff. lib/azure/serviceBus.ts models the queue those entries would drain through, in memory.",
    toGoLive:
      "Create the namespace + queues, have the outbox drainer job pull from it, and alert on dead-letter depth > 0.",
  },
  {
    id: "ai-search",
    name: "Azure AI Search",
    purpose: "Finding a member, a note or a protocol without knowing where it lives.",
    status: "planned",
    baaCovered: true,
    whatItDoes:
      "Hybrid keyword + vector search over charts, consults and protocol documents, with security trimming so results respect the same location scope the UI does.",
    whatWeDoNow:
      "Search is client-side filtering over the in-memory arrays. Adequate for a few hundred rows; not a plan.",
    toGoLive:
      "Index from Postgres via a change-feed indexer, and enforce location scope as a filter on every query — an untrimmed index is a cross-location disclosure waiting to happen.",
  },
  {
    id: "front-door",
    name: "Azure Front Door + WAF",
    purpose: "One public edge, TLS termination, and a rule set in front of every request.",
    status: "planned",
    baaCovered: true,
    whatItDoes:
      "Global entry point with managed WAF rules, rate limiting on auth and portal endpoints, and origin lock-down so the container app is unreachable except through the edge.",
    whatWeDoNow: "Nothing. The demo is a local dev server.",
    toGoLive: "Provision the profile, attach the managed rule set, and restrict the container app ingress to the Front Door service tag.",
  },
];

export const azureServiceMap: Record<string, AzureService> = Object.fromEntries(
  AZURE_SERVICES.map((s) => [s.id, s]),
);

export function azureServicesByStatus(status: AzureServiceStatus): AzureService[] {
  return AZURE_SERVICES.filter((s) => s.status === status);
}

/**
 * Services outside the BAA. Currently empty — every service in the estate is
 * covered, which is not luck: anything that was not covered was designed out
 * rather than fenced off, because a fence is a thing a future engineer removes.
 */
export function servicesOutsideBaa(): AzureService[] {
  return AZURE_SERVICES.filter((s) => !s.baaCovered);
}

export interface EstateSummary {
  total: number;
  wired: number;
  adapter: number;
  planned: number;
  baaCovered: number;
}

export function estateSummary(): EstateSummary {
  return {
    total: AZURE_SERVICES.length,
    wired: azureServicesByStatus("wired").length,
    adapter: azureServicesByStatus("adapter").length,
    planned: azureServicesByStatus("planned").length,
    baaCovered: AZURE_SERVICES.filter((s) => s.baaCovered).length,
  };
}
