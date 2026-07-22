# V2 (Apex) — buildable task list

> Status note (2026-07-22): this is the original task breakdown. Use
> `READINESS_STATUS.md` for the live readiness state and `CUTOVER_RUNBOOK.md` for
> execution. The isolated Apex non-production environment is available and the
> automated contrast sweep currently reports zero failures.

Scoped to `jzdeimel/apex-os` only. Everything here can be started **without waiting on
Paul, Matt, Stephanie, Clover, MindBody or a carrier**. Blocked items are marked and
parked at the bottom.

Companions: `SYNC_2026-07-21_ACTIONS.md` (what the call implies) ·
`AUG7_CUTOVER.md` (release plan and external risks).

---

## Status — 2026-07-21

**Landed** (typecheck clean, production build passes, 24 logic checks pass):

| Task | What exists now |
| --- | --- |
| T1 | Surface freeze encoded as data, not prose — `lib/features/catalog.ts`, the `clinic-v1` preset |
| T2 | Feature flags end to end: `feature_flag` table + migration `0006`, pure evaluator, request-cached server resolution, **21 route layouts gating server-side**, nav + bottom-nav filtering, ledgered write API, owner console at `/exec/features` |
| T5 | `CredentialClass` split from `StaffRole` (`lib/scheduling/credentials.ts`); all 24 seeded staff annotated |
| T21 | Lab Draw no longer bookable by Admin; credential tiers enforced at all three candidate-list sites |
| T9 | Stephanie's NCV matrix as data + priority resolver + coverage gaps (`lib/scheduling/ncv.ts`) |
| T4 | `Appointment.modality` split from `locationId`; stale "telehealth is one of our five locations" copy removed |
| T6 | `lib/clock.ts` exists — the real clock. **The 52 pinned-`NOW` modules have NOT been migrated yet**; see the migration-shape note in that file for the order that works |
| T13 | Intake is a **versioned, hashed form definition** (`lib/intake/formDefinition.ts`); `intake_submission` records `form_version` + `form_sha256` + `mode` + `captured_by` (migration `0007`); the public endpoint validates against it server-side |
| T15 | Paul's five must-knows are first-class and required. **Three did not exist on the form at all** — missing organs, surgical history, cancer + family history |
| T18 | Member→provider thread is behind `member-provider-thread`, **off in every preset**; replaced by `POST /api/messages/escalate` — a real escalation with a real SLA, ledgered, returning a member-facing "you'll hear back by X" |
| T19 | Three-way routing (`lib/orders/routing.ts`): coach-orderable / provider-signature / **external-rx**, plus state rules. Enforced as RULE 5 in `place.ts`, not rendered as fine print |
| T20 | hCG is `lifecycle: "sell-through"` + `controlled: true` — fills from stock, blocks at zero, never reorders |
| T10 | **Encounters**: `encounter` + `encounter_segment` + `vitals` + `history_physical` (migration `0008`), pure lifecycle in `lib/encounters/lifecycle.ts`, repo writes, and two API routes (`/api/encounters/vitals`, `/api/encounters/hp`). A visit completes only when its segments do |
| T11/T12 | Lab-draw queue at `/clinic/lab-draws` (reads Postgres, refuses to fake it) and NCV coverage at `/clinic/coverage` (names which credential is missing, and who the single point of failure is) |
| **V1 skin** | The palette is now variable-driven (`app/globals.css` + `tailwind.config.ts`), so `data-skin="v1"` reskins all 75 pages without touching them. Under the `clinic-v1` preset Apex renders as V1 does: **light canvas `#f7f7f8`, dark rail `#16181c`, V1's status colours**, V1's vocabulary in the nav. Verified visually against the standalone server |

**Routes are NOT aliased.** An earlier pass added 52 V1→Apex redirects; they were removed
on instruction. Apex keeps its own URLs — this is a skin, not a port.

**Verified, but not yet in CI.** The 24 checks cover flag precedence (including the
Aug-7 pilot shape: global off, on per client), same-scope fail-closed, credential
parsing, and the NCV resolver's three-member / two-member / blocked cases. They ran
against the compiled modules; the repo has no test runner, so wiring them in is its own
task at the bottom of this list.

| T7 | Lab ingest takes the actor as a required argument instead of stamping `VIEWER`; front-desk ownership is now a **role**, not a comparison against one hardcoded id. `useCurrentStaff()` resolves the real identity in client components |
| T23 | `lib/mock/roster.ts` — all 29 real staff, mapped **onto existing `st-00N` ids** so `/api/audit` still closes. Five have no seat and say so; three carry `credentialClass: null` because "Nurse" does not distinguish RN from LPN |
| T22 | `ProcessorName` includes `clover`; `lib/payments/clover.ts` refuses rather than simulating; **merchant account is a required parameter on every money call**, resolved from the patient's home clinic (`lib/payments/merchants.ts`) |
| T17 | **Migration `0009`** — Postgres triggers making allergy/problem append-only, vitals and signed H&Ps immutable, and the ledger un-editable. Plus `lib/clinical/history.ts`, which answers Paul's penicillin question directly |
| T16 | `lib/documents/signing.ts` — one model for consent, contract and attestation; document hashing, the E-SIGN evidence tuple, an audit certificate, and tamper detection on read |
| T4 | `Client.locationId` documented as the owning clinic (telehealth is a valid *panel*); `billingLocationFor` refuses to guess which clinic a telehealth patient's money belongs to |
| CI | **`npm run spec` — 69 checks, gating.** No test framework: Node 22 strips types and `scripts/alias-hooks.mjs` supplies `@/` in 30 lines, so they run against the same source the app imports |

### Still open

| Task | Why it is not done |
| --- | --- |
| T14 · Coach-guided intake runner UI | Schema and validation are complete (`mode`, `captured_by`, server-side must-know enforcement). The **wizard UI** is not built — it is a substantial form-rendering job against the versioned definition |
| T8 · NCV as a bookable composite | The resolver, the credential tiers and the encounter segments all exist and are verified. What is missing is the **booking screen** that calls them |
| T6 · The pinned clock | `lib/clock.ts` exists; the 52 modules still anchored to `const NOW = "2026-06-12"` have not migrated. Deliberate — most are seeded-read modules whose fixtures are pinned to that date, and cutting them loose before their data moves to Postgres produces screens that are live and meaningless |
| Contrast residual | 142, ~3 per page, all text on saturated or dark chips. Each needs a per-component decision rather than a token change. `npm run contrast` lists them |

---

## Read this before picking a task

Eleven working days to freeze (Wed Aug 5), two of them consumed by V1 releases. The list
below is longer than that. **The scope cut in T1 is what makes the rest fit** — it decides
how many of the 75 pages have to become real, and every hour spent there saves days later.

The measurement that should drive the cut:

| | |
| --- | --- |
| Pages in the app | 75 |
| Pages reading `lib/mock/*` | 40 |
| Files with a pinned demo clock (`const NOW = "2026-06-12…"`) | 52 |
| Files using `seededRandom` | 58 |
| Functions in the real DB layer (`lib/db/repo.ts`) | 27 |

Every page in the Aug 7 preset needs a real clock, a real actor, and a real read path.
Every page **outside** it needs a flag set to off. That is the whole strategy.

---

## Wave 0 — do first; these shrink or unblock everything else

### T1 · Freeze the Aug 7 surface  ▸ half a day, not code
List the pages that ship on Aug 7. Everything else goes dark behind a flag. Proposed keep
list: coach roster + consults + orders, clinic sign/escalations/ledger, desk day/rooms/
walk-in/book, intake, portal (protocol, labs, messages, consents, documents, receipts,
book-visit, journal), exec dashboards, schedule, clients, tasks. Proposed dark list:
`community` (×5 surfaces), the whole `lib/play/*` gamification stack, `swarm`, `agent`,
`portal/explore`, `portal/learn`, `portal/library`, `portal/refer`, `coach/winback`,
`insights`, `recommendations`. **This list is the input to every estimate below.**

### T2 · Feature flags + the `clinic-v1` preset  ▸ 1 day
`feature_flag` table (key, scope `global|role|location|client|staff`, target, enabled,
updated_by). Server-side evaluator — a route whose flag is off must 403 server-side, not
merely vanish from `lib/nav.ts`. Owner UI under `/exec`. Every toggle writes a ledger row.
Does triple duty: the promise made on the call, the V1 skin, and the pilot gate.

### T3 · `ca-apex-dev`  ▸ 2 hours
Second Container App + its own Postgres in `apex-prod`. The roadmap has a QA gate at noon
Aug 6 and Matt is the tester; right now the only place to test is production.

---

## Wave 1 — model changes everything else sits on. Do before building features on top.

### T4 · Telehealth: location → modality  ▸ half a day  ⟨REWORK⟩
Split `client.homeLocationId` (a clinic, or `telehealth` as a panel) from
`appointment.modality: in-person | virtual`. Confirmed twice: Paul on the call, and the
roster — nobody is *located* at telehealth; Jerry Cattelane and Marc McCully both sit at
Myrtle Beach. Routes money (per-clinic merchant), providers and coaches. Also delete the
member-facing string in `lib/booking/availability.ts`: *"Telehealth is one of our five
locations, not a fallback."*

### T5 · Credential class, separated from `StaffRole`  ▸ 1 day  ⟨REWORK⟩
`StaffRole = "Admin" | "Coach" | "Medical"` (`lib/types.ts:35`) cannot express Stephanie's
matrix — it makes a Medical Director and a nurse the same resource, which inverts her
"lowest appropriate license" principle. Add `CredentialClass = RN | LPN | NP | PA | MD |
DO | Coach`, resolve scheduling by credential, keep `StaffRole` for app authorization
only. `staffCredential` already has the right columns and sits empty.

### T6 · Real clock  ▸ 1–2 days, scoped to T1's keep list  ⟨REWORK⟩
52 files pin `const NOW = "2026-06-12T09:00:00"`. A system of record cannot have a
hardcoded present. Route every one on the keep list through a single `now()` that honours
the location timezone, and keep the pinned value only under `IS_DEMO` for `/demo`.
**Re-run the timezone sweep afterwards** — this is exactly the class of change that
resurfaces the UTC hydration bug.

### T7 · Real actor  ▸ half a day  ⟨REWORK⟩
`lib/labs/ingest.ts` stamps ledger rows with `VIEWER.id`; `lib/escalations/queue.ts` hard-
codes `ME_PROVIDER = "st-001"`; `lib/frontdesk/scope.ts` and `lib/access/clientScope.ts`
compare against `VIEWER`. Every one of those must read `currentPrincipal()`. A ledger row
attributed to a constant is worse than no ledger row — it is a false attestation about who
touched a record.

---

## Wave 2 — the New Client Visit. Biggest single build; spec is finally specific enough.

### T8 · Composite NCV appointment  ▸ 1 day
One booking, three linked components (Coach Intro → Lab Draw → Physical), same day, same
location, each with its own resource and its own completion. Not three bookings the front
desk keeps in step by hand.

### T9 · Priority-ordered resource resolver  ▸ 1 day
Coach only (no substitution) · Lab draw: RN/LPN → NP/PA · Physical: NP/PA → Physician.
Handle the **two-team-member model** — when no nurse is available one NP/PA performs both
clinical components without being double-booked against themselves. Expired
`staffCredential.expiresOn` = not schedulable. If neither priority tier exists that day,
**say so** instead of offering the slot.

### T10 · Encounter segments + vitals + H&P  ▸ 1–2 days
`encounter` with named segments, each with performer, timestamps, sign-off; appointment
completes only when all segments do. `vitals` table (systolic, diastolic, HR, weight,
temp, notes, taken_by, taken_at) — **there is currently no vitals model anywhere in the
repo**. `history_physical`, provider-signed.

### T11 · Lab draw queue  ▸ half a day
Nurse-facing queue; opening a member shows everything pulled from intake so the only new
input is vitals. `lib/labs/ingest.ts` already does PDF → canonical markers with human
confirmation — wire the admin's "labs are back" path into it.

### T12 · NCV coverage view  ▸ half a day
Per location per day: is a New Client Visit bookable, and if not, **which credential is
missing**. Raleigh and Southern Pines each have exactly one coach and no local physician —
today that failure is discovered by a booked patient who cannot be seen.

---

## Wave 3 — intake → plan of care. The other headline.

### T13 · Versioned intake form definition  ▸ half a day · **DO THIS BEFORE THE REQS LAND**
Move the questions out of code into versioned JSON; stamp every submission with the form
version it answered. Paul's de-duplicated male/female forms are coming this week. Do this
first and they are a data drop; do it after and they are a rewrite. Also makes "which
version did this patient sign" answerable, which T16 needs anyway.

### T14 · Coach-guided intake runner  ▸ 1 day
`/coach/intake/[leadId]` over the same form definition, recording `mode: coach-guided |
self-serve` and `capturedBy`. Keep the token link for the patient who books a draw
directly. **The patient signs, not the coach** — device handoff or a signing deep link,
capturing its own IP/UA/timestamp. A coach typing the patient's name into a signature
field is not a signature.

### T15 · The five must-knows, structured  ▸ half a day
Allergies · missing organs · surgical history · major diseases · cancer + family history.
Today they land as opaque `jsonb` on `intakeSubmission.history` and are never exploded into
`allergy`/`problem`. Required checklist on the coach screen with a "reviewed with patient
by X at Y" attestation; surfaced at the top of the nurse and provider views.

### T16 · Signature + document module  ▸ 1–2 days
Archived render of exactly what was shown (Blob, hashed), audit certificate appended
(who/when/IP/UA/doc hash), patient's copy in `/portal/consents` and emailed. Cover
**contracts**, not just clinical consents — Alpha Plan contract documents are a named Aug 7
roadmap line, and Matt says MindBody sent them "half the time." Extend
`lib/documents/types.ts`; `consent` already has `documentVersion` + `textSha256`.

### T17 · Append-only enforcement + history view  ▸ 1 day
Clinical facts INSERT-only; correction = new row + `supersededBy`/`endedAt`. Enforce in
Postgres by revoking UPDATE/DELETE from the app role — a rule kept by convention is a rule
broken at 11pm. Then **build the timeline UI**: "stated allergic 2026-01-14 by X → stated
not allergic 2026-07-14 by Y." Paul will ask to see his penicillin example on Aug 7; this
is the highest-value five minutes of that demo.

---

## Wave 4 — decided on the call, small, cheap while they're cheap

### T18 · Messaging  ▸ half a day  ⟨REWORK⟩
`app/portal/messages/page.tsx` gives members **two** threads including
"Your provider · clinical questions". Decision was the opposite: coach is the front door.
Provider thread behind a flag, default off. Coach-side "Push to medical" → escalation
(`lib/escalations/*` already has SLA math) carrying the quoted message. Member sees status,
not silence. Newest-at-top waterfall ordering, as promised on the call.

### T19 · Order routing, three-way  ▸ half a day  ⟨REWORK⟩
Add `fulfillment: "external-pharmacy"` (PT-141 — MedSource doesn't carry it, so it needs a
real Rx to an outside pharmacy) and `allowedStates`/`restrictedStates` on `CatalogItem`.
`routeRequest(item, client, actor)` → `coach-orderable | provider-signature-required |
external-rx`, enforced in `lib/orders/place.ts`. Not in the UI — the UI is where rules go
to be bypassed.

### T20 · HCG sell-through  ▸ 1 hour
Catalog lifecycle state between active and retired: fillable from existing stock, blocked
from reorder, auto-retires at zero. Controlled-substance flag so `lib/clinical/controlled.ts`
and `pdmpCheck` apply.

### T21 · Lab Draw permissions  ▸ 10 minutes  ⟨REWORK⟩
`VISIT_TYPES` declares Lab Draw as `roles: ["Medical", "Admin"]`. An office manager is not
a phlebotomist. Stephanie's matrix: RN/LPN, NP or PA only.

### T22 · Clover adapter  ▸ 1 day, keys not required to build
Add `"clover"` to `ProcessorName` in `lib/payments/port.ts`, write `lib/payments/clover.ts`,
add `location.merchantAccountId`, make the merchant a **parameter resolved from the
patient's clinic** rather than a global. Everything but the live credential is offline work.
Preserve the port's existing rules — no PAN, integer cents, idempotency key on every
mutating call.

### T23 · Seed the real roster  ▸ half a day
29 staff (5 Alpha Gym trainers excluded — that instruction belongs in data as
`excludeFromScheduling`, not in someone's memory). Add `department`. **Map real people onto
the existing `st-00N` ids** — clients reference `coachId`/`providerId` across the seed and
`/api/audit` will fail loudly on a dangling ref, which is the system working. Do not
regenerate ids. Pick one spelling of Domingez/Dominguez.

---

## Wave 5 — cutover plumbing

### T24 · V1 → Apex importer  ▸ 2 days
Not in anyone's plan and on the critical path: Aug 7 makes Apex the system of record, so the
existing patients must already be in it. You own the V1 repo, so this can be written against
a schema you can read today.

### T25 · V2 → V1 / MedSource export  ▸ 1 day
Committed on the call. `lib/orders/medsource.ts` is the model — pure functions over data,
transport at the edge.

### T26 · Idle logout + session policy  ▸ 2 hours
15-minute idle timeout on clinical surfaces (warning at 13), absolute session cap, re-auth
for signature actions. Set it on the **Container App auth session** too — a JS timer that
hides the UI while the EasyAuth cookie stays valid is theater.

### T27 · Durable ledger for everything that ships  ▸ 1 day  ⟨REWORK⟩
Persisted today for consult co-sign, task complete and order create. `lib/trace/ledger.ts`
is otherwise a module-scope array — `lib/frontdesk/encounters.ts` says so in its own
docblock. Every mutation on the T1 keep list needs a durable row, or the claim made on the
call ("every action is tracked") stays false.

### T28 · Extend `/api/audit`  ▸ 2 hours
Cover the new tables (encounter, vitals, provider coverage, feature flags). It is the
cheapest guard the repo has against a dangling reference reaching a demo.

---

## Blocked — do not start

| Task | Waiting on |
| --- | --- |
| Google Calendar availability adapter | Calendar access from Paul. **Build the working-hours model in Apex now** (T9 needs it anyway); the adapter is a later seam. Also verify the v3 API actually exposes work hours before promising it |
| Provider continuity rule (H&P provider = POC provider) | Matt vs Stephanie conflict — availability resolver vs continuity. Changes T9 |
| Holly / "all MB females" routing | Hard rule or preference? Absent from Stephanie's spec entirely |
| Telehealth NCV variant | Unspecified. A remote new client cannot have an in-clinic draw or in-person physical |
| State-of-practice routing (Ohio et al.) | The constraint that is actually law and the least specified |
| Raleigh DC | No staff on the roster; unclear whether it is a location or a room split |
| Credentials, licence numbers, supervising physicians | Roster says "Nurse" — RN or LPN matters for scope of practice, and NC/SC differ |
| Live Clover keys, MindBody/GHL exports, 10DLC, email domain | External. See `AUG7_CUTOVER.md` §2 |

## Not now, on purpose

- **Plan of care builder** — explicitly deferred past V2. Template path
  (`lib/planOfCare/engine.ts`) is enough; intake must run *up to* a completed POC.
- **Community, gamification, referrals, winback, swarm, agent** — ship dark (T1/T2). Keep
  the code, keep it out of the clinic release.
- **Time clock** — MedSource/Nexus, not Apex. And a timesheet someone gets paid from is not
  the clinical ledger.

---

## If only six things get done

`T1` scope cut → `T2` flags → `T5` credential class → `T8`+`T9`+`T10` the NCV →
`T13` versioned intake → `T6`+`T7` real clock and real actor on the keep list.

That is a clinic that can book a new client visit correctly, take an intake, run a
three-part appointment and attribute every write to the human who made it. Messaging,
order routing and Clover slip to the commerce cutover without breaking anything clinical.

## The V1 skin — what was measured, and what is left

`npm run contrast` sweeps 49 routes and reports every text node under WCAG AA
against its real background. **Validate it first** — `npm run contrast:self-test`
injects deliberately illegible text and asserts the detector catches it. A sweep
that cannot fail proves nothing; the blank-screen bug in this repo survived three
"clean" passes for exactly that reason.

| Pass | Failures | What changed |
| --- | --- | --- |
| Initial reskin | **8,018** | — |
| Token correction | 902 | `ink-500`/`ink-600` measured against **white**, not the canvas — the first guess (`#767c86`, 4.2:1) looked plausible and still failed. Whole brand ramp inverted; 100–300 had been left as pale on-dark pinks rendering at 2–3:1 |
| Literal sweep | 146 | 184 hardcoded hex values across `app/`, `components/` and `lib/` moved onto tokens — charts, clinical mini-charts, status dots |
| Semantics | **142** | `text-ink-700` (the hairline colour) was being used as text in 25 places at ~1.2:1; `--on-swatch` added so a monogram flips with the seeded colour underneath it |
| Final component repair | **0** | Saturated chips, dark badges, chart labels, and remaining routed surfaces now use verified foreground/background pairs; the 49-route sweep is clean |

**No contrast failures remain.** CI still runs both the deliberately failing
self-test and the complete 49-route sweep so a broken detector cannot produce a
false clean result.

Two findings from this that no type check or build could have produced: the
stat-tile captions were unreadable, and `/clinic/coverage` 404'd because its
capability gate was `read:all-clients` (Admin-only) rather than `read:chart`.
