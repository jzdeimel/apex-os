# Apex readiness status

As of 2026-07-22, V1 production has not been changed. The isolated Azure and
GitHub deployment foundation is complete and green. The Apex readiness branch
builds, typechecks, passes its executable requirements, and has a zero-failure
contrast sweep.

## Completed in code

- Nonprod Azure/OIDC/EasyAuth/CI foundation.
- Repeatable app deployment that verifies the existing Entra/Key Vault secret
  reference by metadata and does not require a routine deployer to read or
  rewrite the authentication credential. The Entra web registration also
  asserts the ID-token setting required by the EasyAuth callback flow.
- Production-like nonprod posture: server demo behavior is explicitly disabled,
  so unknown staff, seeded identity fallback, and legacy intake query/path
  credentials fail closed during rehearsal.
- Nonprod product review uses the full feature preset, including Community and
  the owner-added engagement/automation surfaces, with an Alpha-dark skin that
  is independent from feature availability.
- A separate `clinic-v2` launch preset keeps the high-value V2 surfaces on by
  default while direct provider messaging, emergency-card sharing and
  self-booking stay off until their operating controls are ready. Admins can
  override any flag globally for everyone from Owner / Features; every change
  is audited and takes effect on the next page load.
- Community now opens on a personalized `For you` view that prioritizes the
  next relevant event, the member's location challenge, their moderated coach
  group and recent pseudonymous wins while preserving the existing clinical
  content guard and private escalation path.
- The coach is the client's steward and single messaging contact. Coach
  consults collect the member-contact type/channel, autosave raw notes
  server-side, build a source-traceable AI summary for human review, sign
  atomically into the audit ledger, and read the durable signed record back
  into the client's Consults profile. Medical now documents real in-person,
  phone, video, follow-up and telehealth visits plus internal chart reviews.
  Medical notes include clinician-authored Subjective, Objective, Assessment
  and Plan fields; the AI summary cannot fill those fields, and required
  sections are enforced before signature. Medical never receives a Messaging
  encounter channel. Clinic appointments link directly into the Medical note
  workflow, while lab draws retain their dedicated queue.
- A coach can push a consult finding or inbound clinical message to Medical.
  The escalation, SLA, acknowledgement, review state, Medical answer and audit
  witness are database-backed and survive reload. The answer returns to the
  coach's client record for the coach to relay; it does not create a direct
  patient-to-Medical thread.
- V1 visual skin and accessibility repairs.
- Public booking and intake entry, with narrowly scoped EasyAuth exclusions and
  intake credentials carried only in a browser fragment/header rather than a
  request path.
- Feature flags and clinic release preset.
- Real staff actor mapping and database-backed write paths.
- Job-specific server authorization profiles separate owner, system admin,
  executive, operations, provider, nursing, coach, front desk, billing,
  fulfillment and marketing authority. Ambiguous staff receive no authority;
  front desk scheduling is location-scoped and does not grant chart access; a
  nursing profile cannot prescribe.
- NCV credential tiers, resolution, segments, coverage, queue, vitals, and H&P.
- Versioned five-must-know intake with guided provenance.
- Append-only clinical facts and immutable signature/archive evidence.
- Patient magic-link/session data model, staff-only pilot issuing path, and a
  read-only `/patient` pilot that is scoped from the session, enforces a
  15-minute idle timeout plus 12-hour absolute cap, and reads only the
  authoritative database. Staff testing as patients requires an explicit
  active-staff-to-synthetic-patient mapping.
- Authoritative patient/location/staff/appointment schema and controlled V1
  importer with baseline, delta, dry-run, provenance, and reconciliation. The
  importer now detects and fingerprints the actual production
  `legacy-public-2026-07` shape, refuses changed/ambiguous schemas, maps 5,002
  client profiles and the staff directory, and correctly translates Alpha's
  note-shaped `Appointment` rows plus medical `ProgressNote` rows into Apex
  consult history rather than calendar reservations.
- A private migration-exception queue preserves unlinked note payloads and
  ambiguous demographic/location evidence inside protected Postgres with an
  integrity digest. It has no application read API. The current read-only
  rehearsal produces 346 review items: 143 inferred split names, 192 unresolved
  coach-to-home-clinic assignments, one malformed DOB and 10 notes with no
  patient link. No source row is silently attached to a guessed patient.
- The dry run inventories counts for every other V1 clinical, commercial,
  operations, reference, and MedSource table without emitting row contents, so
  the remaining history scope can be accepted or expanded from evidence.
- Immutable web and migration images plus a dormant, manual-triggered Container
  Apps migration job in `apex-nonprod`; it defaults to a source-read-only dry run
  and can be installed without secret-read permission or a V1 binding. An
  explicit redeploy with `-SourceSecretAvailable` binds the source only after a
  V1 read-only credential is supplied through Key Vault.
- Working-hours/calendar busy model and payment/messaging fail-safe boundaries.
- Patient-session-scoped messages to the assigned coach, a durable coach inbox,
  replies/read state, and exact-message escalation into the internal Medical
  queue. The patient cannot address Medical directly.
- Durable staff booking, reschedule, reassignment, cancel, arrival, rooming,
  completion and no-show transitions with conflict checks and an atomic audit
  witness. Staff can also create, reschedule, or cancel a complete NCV as one
  three-component transaction. The NCV fails closed unless the coach, draw, and
  physical can all be staffed from verified access profiles, in-state licenses,
  clinic policy, approved hours, Apex conflicts, and connected-calendar busy
  time. Patient self-service remains separate work.
- A durable clinic facility register now owns rooms and equipment, service
  status, and time-bound reservations. Rooming selects only an active,
  visit-compatible room at the appointment's clinic; appointment state and the
  non-overlapping reservation commit together and checkout releases it. The
  front-desk schedule read is constrained to assigned locations.
- Medical-only append-preserving allergy, problem and outside-medication
  reconciliation, with coach read access inside care-team scope.
- A care-team adverse-event register now preserves the original report,
  automatically opens the Medical queue for severe/life-threatening events,
  and permits exactly one immutable licensed review. Signed consult corrections
  are separate attested addenda; the original note is never edited.
- An authoritative lab chain now persists provider orders, specimen identity,
  immutable preliminary/final/corrected result versions, atomic observations,
  critical-value alerts, licensed review, and held/released patient visibility.
  Nursing may collect and record results but cannot sign or release them.
- A Google busy-only adapter that imports no titles, attendees or clinical
  content and refuses to run without approved service-account configuration.
- Durable membership and payment-reconciliation schema foundations. The Clover
  transport still refuses every money-moving operation until sandbox and
  merchant acceptance are complete. Membership create/pause/resume/cancel now
  commits with an immutable lifecycle event and audit witness; itemized invoice
  issue uses integer cents, stable retry ids, fixed totals, immutable lines and
  a role-scoped client Billing tab. Collected cash remains zero until an actual
  processor result is reconciled—an invoice never pretends that a card moved.
- Authoritative inventory now starts at verified lot receiving and computes
  stock exclusively from immutable movements. Cycle counts, waste, atomic
  inter-clinic transfers and patient dispenses preserve lot/expiry evidence;
  controlled dispenses require a matching active prescription, DEA evidence
  and current clear PDMP evidence. Recall notices immediately stop matching
  lots across clinics and expose the affected-patient list only inside the
  actor's assigned clinics. Seeded charts below the lot ledger are visibly
  labeled planning fixtures rather than stock-on-hand evidence.
- Authoritative patient ordering now uses the authenticated actor and scoped
  patient directory rather than demo identities. One stable request commits the
  order, immutable priced lines, initial status events, audit witness, and any
  MedSource handoff intent atomically. Coaches/providers can see only in-scope
  obligations; fulfillment can apply only forward status changes with actor,
  reason, carrier, and tracking evidence. The same worklist is present in the
  coach order board and Supply Chain.
- CI gates for typecheck, requirements, migration consistency, lint, build,
  container build, dependency audit, API/UI smoke, and WCAG contrast.
- A source-to-evidence acceptance ledger in
  `docs/CUTOVER_REQUIREMENTS_MATRIX.md`; static readiness cannot be confused
  with vendor, roster, rehearsal, pilot, or go-live approval.

## Not ready to enable

- The broad demonstration `/portal/*` experience still reads seeded data and
  remains behind staff EasyAuth. It must not replace the database-only patient
  pilot until each enabled feature has an authoritative read model.
- The database-only `/patient` pilot now supports authoritative messaging to the
  assigned coach. Patient self-book/reschedule/cancel, attachments, coverage
  operations and live notification transports remain launch blockers for those
  features.
- The importer does not yet move the full historical V1 clinical/financial
  graph. It currently translates identities and 75 linked consult/progress-note
  records and privately retains the 346 ambiguous items above. Purchases,
  memberships, messages, intake/consent, documents, routed orders, shipments,
  lots/inventory events, invoices and audit history still require accepted Apex
  translations and reconciliation. V1 must remain available until that scope is
  completed or explicitly accepted as read-only legacy history.
- Live Google, Clover, ACS SMS/email, MindBody, and GHL credentials/exports are
  not present in the repository and cannot be inferred.
- MedSource/UPS fulfillment credentials, shipment webhooks, cold-chain
  temperature evidence, reorder policy and daily vendor reconciliation remain
  external or unfinished; the authoritative lot ledger does not pretend those
  integrations are live.
- Live laboratory vendor interfaces, result-message authentication, report-file
  storage, corrected-result reconciliation, and clinic acceptance are external;
  the current staff UI provides an explicit manual exception path into the same
  held-for-provider-review lifecycle.
- Private clinical attachment storage, malware scanning, report-file retention,
  and patient-copy delivery still require the Azure Blob service and policies;
  no browser-local or public-URL substitute is treated as complete.
- The employee roster does not contain working hours, license numbers, license
  expiry, state scope, or supervision relationships.
- Atomic NCV code is therefore intentionally unable to offer a real slot until
  those approved roster facts are loaded; an hours exception cannot override a
  collision, missing credential, inactive staff record, or wrong clinic.
- Rooming is also intentionally blocked until operations verifies and enters
  the real facility register for every launch clinic. The old room map remains
  visibly labelled as a planning fixture and is not an authority.
- The four conflicting/unspecified scheduling policies in the runbook require
  an owner decision.

The current state is suitable for an isolated migration rehearsal and staff
acceptance testing. It is not yet a production go-live state.
