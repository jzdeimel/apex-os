# What Apex still needs to run all of Alpha Health

Last reviewed: 2026-07-23.

This is an operating gap register, not a feature wish list. It reconciles the
supplied NCV scheduling requirements, July 2026 employee workbook, product
roadmap, 2026-07-21 meeting transcript, and the current Apex implementation.
“Built” means an authoritative workflow exists; a polished page over seeded or
browser-only data is not counted as built.

The broader lifecycle inventory, including Mindbody/HighLevel functions that
sit outside the clinical cutover core, is maintained in
`docs/ALPHA_END_TO_END_CAPABILITY_MAP.md`.

## Operating model now fixed in the product

- The coach is the member's steward, routine contact and owner of the external
  conversation.
- Medical conducts and documents clinical visits but does not own a direct
  member message inbox.
- A coach can attach the member's exact words to a timed Medical escalation.
  Medical answers internally; the coach relays the answer and closes the loop.
- Every NCV is coach introduction, lab draw and provider physical. The coach is
  mandatory; nursing is preferred for the draw; NP/PA is preferred for the
  physical; the lowest appropriate verified license is used.
- Clinical corrections append. Signed notes and prior patient statements are
  never silently overwritten.
- Job access is separate from clinical persona. Front desk, nursing, provider,
  coach, billing, fulfillment, marketing, operations, executive and system
  administration no longer inherit one another's powers from the old three-role
  model; ambiguous assignments fail closed.

## P0 — required before Apex can replace the operating systems

| Capability | Current state | Exit criterion |
| --- | --- | --- |
| Authoritative client identity and complete V1 history | The 2026-07-22 23:25 ET source-only checkpoint fingerprints the live legacy shape and maps 5,004 clients, 45 staff/historical-author/roster identities and 75 linked coach/medical notes without creating false calendar bookings. It maps all 1,031 Alpha/GHL touches into immutable contact history, 54,864 client-linked historical sales with 238,645 immutable lines, and 697 immutable historical fulfillment records (all 431 routed lines plus 266 safely purchase-linked shipment snapshots). Raw legacy fulfillment statuses never advance the live Apex order state machine. A private queue retains 1,341 hashed review items. Nine duplicate staff-name groups are handled through the approved roster; non-defensible Alpha user accounts remain inactive pending Entra/role approval. Documents, intake, subscriptions, inventory and audit history are inventoried but not yet translated. | Translate every accepted remaining domain; explicitly resolve/accept all 1,341 review items and clinic ownership; re-house historical attachments; approve Entra/role/credential identity mappings; reconcile source/target payloads; complete two repeatable empty-target nonprod rehearsals plus final delta; retain a documented read-only legacy fallback for anything intentionally left behind. |
| Real roster, credentials and availability | Job-specific access profiles and fail-closed RN/LPN/provider separation now exist. The workbook has 34 people, five gym-only rows marked to ignore, and 29 relevant rows, but it does not supply working hours, license number/state/expiry, RN vs LPN classification, supervision or DEA facts. | Effective-dated approved roster and access-profile assignment, state scope rules, Google Calendar IDs/consent, work hours, PTO/busy sync and conflict acceptance by clinic. |
| Scheduling system of record | Durable appointment create/reschedule/reassign/cancel, arrival, rooming, completion and no-show transitions now commit with their audit witness. Atomic NCV create/reschedule/cancel commits coach introduction, lab draw, physical, encounter segments and audit evidence together, or commits nothing. Credentials, clinic policy, approved hours, Apex conflicts and Google busy time fail closed. Durable room/equipment resources and overlap-safe reservations now exist, but the real facility roster, patient self-service, notifications and live Google acceptance remain incomplete. | Load and approve roster/credential/hours and facility-resource facts; complete patient self-service, notification delivery, Google reconciliation and rollback-safe ownership. |
| Patient-to-coach messaging | The patient-session-scoped writer, assigned-coach inbox, replies, read state and exact-message Medical escalation are durable. The latest source-only checkpoint retains 1,031 real Alpha/GHL touches in separate immutable contact history so old SMS/email does not masquerade as Apex portal delivery. Urgent language is detected without pretending to provide emergency triage. Attachments, retention/export policy and live notification delivery remain incomplete. | Accepted coach coverage/SLA, attachments policy and historical file re-housing, retention/export, urgent-message operating policy and live ACS/email notification transport. No direct patient-to-Medical thread. |
| Billing and membership money movement | Authoritative membership contracts now create and transition through immutable lifecycle events; itemized issued invoices have stable retry identity, fixed line math and audit witnesses. Clover routing remains fail-closed. No accepted live vault, capture/refund, recurring billing, receipt delivery or settlement reconciliation operates end to end. | Four merchant configurations; vault migration or card recollection; auth/capture/void/refund; recurring run and proration; dunning and card update; receipts; daily settlement reconciliation by clinic. |
| Complete medical chart | Medical visit SOAP, NCV H&P, append-preserving allergy/problem/diagnosis and outside-medication reconciliation, signed consult addenda, and the lab order→specimen→immutable result→critical alert→provider review→patient release chain now persist. A durable adverse-event register auto-escalates severe events and allows exactly one licensed review. Nursing cannot sign/release results or adverse-event reviews. Live vendor interfaces, pharmacy interfaces and private attachments remain incomplete. | Staff acceptance of reconciliation, adverse-event drills and labs; authenticated vendor result interfaces and report files; private document attachments with malware scanning/retention; state-licensed prescribing gates. |
| Prescribing and controlled substances | Internal prescription/order models and clinical decision support exist. No e-prescribing/pharmacy transmission, DEA/PDMP workflow, refill authorization queue or accepted controlled-substance chain operates live. | Named pharmacy/eRx integration, state rules, DEA/supervision facts, PDMP policy, refill/denial workflow, identity-bound signatures, transmission acknowledgements and exception reconciliation. |
| Clinic-day operations | Authoritative appointments now own arrival, rooming, checkout, no-show/cancel and reassignment; the facility register owns active/out-of-service rooms and equipment, and room allocation/release is atomic and conflict-safe. The lower legacy room map, wait/overrun display and some exception surfaces still use seeded/browser state. | Verify and load every clinic resource; move wait/overrun and exception ownership to the authoritative journal; run complete location-by-location front-desk acceptance. |
| Inventory, dispensing and fulfillment | Authoritative lot/expiry receiving, immutable stock movements, cycle-count reconciliation, waste, atomic inter-clinic transfer, patient dispensing and recall-to-affected-patient traceability now exist. Patient orders now commit priced lines, lifecycle history, audit evidence and MedSource outbox intent atomically; scoped coach and fulfillment boards read that source of truth. Expired/recalled stock cannot leave, negative stock is rejected, and controlled dispensing requires matching prescription/DEA/PDMP evidence. The outbox worker, inbound MedSource/UPS transport, cold-chain logs, reorder policy and daily reconciliation are not accepted. | Run clinic recall/count/dispense/order drills; implement and monitor outbox delivery plus authenticated inbound events; add temperature evidence and approved reorder thresholds; provision and accept MedSource/UPS credentials, shipment exceptions and daily reconciliation. |
| Intake, consent and Alpha Plan contracts | Versioned guided intake and immutable signature evidence exist. Final current forms, contract templates, retention/delivery language and operational ownership have not been supplied and accepted. | Medical/legal-approved forms and templates; patient copy delivery; withdrawal/correction process; coach/admin acceptance run; evidence export. |
| Communications and GHL/Mindbody retirement | Consent, quiet hours, caps, campaigns and suppression logic are prepared. Production transport, complete exports and final delta are absent. | ACS number and A2P 10DLC; STOP/DNC/webhooks; verified email domain/SPF/DKIM/DMARC; bounces/complaints; campaign/UTM attribution; Mindbody/GHL exports and reconciled shutdown. |
| Security, continuity and support | EasyAuth, RBAC gates, audit ledger, patient session caps and nonprod isolation exist. Production recovery and operating evidence is external. | BAAs; access review; staff idle-lock decision; Key Vault/rotation; backups/PITR restore test; retention; monitoring/on-call; incident response; downtime workflow; penetration/security review. |

## P1 — needed to run well after the P0 operating core is safe

- Coach workload balancing, coverage handoff, absence reassignment and service
  quality metrics based on outcomes rather than message volume.
- A robust plan-of-care builder after intake stability, including versioning,
  provider continuity/co-sign rules and coach-facing communication tasks.
- Validated outcomes instruments and longitudinal symptom/body-composition
  measures that feed the chart instead of remaining demonstration data.
- Production CRM funnel: lead ownership, source/UTM/campaign, stage history,
  conversion cohorts, referral attribution and follow-up SLA.
- Owner reporting based on collected cash and dated lifecycle events rather
  than seeded snapshots or contracted-value estimates.
- Community moderation is now authoritative for the text pilot: named primary
  and backup moderators, response/resolution SLA, report/block handling,
  immutable evidence, retention and private care-team escalation are built.
  Production moderator assignment/drills and scanned private attachments remain.
- Data export, legal record release, amendment requests and a full client chart
  archive suitable for continuity of care.

## Explicitly not a cutover blocker

Community, education, food/training, AI assistance, automations and other high-
value V2 features can remain enabled for staff acceptance. Each remains behind
owner controls where appropriate. They do not compensate for a missing source
of truth in scheduling, messaging, billing, clinical records or migration.

## Go-live rule

Apex is ready to replace Alpha OS, Mindbody and GHL only when every enabled P0
row has named ownership, exact-candidate acceptance evidence, a rehearsed
fallback and authoritative data. Until then, the isolated Apex dev environment
is the correct place to finish and test the work.
