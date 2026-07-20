# Apex — Inventory

*Audit date: 2026-07-20 · Commit: `4e7b970` · Method: static read + PRNG replication + runtime probe. No claim below is made without a file path.*

---

## 0. The one-paragraph version

Apex is a **101,377-line front-end prototype**. It has no database, no authentication, no server-side logic and no outbound network calls of any kind. Every screen is rendered from 5,621 lines of seeded mock data held in `lib/mock/**`. It is an unusually detailed and, in places, genuinely expert simulation of a clinic OS — and it is a simulation. The distance between it and "runs Alpha Health" is not a backlog of features; it is a backend, an identity system, a payments integration and a compliance programme. Nothing in this document should be read as saying the work is poor. Several modules are production-grade design that should be ported verbatim. But nothing here persists, and nothing here is protected.

---

## 1. Platform facts

| Property | Value | Evidence |
|---|---|---|
| Total application code | 101,377 LOC | `app/` + `lib/` + `components/` |
| Routes (`page.tsx`) | 59 | `find app -name page.tsx` |
| Library modules | 153 | `lib/**/*.ts(x)` |
| Components | 133 | `components/**/*.tsx` |
| Seeded mock data | 5,621 LOC | `lib/mock/*.ts` |
| **Database / ORM / migrations** | **none** | no `prisma`, `drizzle`, `pg`, `mongoose`, `supabase`, `knex` in `package.json`; no `migrations/`, `prisma/`, `schema/` |
| **API routes** | **1** | `app/api/audit/route.ts` — a dev harness added during this audit cycle, not product code |
| **Server actions** | **0** | no `"use server"` anywhere in `app/`, `lib/`, `components/` |
| **Auth library** | **none** | no `next-auth`, `@auth/*`, `clerk`, `auth0`, `msal`, `@azure/identity`, `jose`, `jsonwebtoken`, `bcrypt` |
| **Outbound network calls** | **0** | no `await fetch(` or `axios.` in application code |
| Runtime dependencies | 8 | `next`, `react`, `react-dom`, `recharts`, `framer-motion`, `lucide-react`, `clsx`, `tailwind-merge` |
| TODO / FIXME / stub markers | 59 | across `app/`, `lib/`, `components/` |
| `console.*` statements | 2 | *positive finding — no PHI leaks through logs* |

**Deployment.** Azure Container Apps (`ca-apex`, RG `apex-prod`, image `acrapexfcfde.azurecr.io/apex-web`), public, **no authentication in front of it**. A stateless Next.js container serving a single-tenant demo dataset.

---

## 2. What actually works end-to-end

"Works" here means: a user can complete the interaction in a browser against mock data and see a correct result. It does **not** mean the result survives a reload unless stated.

### Genuinely working, and good

| Capability | Evidence | Note |
|---|---|---|
| Lab results with reference **and** optimal bands | `app/portal/labs/page.tsx`, `normalButNotOptimal()` line 67 | The clinic's "we look past normal" pitch encoded as a data structure. 29 markers modelled. |
| Telehealth **state-licensure gating** | `lib/booking/availability.ts:151-165`, `blockedByLicensure` | Correctly models that a telehealth visit occurs where the *patient* sits; names the blocked provider and reason. Best clinical logic in the repo. |
| Availability engine | `lib/booking/availability.ts` | Roster − booked − duration, role-gated, lunch blocks, no invented slots. |
| Capacity / utilisation | `lib/analytics/capacity.ts` | Rostered vs booked hours; utilisation deliberately unclamped; bookings against an unrostered clinician surfaced as a defect. |
| Subscription **fulfilment** engine | `lib/subscriptions/engine.ts` | Advance-before-place with compare-and-set on `nextRefillOn`; `rollFrom()` preserves schedule phase. Correct concurrency and date reasoning. |
| Order lifecycle + outbox | `lib/orders/**`, `lib/orders/lifecycle.ts` | One Apex-issued id end-to-end, closed status union, `parseMedSourceStatus` returns null on unknown input, retry with dead-letter, actor+source required per event. |
| Cost / receipt modelling | `lib/costs/breakdown.ts`, `lib/receipts/vault.ts` | Integer cents; three-valued HSA eligibility including explicit "we don't know"; `sourceRef` traceability. |
| Reconstitution & draw maths | `lib/dosing/reconstitution.ts` | mg/mcg → mL → syringe units, both lyophilised and pre-mixed paths; refuses on missing diluent, IU dosing, or over-barrel draw. **9/9 unit cases verified.** |
| Pharmacokinetics | `lib/peptides/pharmacokinetics.ts`, `components/peptides/PKCurve.tsx` | Real first-order kinetics; accumulation ratio verified (2.0× for 7-day t½ dosed weekly). Withholds the curve where half-life is uncharacterised. |
| Peptide sequence rendering | `lib/peptides/sequence.ts`, `components/peptides/BackboneDiagram.tsx` | Published primary sequences; omits rather than approximates where unsure. |
| Interaction / contraindication gate | `lib/clinical/interactions.ts`, `app/recommendations/page.tsx:203` | Blocking findings excluded from batch signing; approve disabled until each is acknowledged individually; ledger records finding **ids**, not a count. 205 of 958 proposals blocked. |
| Monitoring requirements | `lib/clinical/monitoring.ts` | Emits a requirement with **no due date** and "No published interval" where no standard exists, rather than inventing one. |
| Lab velocity + projection | `lib/labs/velocity.ts` | OLS with a widening prediction interval; refuses below 3 points; no crossing date when the slope CI includes zero. |
| Member access log | `app/portal/access/page.tsx` | "Who viewed my chart" as a live query rather than a 60-day §164.528 request. |
| Education library | `lib/education/library.ts` | ~600 lines of real long-form content, genuinely bi-gender (`track: men | women | all`, `articlesForSex()` line 573). |
| Member daily logging | `lib/member/logStore.tsx` | Dose taken/skipped with reason, injection-site rotation, weight, 4-point check-in. **The only client action that survives a reload** (localStorage, today only). |
| Design system | `tailwind.config.ts` | 6-step named type scale, 3 radii, tabular numerals. 1,466 ad-hoc sizes normalised. |

### Working but non-durable (in-memory or module-scope state)

| Capability | Evidence | What is lost |
|---|---|---|
| Audit ledger | `lib/trace/ledger.ts:289` `export const ledger: LedgerRow[]` | **Everything.** Module-level array; every append dies on restart, and each Container Apps replica holds its own divergent chain. |
| Appointment booking | `lib/booking/availability.ts:293` `const booked: Appointment[] = []` | The booking. Also invisible to `lib/mock/appointments.ts`, so the chart never sees it. |
| Escalation / sign / approve transitions | `app/recommendations/page.tsx`, `components/escalations/EscalationCard.tsx` | All state transitions. |
| Notes, tasks, leads | `lib/store.tsx:104-107` | React context only. |
| Consult drafts | `components/consult/ConsultComposer.tsx:144` | Persisted — to **unencrypted `localStorage`**. See §5. |

---

## 3. Stubs — UI present, workflow absent

These render convincingly and do nothing. Each is a demo hazard because the interface asserts an outcome.

| Surface | Evidence | What it claims vs does |
|---|---|---|
| Lead capture | `app/book/page.tsx:104-113` | Validates, mints a token, **discards the form**; hands back a seeded demo link. |
| Intake wizard | `components/intake/IntakeWizard.tsx:722` | 966-line multi-step wizard. Submit is `onClick={() => setSubmitted(true)}`. |
| Symptom journal save | `components/portal/SymptomJournal.tsx:146-152` | `setSaved(true)` + toast *"Your coach can see this before your next check-in."* Writes nothing. Trends above it are **synthesised** from `seededRandom`. |
| Consents | `app/portal/consents/page.tsx:130-140` | Four hardcoded grants, `useState` revocation. Claims `lib/comms/consent.ts` "is not in the tree" — **it is**, with real versioning (`clinical-comms-v3`). |
| Refill request | `components/portal/RefillRunway.tsx:64-92` | Ledger row + `useState`; creates no order. |
| Receipt export | `components/portal/ReceiptVault.tsx:143-150` | Builds a correct CSV, then `console.info(csv)`. No download. |
| Provider messaging | `app/portal/messages/page.tsx:76,117` | Provider thread is permanently `messages: []`; `send()` hardcodes `staffId: coach?.id` regardless of thread. |
| Notification preferences | `components/portal/NotificationPrefs.tsx` | Toggles with no scheduler and no delivery channel behind them. |
| Telehealth room | `lib/visits/room.ts`, `components/portal/VisitRoom.tsx` | Simulated ACS room with TTL modelling; no real video. |

---

## 4. Dead code

| Module | Importers | Consequence |
|---|---|---|
| **`lib/authz/capabilities.ts`** | **0** | The entire RBAC model — `can()`, `hasCapability()`, `LICENSED_ROLES`, "the dose is never delegable" — is unreferenced. Authorization does not merely live client-side; **it does not execute at all.** |
| `lib/azure/fhir.ts` | 0 | FHIR resource modelling, unused. |
| `lib/azure/confidentialLedger.ts` | 0 | The durable-ledger simulation, unused — while the real ledger is an in-memory array. |
| `lib/azure/serviceBus.ts` | 0 | Durable outbox simulation, unused. |
| `lib/azure/textAnalyticsHealth.ts` | 0 | Clinical NLP simulation, unused. |
| `lib/store.tsx` `addLead` / `NewLead` (`:30,152`) | 0 | The only lead-creation path in the product is never called. |

**All `lib/azure/**` modules are simulations.** They document real service semantics and call nothing. Their own headers say so — they are honest models, not fake integrations. But no Azure service is wired.

Housekeeping: ~60 scratch files sit in the repo root (`walk.mjs`, `shot*.mjs`, `repro1-4.*`, `zz-*.mjs`, `bad14.txt`, `live-audit.json`). Gitignored but present on disk.

---

## 5. Data model

There are no tables. The "schema" is TypeScript interfaces over seeded arrays.

**Core entities** — `lib/types.ts`: `Client`, `Appointment`, `LabResult`/`Biomarker`, `BodyScan`, `InventoryItem`, `Recommendation`, `Task`, `Note`.
**Domain types** — `lib/orders/types.ts`, `lib/catalog/types.ts`, `lib/planOfCare/types.ts`, `lib/consult/types.ts`, `lib/escalations/types.ts`, `lib/community/types.ts`, `lib/subscriptions/types.ts`, `lib/dosing/prescriptions.ts`.

### Modelled but unreachable
- **Women's clinical content** — female lab reference overrides, perimenopause education, `CARE_TRACKS` male/female picker (`lib/brand.ts:115`) all exist. `components/portal/PortalHeader.tsx:25` hardcodes `ME = "c-001"` (male, 41), with ~50 references. **No portal surface can render as a woman.**
- **Consent versioning** — `lib/comms/consent.ts:85-144` has scoped, versioned grants. The consents page ignores it.
- **Order lifecycle for patients** — `lib/orders/lifecycle.ts` models carrier scans; no `app/portal` file imports it.

### Joins that do not close
- **Lot → patient (recall).** `OrderLine.lotRef` is *fabricated* at `lib/mock/orders.ts:308` from a **third private catalog** (`lib/mock/orders.ts:73-88`, with a `lotPrefix` field) that is neither `lib/catalog/catalog.ts` nor `lib/mock/inventory.ts`. Order lots (`BPC-2604K`) will not match inventory lots (`BPC-2604A`) except by coincidence — the suffix letter is a function of order index. There is no `byLot`/`recall` query anywhere. In-clinic administration creates no record and `inventory.quantity` never decrements. **Three separate comments assert this capability exists** (`lib/catalog/types.ts:74`, `lib/orders/types.ts:89-91`, `lib/catalog/catalog.ts:503`) — they will be read as spec.
- **Prescription → plan of care.** `lib/dosing/prescriptions.ts` assigns templates by `seededRandom(c.id + "rx")` with no link to `PlanItem`, and **no filter on patient sex**. See GAP_ANALYSIS §P0-1.
- **Booking → chart.** `lib/booking/availability.ts:293` writes to module memory; `lib/mock/appointments.ts:34` is the seed the chart reads.
- **Referral → revenue.** Deliberately excluded (`lib/mock/referrals.ts:16-22`), so attribution is architecturally impossible.

### Fabricated figures presented as measurements
`lib/analytics.ts` — verified by reading:
- `grossMonthly = mrr + Σ(lifetimeValue) × 0.02 + 12000` (line 48) — a magic constant.
- Service-line revenue = `grossMonthly × hardcoded weight` {0.30, 0.24, 0.18, 0.12, 0.10, 0.06} (lines 39-47).
- MRR trend eased from `mrr × 0.62` (lines 30-36).
- Retention curve is a literal array `[100,94,88,83,79,76,73]` (line 96).
- `app/clinic/page.tsx:85` — every KPI delta and sparkline from `seededRandom()`.
- `app/analytics/page.tsx:52` — "+12% MoM" is a hardcoded string.

Genuinely computed: `lib/reports/dailyOrders.ts:223,285` (sums real line items), `lib/subscriptions/engine.ts` refill revenue, `lib/analytics/capacity.ts`.

---

## 6. Auth & RBAC

**There is no authentication.** No identity provider, no session, no token, no password, no server boundary to enforce one at.

**There is no authorization.** `lib/authz/capabilities.ts` defines a thoughtful model — gate authorship not reading, no admin superuser, `write:prescription` granted to `Medical` only — and has **zero import sites**. `lib/viewer.ts` hardcodes a single Admin viewer with `canSwitchPersona: true`; `PERSONAS` lets any visitor become Member, Coach or Medical client-side with no check.

**No session timeout, no idle lock.** A clinic workstation left open stays open.

Roles modelled: `Medical`, `Coach`, `Admin` (`lib/authz/capabilities.ts:86-96`). A 5,000-patient multi-site clinic needs at minimum: physician, NP/PA, RN/MA, coach, front desk, billing, inventory manager, clinic manager, owner — with per-location scoping.

---

## 7. Integrations

| Integration | State | Evidence |
|---|---|---|
| Calendar | **absent** | no CalDAV/Google/Outlook client |
| Payments | **absent** | one repo-wide hit for `tokeniz*`, describing an intake link (`lib/portalStore.tsx:82`) |
| Labs (Quest / Labcorp) | **absent** | named in comments only (`lib/labs/ingest.ts:139`) |
| SMS / email | **simulated** | `lib/azure/communication.ts` — models ACS, sends nothing |
| E-signature | **absent (patient)** | clinician attestation exists (`app/clinic/sign`); patients can sign nothing |
| Pharmacy / e-prescribing | **simulated** | `lib/orders/medsource.ts` models a partner contract; nothing transmits |
| FHIR | **dead** | `lib/azure/fhir.ts`, 0 importers |
| Push notifications | **absent** | preference UI only |
| HealthKit / wearables / scales | **absent** | no integration surface |

---

## 8. HIPAA posture in code

| Check | Finding | Evidence |
|---|---|---|
| PHI in logs | **PASS** | 2 `console.*` statements in 101k LOC |
| Audit trail on PHI access | **FAIL — non-durable** | `lib/trace/ledger.ts:289` is a module array; per-replica and lost on restart. `view`/`export`/`break-glass` are correctly first-class actions, which makes the durability gap worse, not better. |
| RBAC enforced server-side | **FAIL** | no server; `can()` never called |
| Minimum-necessary access | **FAIL** | any visitor may assume any persona |
| Session timeout | **FAIL** | none |
| Encryption at rest | **N/A / FAIL** | no datastore; PHI in `localStorage` is plaintext |
| **PHI in browser storage** | **FAIL** | `components/consult/ConsultComposer.tsx:144` persists **clinical note drafts** to `localStorage` — surviving logout on a shared workstation. `lib/member/logStore.tsx:110` stores member health logs likewise. |
| BAA-eligible services only | **UNVERIFIABLE** | nothing is wired |
| Private endpoints | **FAIL** | the app is publicly reachable with no auth |
| Backups / retention | **ABSENT** | no datastore to back up; no retention policy in code |
| Consent versioning | **PARTIAL** | model exists (`lib/comms/consent.ts`), UI ignores it |
| Multi-state licensure | **PARTIAL — one bright spot** | `lib/booking/availability.ts:151-165` gates telehealth by patient state. No prescribing, supervision or co-sign rules anywhere. |
| DEA / controlled substances | **ABSENT** | testosterone is Schedule III; no PDMP, no DEA number, no controlled-substance handling |

---

## 9. Honest summary for a reader in a hurry

**What Apex is:** the most carefully reasoned clinic-OS *prototype* I have audited. Several modules — the availability engine, the subscription fulfilment engine, the order outbox, the costs/receipts model, the interaction gate, the reconstitution maths — are production-grade design that should survive into the real system unchanged.

**What Apex is not:** a system. Nothing persists, nothing is authenticated, nothing is authorized, no money moves, nothing is transmitted to a pharmacy or a lab, and the audit trail evaporates on restart.

**The most dangerous property** is that the prototype is *convincing*. Fabricated revenue renders next to a real disclaimer in smaller type; comments assert a recall capability that does not exist; a PRNG assigns prescriptions under a named physician's signature. A demo audience — including a clinician or an investor — cannot tell which parts are real. Every item in §3 and §5 is a place where the interface makes a claim the code does not honour.
