# What Apex still needs to run all of Alpha Health

Last reviewed: 2026-07-22.

This is an operating gap register, not a feature wish list. It reconciles the
supplied NCV scheduling requirements, July 2026 employee workbook, product
roadmap, 2026-07-21 meeting transcript, and the current Apex implementation.
“Built” means an authoritative workflow exists; a polished page over seeded or
browser-only data is not counted as built.

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

## P0 — required before Apex can replace the operating systems

| Capability | Current state | Exit criterion |
| --- | --- | --- |
| Authoritative client identity and complete V1 history | Foundation importer, dry-run inventory and reconciliation exist. Full clinical, commercial and financial history has not been migrated or accepted. | SELECT-only V1 credential; accepted migration scope; two repeatable rehearsals; final delta; documented read-only legacy-history fallback for anything intentionally not migrated. |
| Real roster, credentials and availability | The workbook has 34 people, five gym-only rows marked to ignore, and 29 relevant rows. It does not supply working hours, license number/state/expiry, RN vs LPN classification, supervision or DEA facts. | Effective-dated approved roster, state scope rules, Google Calendar IDs/consent, work hours, PTO/busy sync and conflict acceptance by clinic. |
| Scheduling system of record | Durable appointment create/reschedule/reassign/cancel, arrival, rooming, completion and no-show transitions now commit with their audit witness. Staff/patient/location conflicts and approved-hours rules fail closed. Composite NCV booking, room/equipment resources, patient self-service, notifications and live Google acceptance remain incomplete. | Atomic three-component NCV booking, resource/room constraints, patient self-service, notification delivery, Google reconciliation and rollback-safe ownership. |
| Patient-to-coach messaging | The patient-session-scoped writer, assigned-coach inbox, replies, read state and exact-message Medical escalation are durable. Urgent language is detected without pretending to provide emergency triage. Attachments, retention/export policy and live notification delivery remain incomplete. | Accepted coach coverage/SLA, attachments policy, retention/export, urgent-message operating policy and live ACS/email notification transport. No direct patient-to-Medical thread. |
| Billing and membership money movement | Clover routing, idempotency and failure boundaries are modelled; database entities exist. No accepted live invoice, payment-method, capture/refund, recurring billing or reconciliation workflow operates end to end. | Four merchant configurations; vault migration or card recollection; invoice/receipt ledger; auth/capture/void/refund; dunning and card update; pause/cancel/proration; daily settlement reconciliation by clinic. |
| Complete medical chart | Medical visit SOAP, NCV H&P, and append-preserving allergy/problem/outside-medication reconciliation now persist. Live diagnoses, adverse events, lab/pharmacy interfaces, attachments and signed addenda remain incomplete. | Staff acceptance of reconciliation; diagnoses and adverse events; orders/results/provider review; document attachments; signed addenda; state-licensed prescribing gates. |
| Prescribing and controlled substances | Internal prescription/order models and clinical decision support exist. No e-prescribing/pharmacy transmission, DEA/PDMP workflow, refill authorization queue or accepted controlled-substance chain operates live. | Named pharmacy/eRx integration, state rules, DEA/supervision facts, PDMP policy, refill/denial workflow, identity-bound signatures, transmission acknowledgements and exception reconciliation. |
| Clinic-day operations | Desk, rooms, lab-draw and encounter screens exist; several desk movements still use seeded or browser state rather than one durable appointment/encounter journal. | Durable arrival, check-in, rooming, wait/overrun, checkout, no-show/cancel, staff reassignment and exception ownership across every location. |
| Inventory, dispensing and fulfillment | Durable movement/dispense foundations and MedSource routing contracts exist. Live receiving, cycle count, waste, transfer, reorder, shipment acknowledgement and MedSource/UPS reconciliation are not accepted. | Lot/expiry receiving, dispense/admin decrement, recall drill, waste and temperature logs, reorder thresholds, shipment exceptions, MedSource/UPS credentials/webhooks and daily reconciliation. |
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
- Community moderation operations: named moderators, response SLA, report/block
  handling, content retention and escalation into private coach workflows.
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
