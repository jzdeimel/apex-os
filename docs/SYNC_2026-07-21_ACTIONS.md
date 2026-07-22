# Apex changes from the 2026-07-21 project sync

Source: `Alpha Health OS | Project Sync`, Paul Kennard + Matt Chilson + Zack Deimel,
1h56m. This file turns that call into changes against **this repo only** (`jzdeimel/apex-os`).
MedSource / Nexus asks from the same call (time clock, split batch, fulfillment role,
quote builder) are listed at the bottom and do **not** belong here.

## The thing that changes everything

Apex stopped being a parallel R&D track on this call. The agreed release plan is:

| Date | Release | Platform |
| --- | --- | --- |
| Fri **Jul 24** | Alpha OS V1 — ACS calling, intake paperwork, MedSource features | V1 (not Apex) |
| Fri **Jul 31** | **Bug fixes only.** Explicitly no enhancements. | V1 |
| Fri **Aug 7** | **"V2 data structures + foundation release"** — Apex underneath, V1 skin, full EMR, client-portal pilot (~10 patients + coaches-as-patients) | **Apex** |

So Apex has ~2.5 weeks to go from "demo with synthetic patients" to "system of record
holding real PHI for a live clinic." Every P0 below follows from that one fact, not from
a feature preference.

---

## P0 — blocks Aug 7

### 1. Patient authentication does not exist
`lib/auth/principal.ts` says it plainly: *"This is STAFF auth… Patients do not have
@goalphahealth.com accounts and cannot sign in."* On the call the client portal login was
bypassed for demo. Aug 7 puts ~10 real patients **plus coaches logging in as patients**
into that portal.

- Decide patient identity **this week** — Entra External ID (CIAM) vs magic-link + passkey.
  Recommendation: **magic link + passkey** for the pilot. CIAM is the right long-term
  answer but it's a second user store, a second consent posture and a second session
  lifetime; that is not a 2-week task alongside everything else. Ship magic link now,
  keep the port shaped so CIAM slots in.
- "Coach as a patient" (Matt's ask, accepted) means one human with a staff Entra identity
  **and** a client record. Design that as two identities linked by an explicit mapping —
  never as a role that can see both. A coach logged in as a patient must not carry staff
  scope into the portal.
- Pilot test accounts need a `synthetic: true` marker so they don't pollute population
  health, capacity or revenue analytics.

### 2. Owner-console feature toggles were promised and do not exist
On the call (01:07:49): *"from the owner console, you'll be able to turn on and off
features at will for coaches and clients… you don't have to do anything in Azure."*
`grep -r featureFlag` returns nothing. This is also the mechanism for the whole
"skin it and turn off what Matt doesn't want" plan, so it is load-bearing twice.

Build:
- `feature_flag` table — key, scope (`global | role | location | client | staff`),
  target id, enabled, updated_by, updated_at.
- Server-side evaluation. A hidden nav item is not a disabled feature — the route must
  403 server-side when its flag is off, and `lib/nav.ts` reads the same evaluator.
- Every toggle writes a ledger row. "Who turned off consent capture and when" is an audit
  question.
- Owner UI under `/exec` (not `/settings`, which is currently a read-only config view).

### 3. V1 skin + a subtraction preset
Paul's framing: *"V2 underneath with similar enough skinning that we're not asking people
who learned stuff in the last two weeks to relearn anything."* Zack's own words:
*"I'd rather subtract than add."*

- Define a **`clinic-v1` flag preset**: the Aug 7 release turns on only the V1 feature set
  + intake + the client portal. Everything Apex-only ships dark.
- Candidates for default-off: `app/community`, `app/portal/community`, `app/coach/community`,
  `app/clinic/community`, `app/desk/community`, `app/exec/community`, the whole
  `lib/play/*` gamification stack (levels, quests, season, streak, leaderboard),
  `app/swarm`, `app/agent`, `app/portal/explore`, `app/portal/learn`, `app/portal/library`,
  `app/portal/refer`, `app/coach/winback`, `app/insights`.
- Nav parity with Alpha OS V1 for the coach surface specifically — coaches have spent two
  weeks learning V1 and Matt's stated fear is *"we're going to be inundated with coaches
  asking questions if we put too much out at once."*

### 4. Real-data migration + PHI hardening — the sleeper risk
Nothing in the plan covers getting the existing patients **into** Apex, and on Aug 7 Apex
becomes the system of record. Also the standing rule "do not copy real PHI into Apex"
expires that day, which invalidates the current security posture:

- Rotate the Postgres password (`ApexDemo2026Rotate` is burned in chat history) into Key
  Vault, app reads it via managed identity.
- Postgres firewall is `AllowAzureServices` only — move to private endpoint / VNet before
  real PHI.
- Verify PITR + a **restore rehearsal**, not just that backups are configured.
- Re-check every unauthenticated surface once data is real: `/api/public/intake`,
  `/api/public/leads`, `/api/health`, `/api/audit`, `/card/[token]`, `/intake/[token]`.
  The token surfaces are hash-stored and expiring (good); the audit route reads the whole
  universe, so confirm its principal check is enforced and not just imported.
- Idle logout (see #11) is a HIPAA control the team already agreed to for MedSource; Apex
  is the one actually holding PHI.

### 5. Intake: coach-guided is now the primary path
Decision (00:29:01): *"I believe the quality of the intake process will be better if it is
guided by the coach."* Today Apex only has the tokenized self-serve link
(`app/intake/[token]`, `lib/intake/mint.ts`).

- Add a staff-side intake runner (`/coach/intake/[leadId]`) over the **same form
  definition**, recording `mode: coach-guided | self-serve` and `capturedBy: staffId`.
- Keep the link path — Paul described the second journey (the patient who books a blood
  draw directly gets the link in advance, and the coach reviews it with them on arrival).
- **The patient must sign, not the coach.** A coach typing the patient's name into a
  signature field is not a signature and will not survive scrutiny. Hand-off the device or
  send a signing deep link; capture that step's own IP / user-agent / timestamp.
- Human-in-the-loop initiation (admin enters name/email/phone → "send intake paperwork" →
  SMS + email) is a **stopgap because scheduling still lives in GoHighLevel**. Build the
  trigger as *appointment-type-driven* with the manual button as the fallback, so removing
  GHL later removes the human and not the code.

### 6. The five clinical must-knows, structured and append-only
Paul's list (00:26:46): allergies · missing organs · surgical history · major diseases ·
cancer + immediate-family history. Today intake answers land as opaque `jsonb` on
`intakeSubmission.history` and are never exploded into `allergy` / `problem`.

- Promote all five to structured, queryable records at lead→client conversion.
- Make them a required checklist on the coach's intake screen, with a
  "reviewed with patient by <coach> at <time>" attestation — that attestation is the whole
  reason Paul wants a human in the room ("oh yeah, I had liver cancer, I didn't think you
  wanted to know about that").
- Surface them at the top of the nurse and provider views.

### 7. Append-only must be enforced, not documented
Paul made this a governance rule (01:29:13) with the penicillin example: allergy stated in
January, retracted in July — you change the current answer and **never lose that they told
you both things**. Apex is halfway: `allergy.endedAt`, `problem.resolvedOn` and the ledger
exist, but nothing prevents an in-place UPDATE.

- Repo-layer rule: clinical facts are INSERT-only; correction = new row + `supersededBy` /
  `endedAt` on the old one.
- Enforce it in Postgres — revoke UPDATE/DELETE on the clinical tables from the app role.
  A rule enforced by convention is a rule that gets broken at 11pm.
- Build the **history view** in the UI. Paul will ask to see exactly his penicillin
  example on Aug 7; being able to demo "stated allergic 2026-01-14 by X → stated not
  allergic 2026-07-14 by Y" is worth more than any other five minutes of that demo.

### 8. Two-part visit + lab-draw queue
Matt's flow (01:26:33): intake submitted → **lab draw queue** → nurse opens the record,
sees everything pulled from intake, adds vitals (BP, resting HR, notes), saves =
**part 1** → doctor does the H&P = **part 2**, which completes the appointment → admin
enters returned labs into the patient profile (API later).

Apex has a single `appointment.status` + `completedAt`, and the front-desk encounter
journal (`lib/frontdesk/encounters.ts`) is explicitly non-persistent. There is **no vitals
model anywhere in the repo** (`grep systolic` → nothing).

- `encounter` table with named segments, each with its own performer, timestamps and
  sign-off. The appointment is not complete until both segments are.
- `vitals` table (BP systolic/diastolic, HR, weight, temp, notes, taken_by, taken_at).
- `history_physical` record, provider-signed.
- Lab-draw queue surface for the nurse role. `lib/labs/ingest.ts` already handles PDF →
  canonical markers with human confirmation — wire the admin's "labs are back" path to it.

### 9. Provider routing — and the "same provider closes the loop" rule
Matt (00:33:47): the H&P provider **must be the same provider who writes the plan of
care**. Coverage is a function of location × modality × patient sex:
Bal = Myrtle Beach local + telehealth · Holly = Myrtle Beach local females ·
Chris Dominguez = Southern Pines local + telehealth. Stephanie's requirements doc adds
state-level rules (Ohio was called out).

Apex has `staff.locationIds` and licensure checks in `lib/booking/availability.ts`, but no
sex/panel dimension and no continuity invariant.

- `provider_coverage` table: staff_id, location_id, modality (`in-clinic | telehealth`),
  patient_sex (`any | female | male`), licensed_states[].
- `assignProvider(client, visit)` resolver; booking and escalation routing both read it.
- Enforce at plan-of-care signature: `planOfCare.providerId === hp.providerId`, or an
  explicit re-attestation by the new provider. Silent substitution is the failure mode.

### 10. Telehealth patient ≠ telehealth visit
Paul was explicit (00:32:30): a *telehealth patient* lives too far from a clinic, is its
own clinic with its own coach (Mark). A Raleigh patient doing a video visit is **not** a
telehealth patient. Apex models telehealth as a location
(`lib/mock/locations.ts` id `telehealth`, type `virtual`), which conflates the two.

This is not cosmetic — it routes money. See #11: charges go to the merchant account of the
patient's clinic, and a Raleigh patient filed under "telehealth" for one video visit would
bill the wrong clinic.

- Split into `client.homeLocationId` (the clinic that owns the relationship; `telehealth`
  is a valid value as a panel) and `appointment.modality: in-person | virtual`.
- `appointment.patientState` already exists and drives licensure — keep it, it's right.

### 11. Clover, four merchant accounts, one per clinic
Paul (00:41:28): four Clover merchant accounts approved, API docs and keys coming.
Charges must hit the merchant account of the **patient's clinic**. This closes the open
"payment processor TBD, explicitly not Stripe" decision.

- `lib/payments/port.ts` `ProcessorName` is `"unconfigured" | "braintree" | "adyen" |
  "authorize-net" | "demo"` — add `"clover"` and write `lib/payments/clover.ts`.
- The merchant account must be a **parameter resolved from the patient's clinic**, not a
  global config value. Add `location.merchantAccountId`.
- Daily revenue reporting reconciles per merchant account.
- Keep the port's existing rules: no PAN ever, integer cents, idempotency key on every
  mutating call. Those are already correct — don't let the Clover adapter erode them.

---

## P1 — same release if it fits, next sprint if not

### 12. Patients must not message medical directly
Paul (00:53:28): some doctors are available four hours a month and are functionally
stamping prescriptions. The coach is the front door; the coach escalates.
`app/portal/messages/page.tsx` currently ships the member **two** threads — `t-coach` and
a provider thread ("Your provider · clinical questions"). That directly contradicts the
decision.

- Member side: one coach thread. Put the provider thread behind a flag, default off.
- Coach side: "Push to medical" on any message → creates an escalation
  (`lib/escalations/*` already has SLA math and state transitions) carrying the quoted
  message and the client context.
- Member sees the status, not silence: "your coach asked the medical team — expect an
  answer by <SLA>."
- Zack also promised newest-at-top waterfall ordering in this thread view.

### 13. Order routing is three-way, not two-way
Paul's rules (00:55:20–00:57:36):
1. MedSource carries it and it needs no provider → **coach orders it directly** (GHK).
2. Needs a prescription → **provider queue**.
3. MedSource does *not* carry it (PT-141) → **must go to an outside pharmacy** with a real
   prescription.

Apex has `requiresProviderApproval` and `fulfillment: "medsource" | "in-clinic" | "none"`
— the third path has nowhere to go, and there are no state rules.

- Add `fulfillment: "external-pharmacy"`.
- Add `allowedStates` / `restrictedStates` to `CatalogItem`.
- `routeRequest(item, client, actor)` → `coach-orderable | provider-signature-required |
  external-rx`, enforced in `lib/orders/place.ts`. Not in the UI — the UI is where rules go
  to be bypassed.

### 14. HCG sell-through
Decision: MedSource stops distributing HCG once the current batch is exhausted. The
catalog has `active` / `retiredOn`, which can't express this.

- Add a `sell-through` lifecycle state: fillable from existing inventory, blocked from
  reorder, auto-retires at zero on hand.
- Flag it as a controlled substance so `lib/clinical/controlled.ts` and the `pdmpCheck`
  path apply. It ships from North Carolina — that constraint belongs on the item.

### 15. Google Calendar as the availability source — with one correction to make
Decided: staff availability comes from Google Calendar. Apex derives availability from
`lib/mock/shifts.ts`.

**Correct the record with Paul before building.** On the call the claim was that Google's
native "work hours" setting can be read by the system. Calendar API v3 exposes *freebusy*,
*events*, and the `workingLocation` / `outOfOffice` / `focusTime` event types — the
per-user **working-hours setting** is not a documented public read. Verify before it
becomes a commitment. The safe design, which also matches how Paul described it:

- Working hours live **in Apex**, per staff × weekday × location, seeded from the
  spreadsheet Paul owes.
- Google Calendar supplies **exceptions** — vacation, personal appointments, OOO — via
  freebusy.
- Keep the existing invariant in `lib/booking/availability.ts`: never offer a slot that
  doesn't exist. It is the best thing in that module.
- Scheduling a new-client visit must satisfy coach **and** nurse (blood draw) **and**
  provider (H&P) availability, not just the coach's.

### 16. Real staff roster
Apex ships 24 synthetic staff (Dr. Marcus Vale et al.). Paul's spreadsheet has first/last/
department/location/notes; he owes work hours and gym exclusions.

- Seed the DB `staff` table from the real roster — that table is already the authority
  (`mapToStaff` reads DB-first), so this is a data task, not a code one.
- Add `department`, `excludeFromScheduling` (Alpha Gym staff — "ignore, not relevant to
  this system"), and working hours.
- Raleigh needs splitting into Raleigh and **Raleigh DC (Douglas Carroll)**. The repo has
  `raleigh` (701 Mutual Ct) and `raleigh-boutique` (6325 Falls of Neuse) — confirm which
  is DC and rename to match what staff actually call them.
- AHQ is corporate, not a clinic. Paul: *"those people don't do anything useful."*
- Zack owes Paul the list of roles the system supports.

### 17. V2 → V1 / MedSource data transform
Committed on the call (01:09:06): MedSource stays on V1 longer because it has no external
users, and Apex will transform its data into something V1 and MedSource can read. Nothing
in the repo does this.

- Export adapter + scheduled job. `lib/orders/medsource.ts` is the model to follow — pure
  functions over data, transport at the edge.
- The **reverse** direction (V1 → Apex backfill) is the one that isn't in anyone's plan and
  is on the critical path for Aug 7. See #4.

---

## P2 — real, but not before Aug 7

### 18. Idle logout + session policy
Agreed for HIPAA. Do it at the platform, not with a client-side timer — a JS timer that
hides the UI while the EasyAuth cookie stays valid is theater. Set the Container App auth
session lifetime, add a 15-minute idle timeout on clinical surfaces with a warning at 13,
an absolute session cap, and re-auth for signature actions.

### 19. Staff time clock — keep it out of the clinical ledger
Zack offered Apex's activity logging as the answer to Matt's time-clock ask. Worth being
precise: **login times are an estimate, a timesheet is a payroll record**, and someone gets
paid from it. Own table (`time_entry`: staff_id, clock_in, clock_out, source
`auto | manual`, edited_by, edit_reason), auto-close on idle logout, manual edit with a
required reason and its own audit row. Do not thread payroll data through the hash-chained
clinical ledger.

Related honesty item: on the call the claim was *"every click, every action is attached to
a client's profile."* Today the ledger persists durably for consult co-sign, task complete
and order create; `lib/trace/ledger.ts` is otherwise a module-scope array
(`lib/frontdesk/encounters.ts` says so in its own docblock). Either build the real
access/activity log — HIPAA disclosure accounting genuinely wants one — or soften the
claim. Don't leave it standing as-is.

### 20. Signature module, covering contracts too
Zack committed to DocuSign-equivalence: the document cannot be altered after signing, and
the signature is bound to that exact document. `consent` already has `documentVersion`,
`textSha256`, `signatureName`, IP and user-agent — good bones. Missing:

- An archived render (PDF) of exactly what was shown, in Blob, hashed.
- An audit certificate appended to it (who, when, IP, UA, document hash).
- The patient's copy in `/portal/consents` and emailed. Paul asked whether patients must
  get a copy; Matt: *"I don't recall ever giving anything to a patient."* Give them one.
- **Contracts, not just clinical consents.** Matt: Alpha plan contracts went out through
  MindBody "half the time it got sent, half the time it didn't." One
  `document` + `signature_request` model covers consent, contract and attestation.
  Extend `lib/documents/types.ts` rather than inventing a second thing.

### 21. Versioned intake form definition
Paul is running the male + existing forms through Claude to de-duplicate, producing a
multi-tab doc; the female version follows; both go to Stephanie. Requirements land as early
as Wednesday. Today the intake questions are effectively hardcoded (`lib/mock/intake.ts`).

Move to a **versioned JSON form definition** now, and stamp every submission with the form
version it answered. Do it before the deduped forms arrive and they're a data drop; do it
after and they're a rewrite. This also makes "which version of the consent did this patient
actually sign" answerable, which #20 needs anyway.

### 22. Branding vocabulary
Company is now **Alpha Health**; product lines are **Alpha Men** / **Alpha Women** plus
ungendered lines; "Alpha Chicks" is retired. The repo is clean (`grep` finds no
occurrences) — the work is making the catalog `ServiceLine` vocabulary and any contract
templates ingested from MindBody use the new names, so merchandising and the system agree.

### 23. GoHighLevel replacement feature list (owed to Paul)
Zack committed to writing this. Most of it already exists in some form —
`lib/exec/leads.ts`, `app/api/public/leads`, `lib/comms/*`, `app/automations`,
`app/exec/marketing`. The deliverable is a doc mapping each GHL capability → Apex module →
status: email marketing, campaigns with end-to-end UTM attribution, mass SMS,
DNC/opt-out handling, forms on existing marketing sites, booking widgets, pipelines.

Note Paul's actual anxiety: email marketing lives in MindBody today and he called
rebuilding it "a heavy lift." Lead with what's already built.

### 24. Things to deliberately NOT build
- **Plan of care builder** — explicitly deferred past V2. The existing template path
  (`lib/planOfCare/engine.ts`) is enough; intake must run *up to* a completed plan of care,
  not replace how it's authored.
- Community, gamification, referrals, winback — nobody asked for them and they undercut
  "would we trust this with a real patient." Ship dark, keep the code.

---

## Not this repo (MedSource / Nexus)

Time clock UI · split batch (two-phase prep with freezer/fridge temp+time logging, average
packages/week, percentage overage buffer, rat-card count) · fulfillment specialist role
(pipeline read-only, shipping screen full access, hide crate/label screen) · quote builder
/ capital request (vendor default COGS multiplier + per-product override → PDF artifact) ·
UPS API security escalation.

Two of these have Apex analogues worth keeping in sync: the fulfillment specialist is the
same read-only-role problem as #2's flag scoping, and the quote builder's vendor pricing
model is the same shape as `CatalogItem.unitPriceCents` + a vendor multiplier.

## Decisions this call resolved (update the record)

- Payment processor: **Clover**, four merchant accounts, one per clinic. No longer TBD.
- Apex is the **Aug 7 V2 platform**, skinned as V1. No longer parallel-until-further-notice.
- Apex **will** hold real PHI from Aug 7. The synthetic-data-only rule expires with it.
- Calendaring: **Google Calendar**, replacing MindBody→GHL replication.
- Still open: patient identity mechanism (#1), and how much of Stephanie's routing
  requirements doc changes #9.
