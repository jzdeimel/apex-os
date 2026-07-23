# Alpha Health end-to-end capability map

Last reviewed: 2026-07-23.

This is the product boundary for making Apex the operating system for Alpha
Health. It is broader than a screen inventory. A capability counts as covered
only when it has an authoritative record, a role-owned workflow, an audit trail,
exception handling, reporting, and an accepted external transport where one is
required.

Status:

- **Authoritative** - durable Apex workflow and role boundary exist.
- **Partial** - an authoritative core exists, but a required workflow,
  integration, acceptance run, or migration domain is missing.
- **Preview** - useful UI over seeded or browser-local data; not a source of
  truth.
- **Missing/external** - no complete Apex workflow, or completion depends on
  credentials, contracts, policies, facilities, or vendor acceptance.

## 1. Acquire and convert

| Capability | Status | Apex today | Required to close |
| --- | --- | --- | --- |
| Marketing website and landing pages | Partial | `/book` is a real public capture surface. | Decide whether Apex owns the public CMS/funnel builder or integrates the existing website; add domains, publishing approvals, SEO, accessibility, analytics, versioning and rollback. |
| Forms, surveys and lead capture | Partial | Public booking and guided intake persist leads, invites, submissions and consent evidence. | Reusable non-clinical forms/surveys, spam protection beyond process-local rate limiting, duplicate resolution, abandonment recovery and form analytics. |
| Source, campaign and attribution | Partial | New web leads now retain first-touch UTM source, medium and campaign. | Landing/referrer, content/term, ad click IDs, first/latest touch, offline source, spend import, conversion export and an accepted attribution model. |
| CRM contacts and identity resolution | Partial | Durable lead and client identities exist. | Deterministic email/phone dedupe, merge/split with audit, household/guardian relationships, deceased/minor handling, do-not-contact identity matching and cross-location identity governance. |
| Opportunities and sales pipeline | Authoritative core | Durable stages/events, claim/reassignment history, a snapshotted 15-minute first-response clock, first-contact evidence, append-only notes, owned follow-up tasks, loss/reopen reasons and audit witnesses now operate from one acquisition queue. | Leadership acceptance/configuration of the response target, consult/appointment linkage, automatic lifecycle transitions, bulk actions, dedupe and forecast rules. |
| Omnichannel inbox and telephony | Missing/external | Portal messaging is patient-to-coach and internal escalation is durable. Historical SMS/email is retained as contact history. | Production phone numbers, inbound/outbound SMS and email, calls, voicemail, recordings/transcripts policy, missed-call text-back, routing, shared inbox ownership, delivery receipts and transport reconciliation. |
| Marketing automation and journeys | Preview | Automation and win-back surfaces exist as review experiences; consent, quiet hours, caps and suppression rules are prepared. | Durable trigger/action engine, versioned journeys, enrollment/re-entry, wait/goal state, idempotent outbox, approvals, pause/kill switch, delivery events, experiment controls and production transport. |
| Campaign content and segmentation | Preview | Staff can review engagement concepts. | Template/version library, audience builder against authoritative data, exclusion/suppression, test sends, approvals, A/B tests, frequency caps, localization and content retention. |
| Ads and conversion feedback | Missing/external | No live spend or ad-platform connection. | Google/Meta account ownership, spend and campaign imports, click IDs, offline conversion export, reconciliation, privacy consent and finance-approved ROAS definitions. |
| Referrals, affiliates and promotions | Preview | Referral UX exists over seeded data. | Durable codes/links, referrer consent, qualification, reward liability, fraud review, payout/credit, coupon rules, expiration and conversion attribution. |
| Reputation and reviews | Missing/external | No authoritative review-request or response workflow. | Google Business Profile/location ownership, request eligibility, opt-out, response ownership/SLA, review ingestion, escalation, approved AI-assist policy and outcome reporting. |
| Social content and publishing | Missing/external | No live social planner. | Decide build versus integrate; channel credentials, content calendar, approval, scheduling, failure/retry, comments/escalation, archive and campaign attribution. |

## 2. Onboard and schedule

| Capability | Status | Apex today | Required to close |
| --- | --- | --- | --- |
| Intake, forms and consent | Partial | Versioned guided intake and immutable signature evidence exist. | Final approved forms/contracts, version ownership, patient-copy delivery, withdrawal/amendment, minors/guardians, accessibility and retention acceptance. |
| Eligibility and service matching | Partial | Track/location/reason are captured and NCV rules are modeled. | Approved service catalog, contraindication routing, age/state eligibility, benefit/pricing disclosure, lead-to-service rules and exception ownership. |
| Staff booking | Partial | Durable booking, NCV atomic scheduling, reschedule, reassignment and cancel exist. | Approved real roster, hours, licenses, rooms/equipment, clinic policies, Google acceptance, notifications and location-by-location rehearsal. |
| Patient self-service booking | Missing | Feature remains disabled. | Safe slot API, identity/eligibility rules, deposits, cancellation windows, waitlist, timezone handling, confirmation/reminders and support exceptions. |
| Calendar synchronization | Missing/external | Busy-only adapter and fail-closed model exist. | Calendar identities and consent, production Google credentials, push/poll reconciliation, write ownership, conflict repair, recurrence and outage behavior. |
| Waitlist, series, classes and events | Missing | Core one-to-one appointments exist. | Waitlist promotion, recurring series, group capacity, guests, class/event attendance, resource seats, deposits, cancellation policy and reporting if Alpha uses them. |

## 3. Run the clinic day

| Capability | Status | Apex today | Required to close |
| --- | --- | --- | --- |
| Arrival, rooming, reassignment and checkout | Partial | Authoritative appointment transitions and conflict-safe room reservations exist. | Load real facilities; durable wait/overrun/exception queues; kiosk decision; location acceptance; downtime workflow. |
| Front-desk payments and POS | Missing/external | Invoices and payment reconciliation foundations exist. | Card-present devices, cash/check/manual tender, tips if used, discounts/tax, split tender, receipts, returns and drawer/settlement controls. |
| Walk-ins and unscheduled work | Partial | Staff can capture a durable walk-in lead. | Convert to client/encounter safely, eligibility, same-day capacity, deposit/payment, duplicate detection and clinic exception flow. |
| Tasks, handoffs and service recovery | Partial | CRM follow-up tasks and the shared support/service-recovery case queue are durable, owned, deadline-driven, ledger-witnessed and visible to staff. Broad personal task/handoff UI still mixes fixtures. | Unify remaining task domains; dependencies, private attachments, notification transport, escalations, workload reporting and accepted response policy. |
| Incident, complaint and quality management | Partial | Patient/staff complaints now enter the durable operational case queue with priority, owner, response/resolution clocks, notes and closure evidence. The separate clinical incident/quality UI still relies on fixtures. | Durable clinical investigation/CAPA, disclosure, severity policy, private attachments, legal hold and regulator/insurer export. |

## 4. Deliver care

| Capability | Status | Apex today | Required to close |
| --- | --- | --- | --- |
| Coach stewardship and consults | Authoritative | Coach is the primary contact; consult drafts, AI-assisted summaries, human signature, profile history and Medical escalation are durable. | Staff pilot acceptance, coverage/absence handoff, consult templates, outcome measures and production notifications. |
| Medical visits and chart notes | Partial | Medical SOAP, H&P, vitals, addenda and signed-history controls exist. | Complete chart migration, specialty templates, coding/diagnosis acceptance, document/file system, record release and clinical pilot. |
| Problems, allergies and outside medications | Partial | Append-preserving reconciliation exists. | Patient confirmation, inactive/resolved state rules, coded vocabularies, interaction checks, import reconciliation and acceptance. |
| Labs | Partial | Order, specimen, versioned result, critical alert, licensed review and patient release are durable. | Vendor interfaces, result authentication, PDF storage, corrected-result reconciliation, label/accession workflows and lab acceptance. |
| Prescribing, refills, pharmacy and controlled substances | Missing/external | Internal prescription, dispense and PDMP evidence models exist. | eRx/pharmacy network, identity-bound signing, DEA/supervision facts, state rules, PDMP workflow, refill/denial queue, acknowledgements and exception reconciliation. |
| Plan of care and clinical approvals | Partial/preview | Clinical controls and recommendation concepts exist; broad plan experiences still mix fixtures. | Authoritative versioned plan builder, provider approval/co-sign rules, coach tasks, patient release, adherence linkage and amendment history. |
| Outcomes, measurements and body composition | Preview/partial | Daily logging and validated-instrument schema exist; many trends are seeded. | Authoritative instruments, device/import flows, provenance, measurement correction, longitudinal read models and accepted clinical interpretations. |
| Telehealth | Preview | Visit types and device checks exist; there is no accepted live visit transport. | Video vendor/BAA, waiting room, consent, participant identity, failure fallback, documentation linkage and support ownership. |
| Clinical files and images | Missing/external | Signed document evidence exists; private general attachment storage is absent. | Private Blob storage, malware scanning, content-type validation, encryption, thumbnails, access logging, retention/legal hold, download controls and patient-copy delivery. |
| Records, release and amendments | Partial | Authenticated patients and authorized staff can open and track access, release and amendment cases. Apex snapshots the 30/60-day outer action clocks, requires record scope, gates fulfillment behind identity-verification state, assigns an accountable owner and retains an immutable timeline. | Approved designated-record-set definition; authorization and recipient verification; redaction; actual export/delivery package; accounting of disclosures; accepted amendment/denial notices; legal hold and continuity-of-care transfer. |

## 5. Keep patients engaged

| Capability | Status | Apex today | Required to close |
| --- | --- | --- | --- |
| Patient authentication and portal | Partial | Patient magic-link/session boundaries, authoritative messaging/community and tracked records-request pilot exist. | Production identity decision, recovery, support, MFA/risk policy, account linking, full authoritative read model and pilot acceptance. |
| Patient-to-coach messaging | Partial | Durable assigned-coach thread, replies/read state and coach-to-Medical escalation exist. | Attachments, export/retention, urgent-message policy, coverage SLA and live notification transport. |
| Community | Authoritative for text pilot | Coach-owned groups, backup moderator, opt-in enrollment, private handles, report/block, SLAs, immutable evidence, suspension and care-team escalation are durable. | Named production moderators and drills. Attachments remain disabled until private storage/scanning exists. |
| Education, nutrition, training and progress | Preview | High-value role/patient experiences are visible in Apex dev. | Replace seeded reads and browser-local writes, publish clinical/content ownership, version curricula, measure completion/outcomes and define support. |
| Push/mobile experience | Missing/external | Responsive web exists. | Decide PWA versus native app; push identity/consent, deep links, secure device sessions, release management, accessibility and store/compliance ownership. |
| Family/household accounts | Missing | No authoritative guardian or shared-payer workflow. | Relationships, consent, proxy access, separate privacy boundaries, shared payment responsibility and dependent scheduling. |

## 6. Sell, bill and fulfill

| Capability | Status | Apex today | Required to close |
| --- | --- | --- | --- |
| Product/service catalog and pricing | Partial/preview | Order and invoice lines preserve fixed prices; broad catalogs are still fixtures. | Effective-dated catalog, clinic availability, tax, discounts/coupons, bundles, gift cards/credits, approval and price-change rules. |
| Memberships, packages and contracts | Partial | Durable contract lifecycle and immutable events exist. | Final plans/terms, entitlements/usage, proration, upgrades/downgrades, freezes, family plans, signed delivery, migration and billing acceptance. |
| Recurring billing and dunning | Missing/external | Stable invoices and payment-attempt foundation exist; no live money movement. | Clover merchants, vault/recollection, scheduled charges, retries, card updater, notices, grace/suspension rules and recovery reporting. |
| Payments, refunds and receipts | Missing/external | Clover adapter fails closed. | Auth/capture/void/refund, card-present/card-not-present, ACH if used, tokenization, idempotency, receipts and role/limit approval. |
| Tax, discounts, tips and credits | Missing | No accepted authoritative policy engine. | Jurisdiction/product tax rules, coupons, comp/discount approval, account credit, gift cards, tips/commissions if used and auditable adjustments. |
| Disputes, chargebacks and fraud | Missing/external | No live processor events. | Dispute intake/evidence/deadlines, fraud flags, account holds, write-off policy, processor webhooks and finance ownership. |
| Settlement and accounting | Missing/external | Invoice math is authoritative; collected cash is not claimed without reconciliation. | Daily merchant settlement, deposits/fees, location/merchant mapping, general-ledger export, month close, revenue recognition decisions and variance ownership. |
| Inventory and dispensing | Partial | Lot/expiry receiving, immutable movements, count, transfer, dispense and recall traceability exist. | Real opening stock, clinic drills, barcode/label workflow, reorder policy, cold-chain evidence and daily reconciliation. |
| Orders, MedSource and shipping | Partial/external | Orders, status history and transactional outbox intent are durable. | Outbox worker, authenticated vendor/carrier transport, webhooks, retry/dead-letter, address validation, shipment exceptions, returns and reconciliation. |

## 7. Run the workforce and business

| Capability | Status | Apex today | Required to close |
| --- | --- | --- | --- |
| Roster, roles and clinical credentials | Partial | Job-specific access profiles and fail-closed clinical boundaries exist. | Approved hours, license/state/expiry, RN/LPN, supervision, DEA, Entra identities, effective dates and owner acceptance. |
| Availability, PTO and substitutions | Partial | Availability rules and calendar busy blocks exist. | Staff self-service, PTO approval, substitutions/coverage, absence handoff, recurrence, payroll boundary and notification. |
| Time clock, payroll, tips and commissions | Missing/external | No authoritative earnings/time workflow. | Time clock/edit approval, pay rates, service/product commissions, tips/splits, contractor rules, payroll export/integration and reconciliation. |
| Training and competency | Preview | Coach training UI is seeded. | Required curriculum, assignment, attestations, quiz versions, expiration, remediation, role gating and compliance export. |
| Business intelligence | Partial/preview | Real lead, invoice, membership and operational foundations coexist with clearly labeled seeded dashboards. | Replace every fixture-backed KPI, metric dictionary, semantic layer, cohort/time boundaries, cash reconciliation, drill-through and owner sign-off. |
| Capacity and workforce planning | Preview/partial | Scheduling/resource foundations exist; executive capacity views are seeded. | Approved roster/hours, authoritative appointments, demand model, service durations, rooms/equipment, labor assumptions and accepted forecasts. |
| Data export and interoperability | Partial | Controlled migration/export foundations exist. | Role-scoped CSV/FHIR/record exports as applicable, webhooks, retry/replay, schemas/versioning, partner agreements, audit and data minimization. |
| Administration and feature control | Authoritative | Owner feature controls, role boundaries and audit trail exist. | Separation-of-duties review, production admin assignment, approval workflow for high-risk changes and periodic access review. |
| Support and knowledge management | Partial | Every staff portal can open a durable support or service-recovery case; operations has an owned priority queue, response and resolution clocks, linked patient/lead/location fields, append-only event history and closure evidence. | Patient-facing general support intake, appointment/payment deep links, private attachments, notification transport, escalation/incident conversion, macros/knowledge base, accepted SLAs and operational reporting. |

## 8. Protect, migrate and recover

| Capability | Status | Apex today | Required to close |
| --- | --- | --- | --- |
| V1/Mindbody/GHL migration | Partial | Repeatable importer covers clients, selected notes, communications, sales and historical fulfillment with reconciliation and a private exception queue. | Remaining chart, appointments, membership, payment, consent, document, inventory and audit domains; resolve/accept exceptions; two Azure rehearsals; final delta; legacy fallback. |
| Privacy, consent and communications compliance | Partial | Role gates, patient sessions, consent evidence, quiet hours/caps/suppression foundations exist. | Approved retention schedule, BAAs, 10DLC, TCPA/marketing consent mapping, STOP/DNC webhooks, accounting of disclosures and privacy-request operations. |
| Security operations | Partial/external | EasyAuth, scoped authorization, Key Vault references and audit ledger exist. | Production threat model, penetration/security review, alerting, on-call, vulnerability/patch SLA, device/session policy, access review and incident exercises. |
| Backup, restore and disaster recovery | Missing evidence | Azure services exist, but production restore evidence is external. | PITR configuration evidence, timed restore test, application verification, RPO/RTO, downtime workflow, communications plan and named incident commander. |
| Audit, retention and legal hold | Partial | Clinical/community immutability and ledger foundations exist. | Enterprise retention matrix, purge jobs, hold override, export, audit review cadence, clock/identity assurance and storage-level immutability where required. |
| Cutover and rollback | Partial | Static safety gates, immutable images and isolated nonprod deployment exist. | Accepted exact data candidate, freeze/final delta, named go/no-go authority, downtime plan, rollback rehearsal, read-only V1 fallback and post-cutover reconciliation. |

## Apex source-of-truth rule

Apex should own the business records that Alpha cannot afford to split:

- identity, consent and communication preferences;
- lead/opportunity lifecycle and ownership;
- appointment, attendance and clinic-resource state;
- coach relationship, medical chart and clinical escalation;
- membership, invoice, payment reconciliation and order state;
- inventory lot movement and fulfillment obligation;
- audit, retention and operational ownership.

External systems remain transports or specialist networks: Azure Communication
Services/email, Google Calendar, Clover, labs, eRx/pharmacy, MedSource/carriers,
ad platforms and review platforms. Their events must land in an idempotent Apex
inbox/outbox and reconcile to the Apex record. A vendor dashboard is never the
only evidence that an Alpha obligation was completed.

## Build-versus-integrate rule

Covering the business does not require rebuilding every generic editor sold by
Mindbody or HighLevel. A website builder, social-post designer, ad manager,
payroll engine, card network, video network and e-prescribing network can remain
external if:

1. Alpha has a named owner and accepted contract;
2. Apex controls the authoritative patient/business lifecycle;
3. consent and minimum-necessary data are enforced;
4. delivery and failure events reconcile back into Apex;
5. the workflow has a tested outage and exit path.

## Next implementation order

1. **Cutover core:** remaining V1 translations/rehearsals, approved roster and
   facilities, live scheduling/calendar, patient identity, communications,
   billing/membership money movement, clinical files, backup/restore and
   rollback.
2. **Revenue operating system:** CRM ownership/SLA/tasks, attribution and ad
   feedback, omnichannel inbox, journeys, reputation/referral, contract and
   receivables work queues.
3. **Clinical completeness:** vendor labs/files, longitudinal plan, outcomes,
   eRx/refills/PDMP and records release.
4. **Scale operations:** support/quality cases, workforce/time/payroll,
   accounting close, authoritative analytics, mobile/push and integration
   monitoring.

Until every enabled cutover-core row is accepted, Apex dev is a product-review
and rehearsal environment, not a replacement for the live Alpha systems.

## Vendor comparison sources

The replacement boundary was checked against the vendors' current official
product and developer material:

- Mindbody:
  [client management](https://www.mindbodyonline.com/business/client-management),
  [staff management](https://www.mindbodyonline.com/business/staff-management),
  [marketing](https://www.mindbodyonline.com/business/marketing),
  [payments](https://www.mindbodyonline.com/business/payments), and
  [reporting](https://www.mindbodyonline.com/business/reporting).
- HighLevel:
  [API coverage](https://marketplace.gohighlevel.com/docs/intro/index.html),
  [opportunities](https://marketplace.gohighlevel.com/docs/ghl/opportunities/opportunities/),
  [conversations](https://marketplace.gohighlevel.com/docs/ghl/conversations/messages/index.html),
  [workflows](https://help.gohighlevel.com/support/solutions/articles/155000002288),
  [attribution](https://help.gohighlevel.com/support/solutions/articles/48001219997-understanding-attribution-source),
  [reputation](https://help.gohighlevel.com/support/solutions/articles/155000005201-guided-review-setup-wizard-reputation-management-),
  and [documents and contracts](https://help.gohighlevel.com/support/solutions/articles/155000001301).
