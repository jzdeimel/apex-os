# Apex — Gap Analysis

*Audit date: 2026-07-20 · Commit `4e7b970` · Companion to `INVENTORY.md`*

**Severity key**
- **P0** — cannot run the clinic, or is a patient-safety / regulatory hazard.
- **P1** — clinic runs, but bleeds time, money or risk continuously.
- **P2** — value multiplier.

**Reading note.** "EXISTS" throughout means *works end-to-end in the prototype, against seeded mock data, until the page reloads*. There is no database, no auth and no server. Where that distinction changes the verdict, it is stated.

---

## THE TOP 10 RISKIEST GAPS

Ordered by patient safety and regulatory exposure first, then revenue.

| # | Finding | Sev | Evidence |
|---|---|---|---|
| **1** | **Female patients are assigned a full male TRT dose.** `TEMPLATES` are selected by `seededRandom(c.id + "rx")` with **no filter on sex, program or plan of care**. PRNG replicated: `c-006`, `c-010`, `c-014`, `c-018` — 4 of 8 female patients — receive **Testosterone cypionate 100mg twice weekly**, ~10–20× a female physiologic dose, rendered with a computed syringe draw under a named physician's signature. The file's header defends showing doses *because a provider signed them*. No provider signed these. | **P0** | `lib/dosing/prescriptions.ts:180-214`, templates `:143-154` |
| **2** | **No authentication, and authorization is dead code.** `lib/authz/capabilities.ts` — `can()`, `LICENSED_ROLES`, "the dose is never delegable" — has **zero import sites**. Any visitor can assume Member, Coach or Medical client-side. The app is publicly reachable on the internet with a full patient dataset. | **P0** | `lib/authz/capabilities.ts` (0 importers), `lib/viewer.ts`, `components/layout/PersonaSwitcher.tsx` |
| **3** | **The audit trail is an in-memory array.** `export const ledger: LedgerRow[]` — module-scope. Every append dies on restart; each Container Apps replica keeps its own divergent hash chain. For a product whose thesis is traceability, the audit log is the least durable object in it. HIPAA §164.312(b) requires the opposite. | **P0** | `lib/trace/ledger.ts:289,335` |
| **4** | **Messaging your prescriber routes to your coach and then vanishes.** `send()` hardcodes `staffId: coach?.id` regardless of the open thread; the provider thread is permanently `messages: []`. "My chest hurts after the injection" reaches a non-clinician and disappears from the view it was sent in. | **P0** | `app/portal/messages/page.tsx:76,117` |
| **5** | **The lot→patient recall join does not close — and three comments claim it does.** `OrderLine.lotRef` is fabricated from a *third private catalog* (`lotPrefix`) that is neither the real catalog nor inventory; order lots (`BPC-2604K`) never match inventory lots (`BPC-2604A`) except by coincidence. No `byLot`/`recall` query exists. In-clinic administration records nothing and `inventory.quantity` never decrements. For Schedule III testosterone and compounded GLP-1s, an unanswerable recall is a regulatory event. | **P0** | `lib/mock/orders.ts:73-88,308`; false claims at `lib/catalog/types.ts:74`, `lib/orders/types.ts:89-91`, `lib/catalog/catalog.ts:503` |
| **6** | **Testosterone is Schedule III and there is no controlled-substance handling anywhere.** No DEA number, no PDMP check, no dispense log, no chain of custody, no refill limit enforcement. Nothing transmits a prescription; it stops at an internal record. | **P0** | absent repo-wide |
| **7** | **A blocking full-screen reward fires on medication administration, captioned "your level steps up".** The scoring layer is scrupulous — `XP_WEIGHTS` is behaviour-only and `quests.ts:73` drops dose-shaped quests at runtime — yet the UI delivers its single richest variable reward for the act of dosing, using the word *level*. 2.1s, `fixed inset-0`, no tap-to-dismiss. | **P0** | `components/portal/DoseLoggedBurst.tsx:110,188,207` |
| **8** | **PHI is written to `localStorage` unencrypted.** Clinical note drafts persist in browser storage on shared clinic workstations, surviving logout. Member health logs likewise. | **P0** | `components/consult/ConsultComposer.tsx:144`, `lib/member/logStore.tsx:110` |
| **9** | **There is no gamification opt-out.** Zero matches repo-wide for `hideXp|gamif|optOut|showXp`. A member who wants none of it still receives streak cards, quests, levels, confetti and fabricated streak tiles. The codebase makes this exact argument for notifications (`NotificationPrefs.tsx:250`) and never applies it to display. | **P0** | verified: 1 incidental match repo-wide |
| **10** | **No billing engine exists — at zero, not partial.** No payment method entity, no invoice type, no charge/capture/refund, no proration, no dunning. `write:refund` exists as a capability with nothing behind it. Dunning is one seeded string. In a 5,000-patient membership book this is where money leaks continuously and invisibly. | **P0** | one repo-wide `tokeniz*` hit (`lib/portalStore.tsx:82`, unrelated); `lib/mock/subscriptions.ts:150` |

**The meta-finding.** The most dangerous property is not any single gap — it is that the prototype is *convincing*. Fabricated revenue renders beside a disclaimer in smaller type; comments assert a recall capability that does not exist; a PRNG signs prescriptions under a physician's name; two prominent buttons toast "written to the ledger" and write nothing. A demo audience cannot tell which parts are real.

---

## CLIENT

| Item | Status | Sev | Evidence |
|---|---|---|---|
| Lead capture form | PARTIAL | P0 | `app/book/page.tsx:104-113` — validates, then discards the form |
| Men's vs women's program selection | PARTIAL | P1 | `app/book/page.tsx:249-284`, `lib/brand.ts:115` — real picker, result thrown away |
| In-person vs telehealth | PARTIAL | P1 | telehealth modelled as a 5th *location*, not a modality (`lib/mock/locations.ts`) |
| Intake forms | PARTIAL | P0 | `components/intake/IntakeWizard.tsx:722` — 966-line wizard; submit is `setSubmitted(true)` |
| Consent / e-signature | MISSING | P0 | `app/portal/consents/page.tsx:130-140`; real versioned model at `lib/comms/consent.ts:85-144` is ignored |
| First visit / telehealth room | PARTIAL | P1 | `lib/visits/room.ts` — simulated, no real video |
| Lab ordering | MISSING | P1 | no portal surface orders a panel |
| Results viewing | **EXISTS** | — | `app/portal/labs/page.tsx` — reference **and** optimal bands |
| **100+ marker panel** | MISSING | P1 | **29 markers modelled** (`lib/mock/labs.ts:19-49`) vs `markers: "100+"` advertised (`lib/brand.ts:125`) |
| Trends over time | PARTIAL | P1 | one `LabResult` per client ever; history back-fabricated, and **only for off-target markers** (`lib/mock/labs.ts:138-152`) |
| Plain-English interpretation | **EXISTS** | — | `app/portal/labs/page.tsx:44-64` |
| Flagged out-of-range | **EXISTS** | — | `lib/mock/labs.ts:96-101` |
| Current protocol + why | **EXISTS** | — | `app/portal/protocol/page.tsx`, `lib/member/whyThis.ts` — member reads the signed plan with its evidence |
| Meds + doses | PARTIAL | **P0** | split-brain: no dose on the plan by design; doses only on home, from a PRNG (**Top-10 #1**) |
| Injection schedule + site rotation | **EXISTS** | — | `lib/member/logStore.tsx:213-234`, `lib/protocol/sites.ts` |
| Titration schedule / week N of M | MISSING | P1 | no protocol-week concept exists anywhere |
| Refill request | PARTIAL | P1 | `components/portal/RefillRunway.tsx:64-92` — ledger row only, creates no order |
| Shipment tracking (patient-visible) | MISSING | P1 | `lib/orders/lifecycle.ts` exists; no `app/portal` file imports it |
| Medication reminders | MISSING | P0 | `NotificationPrefs.tsx` — toggles, no scheduler, no transport |
| Book a visit | PARTIAL | P0 | `lib/booking/availability.ts:293` writes to a module array |
| **Reschedule / cancel** | MISSING | P0 | the most-used function in MindBody; a patient cannot cancel |
| Per-location availability | **EXISTS** | — | `lib/booking/availability.ts` |
| **Telehealth state-licensure gating** | **EXISTS** | — | `lib/booking/availability.ts:151-165` — best clinical logic in the repo |
| Blood draw / scan / coach check-in bookable | **EXISTS** | — | `lib/booking/availability.ts:91-130` |
| Secure messaging | PARTIAL | P0 | `useState` only, despite copy claiming "kept forever" |
| Coach vs clinician routing | MISSING | **P0** | **Top-10 #4** |
| Weight / body comp | **EXISTS** | — | `app/portal/progress/page.tsx`, `lib/mock/bodyscans.ts` |
| **Validated symptom instruments** | MISSING | **P0** | zero hits for ADAM, qADAM, Greene, AMS, PHQ-9, GAD-7, IIEF. Six ad-hoc 1–5 scales (`lib/symptoms/journal.ts:53-90`). Not a defensible treatment-response measure; the women's track has no menopause scale at all |
| Symptom check-in persistence | MISSING | P0 | `components/portal/SymptomJournal.tsx:146-152` — `setSaved(true)` + a false toast; trends above it are `seededRandom` |
| Progress photos | MISSING | P1 | no upload surface, no model |
| Membership status | **EXISTS** | — | `lib/mock/memberships.ts`, `components/portal/CostClarity.tsx` |
| Invoices / payment methods / payment plans | MISSING | P0 | zero entities |
| HSA/FSA receipts | PARTIAL | P1 | strong model (`lib/receipts/vault.ts`); export ends at `console.info(csv)` |
| Education content | **EXISTS** | — | `lib/education/library.ts` — substantive, genuinely bi-gender |
| Program-sequenced content drip | MISSING | P2 | ranked on markers/goals, not protocol week |
| **Portal renderable as a woman** | MISSING | **P0** | `components/portal/PortalHeader.tsx:25` hardcodes `ME = "c-001"` (male, 41), ~50 refs. Female reference ranges, perimenopause content and the care-track picker all exist and are **unreachable** |

---

## COACH

| Item | Status | Sev | Evidence |
|---|---|---|---|
| Roster with health snapshot | **EXISTS** | — | `app/coach/roster/page.tsx`, `lib/roster/health.ts` |
| Ranked at-risk queue | **EXISTS** | — | `components/coach/TodayQueue.tsx:115-184`; frozen sort so worked rows hold position (`:249`) — best interaction decision in the codebase |
| **Check-in write** | MISSING | **P0** | `TodayQueue.tsx:284` toasts *"Written to the ledger"* with **zero `appendLedger` calls in the file**. `lib/mock/contactLog.ts` has no write API. The most-clicked button on the coach home screen is theatre |
| Structured session notes / goals | PARTIAL | P1 | `lib/coach/consultPrep.ts` reads; no structured write |
| Missed check-in alerts | PARTIAL | P1 | `lib/coach/adherenceRisk.ts` computes; no alerting transport |
| One-tap outreach | MISSING (built, unmounted) | P1 | `components/coach/QuickReply.tsx` — 386 lines, consent guards, idempotency. **Imported by nothing** |
| Bulk actions | MISSING (built, unmounted) | P2 | `components/coach/BulkBar.tsx` — correct compensating-write undo. **Imported by nothing** |
| Messaging inbox + escalation | **EXISTS** | — | `lib/escalations/**`, `components/escalations/EscalationCard.tsx` |
| Per-client progress dashboards | **EXISTS** | — | `components/coach/SinceLastVisitCard.tsx`, `lib/coach/sinceLastVisit.ts` |
| Task queue / lapsed / churn | **EXISTS** | — | `lib/coach/adherenceRisk.ts` with contributing reasons shown |
| Caseload/capacity across coaches | PARTIAL | P1 | `lib/analytics/capacity.ts` is per-location; `coachId` is not a filter dimension |
| Caseload **health** score | MISSING | P2 | `lib/roster/health.ts` is roster *data-quality*, not caseload health |
| "Clients helped this week" | MISSING | P2 | every staff stat is a backlog count |
| Win notifications to coach | MISSING | P1 | `NotificationBell.tsx:37-42` — four types, **all negative**, scoped by location not coach. No good-news channel to staff exists |

---

## MEDICAL STAFF

| Item | Status | Sev | Evidence |
|---|---|---|---|
| Full patient chart | PARTIAL | P1 | `app/clients/[id]/page.tsx` — tabs incl. Contact Log, Notes, Timeline, Time Machine |
| **SOAP visit notes** | PARTIAL | P0 | free-text + AI summary (`lib/consult/summarize.ts`); no S/O/A/P structure |
| **Problem list / allergy list / med list** | MISSING | **P0** | table stakes for any chart; absent |
| Immutability after signing | PARTIAL | P1 | ledger records the signature; the in-memory ledger (Top-10 #3) undermines it |
| Lab review queue + sign-off | **EXISTS** | — | `app/clinic/sign/page.tsx`, `components/clinic/MobileSignQueue.tsx:382-422` — real ledger write, hash surfaced back |
| Delta from prior panels | **EXISTS** | — | `components/clinic/LabVelocityPanel.tsx`, `lib/labs/velocity.ts` |
| Protocol suggestion + approve/decline | **EXISTS** | — | `app/recommendations/page.tsx:230-266`; blocking findings excluded from batch signing (205/958) |
| Interaction / contraindication screen | **EXISTS** | — | `lib/clinical/interactions.ts`; **discloses what it cannot see** (no external med list) |
| Monitoring requirements | **EXISTS** | — | `lib/clinical/monitoring.ts`; emits "No published interval" rather than inventing one |
| Haematocrit / estradiol TRT alerts | PARTIAL | P1 | monitoring engine covers categories; no dedicated threshold alerting |
| **Titration schedules** | MISSING | P1 | no dose-change-over-time model |
| **Refill authorisation queue (clinician)** | MISSING | **P0** | nearest is a *coach* action — `app/coach/subscriptions/page.tsx:396` "Release hold", 2 clicks, `onPlace` commits real money with **no confirm step** |
| **E-prescribing / pharmacy transmission** | MISSING | **P0** | `lib/orders/medsource.ts` models a contract; nothing transmits |
| **DEA / PDMP / controlled substances** | MISSING | **P0** | Top-10 #6 |
| Telehealth visit documentation | PARTIAL | P1 | room simulated; no visit note tied to it |
| **Clinician state licensure (prescribing)** | PARTIAL | **P0** | modelled **only** for booking (`availability.ts:151-165`). No licensure gate on prescribing, signing or documentation |
| Standing orders / panel templates / protocol templates | MISSING | P1 | `lib/staff/templates.ts` is message templates only |
| **Adverse event / side-effect logging** | MISSING | **P0** | no AE entity anywhere; required for any therapeutic programme |
| **NP/PA supervision & co-sign (NC vs SC)** | MISSING | **P0** | no supervising-physician relationship, no co-sign queue, no state rule table. Roles are only `Medical | Coach | Admin` |

---

## FRONT DESK / OPS

| Item | Status | Sev | Evidence |
|---|---|---|---|
| **Front-desk persona exists at all** | MISSING | **P0** | `lib/portals.ts:62-103` — only patient, clinic, coach |
| Daily schedule per location | PARTIAL | P1 | `app/schedule/page.tsx` — read-only over 15 seeded appointments |
| **Check-in / check-out / rooming** | MISSING | **P0** | `"Checked In"` is a seeded enum on one record with no setter; no arrival timestamp, no room, no wait time. No encounter clock ⇒ no billable-visit basis |
| Provider assignment / reassignment | PARTIAL | P1 | seeded `staffId`; no reassignment surface |
| **Phone-driven booking (staff-side)** | MISSING | **P0** | `lib/booking/availability.ts` is wired **only** to the patient portal. For a clinic on an 833 line, the single most important front-desk action has no surface |
| Inventory display, expiry, reorder points | **EXISTS** | — | `lib/mock/inventory.ts`, `app/supply-chain/page.tsx` |
| **Stock decrement on dispense** | MISSING | **P0** | `quantity` is immutable; no receiving, dispense, waste or cycle count. Wastage on $210/vial tirzepatide is unmeasurable |
| **Lot → patient recall** | MISSING | **P0** | Top-10 #5 |
| Quest / Labcorp requisitions | MISSING | P1 | named in comments only |
| Specimen / accession tracking | MISSING | P1 | `lib/analytics/labTurnaround.ts:136` synthesizes the draw time |
| raleigh-boutique inventory | MISSING | P1 | zero rows; silently omitted from the per-location chart (`app/supply-chain/page.tsx:112`) |

---

## BILLING / REVENUE

| Item | Status | Sev | Evidence |
|---|---|---|---|
| Payment processing | MISSING | **P0** | Top-10 #10 |
| Payment method storage | MISSING | **P0** | no entity |
| Invoice generation | MISSING | **P0** | no type; the word appears once in a capability comment |
| Recurring **billing** | MISSING | **P0** | `lib/subscriptions/engine.ts` is recurring *fulfilment*; no money moves |
| Proration | MISSING | P1 | zero occurrences repo-wide |
| Pauses / cancellations | PARTIAL | P1 | `Paused`/`Lapsed` are randomly seeded (`STATUS_ROLL`); no transition code |
| **Dunning** | MISSING | **P0** | one seeded string (`lib/mock/subscriptions.ts:150`); no retry ladder, no card-update, no auto-pause |
| Per-service pricing | **EXISTS** (pricing only) | P1 | `lib/orders/place.ts`, `lib/catalog/catalog.ts` — real integer-cent maths, never charged |
| Packages / bundles | MISSING | P2 | no entity |
| HSA/FSA receipts | PARTIAL | P1 | strong model; `itemised: true` asserted with no PDF generator |
| Payment plans | MISSING | P1 | advertised by the clinic; zero hits |
| Revenue by location / program | PARTIAL (**fabricated**) | **P0** | `lib/analytics.ts:48` `+ 12000` magic constant; hardcoded service weights; eased MRR trend; literal retention array `[100,94,88,...]`; `seededRandom` sparklines; hardcoded "+12% MoM" |
| Revenue by provider / coach | **EXISTS** (computed) | — | `lib/reports/dailyOrders.ts:223,285` — genuinely summed from line items |

---

## OWNERSHIP / ADMIN

| Item | Status | Sev | Evidence |
|---|---|---|---|
| Active patients | **EXISTS** | — | `lib/analytics.ts:23` |
| New consults | PARTIAL | P1 | count of current status, not a dated event |
| Conversion rate | PARTIAL (misleading) | P1 | `lib/analytics.ts:82` — status snapshot, not time-cohorted; a converted-then-churned client counts as converted forever |
| Churn / LTV | PARTIAL | P1 | `lifetimeValue` is hand-typed per client |
| Coach utilisation | **EXISTS** | — | `lib/analytics/capacity.ts` — best analytics module in the repo |
| **Lead pipeline / CRM** | MISSING | **P0** | ~5% of GoHighLevel. `Client` has no source/UTM/campaign; no stage history, no dated stages, no owner, no SLA. `addLead` has **zero call sites**. Apex cannot answer "how many leads last month" |
| Source attribution | MISSING | P0 | `lib/types.ts:93-121` |
| Close rate | MISSING | P1 | — |
| Ownership morning dashboard | PARTIAL + unreachable | P1 | `app/admin/daily-report/page.tsx` — 383 real lines, in **no nav tree**, and it is an *order* report, not consults/conversions/revenue |
| Staff roles | PARTIAL | **P0** | 3 roles; model never called |
| Staff schedules | PARTIAL | P1 | `lib/mock/shifts.ts` generated from `seededRandom`, read-only; no PTO, swap, publish or labour cost |
| Permissions enforcement | MISSING | **P0** | Top-10 #2 |

---

## COMPLIANCE / PLATFORM

| Item | Status | Sev | Evidence |
|---|---|---|---|
| PHI-free logging | **EXISTS** | — | 2 `console.*` in 101k LOC |
| Audit log on PHI access | PARTIAL | **P0** | correct action vocabulary (`view`/`export`/`break-glass`), non-durable store |
| RBAC enforced server-side | MISSING | **P0** | no server |
| Minimum-necessary access | MISSING | **P0** | any visitor may assume any persona |
| Session timeout / idle lock | MISSING | **P0** | none |
| PHI in browser storage | **VIOLATION** | **P0** | `ConsultComposer.tsx:144` |
| Encryption at rest | MISSING | **P0** | no datastore |
| BAA-eligible services only | UNVERIFIABLE | P0 | nothing wired |
| Private endpoints / network isolation | MISSING | **P0** | publicly reachable, unauthenticated |
| Backups / retention policy | MISSING | **P0** | — |
| Consent versioning | PARTIAL | **P0** | model exists (`lib/comms/consent.ts`), UI ignores it; no patient e-signature anywhere |
| Multi-state licensure | PARTIAL | **P0** | booking only |
| Data migration from MindBody / Sheets / GHL | MISSING | **P0** | no importer, no ID-mapping, no reconciliation |
| HIPAA-safe notification infra | PARTIAL | **P0** | consent/quiet-hours/rate-cap chain is **production-grade** (`lib/comms/send.ts:264-345`) and wraps a no-op provider (`:204`). `lib/ops/broadcast.ts:324` accepts free-text operator body with **no PHI content validation** and can target a clinical segment by SMS |
| Offline / degraded in-clinic behaviour | MISSING | P1 | no service worker, no offline queue |
| Mobile responsiveness | **EXISTS** | — | verified 55 routes at 390/820/1440 |

---

## Cross-cutting: the habit loop is not connected

Called out separately because it invalidates most client-facing metrics.

Everything a member logs writes to `lib/member/logStore.tsx`. Everything the member *sees* about what they've done — rings, streak, XP, level, quests, season, leaderboard — reads from `lib/daily/today.ts:347-355`:

```ts
const rand = seededRandom(`${client.id}-ringhistory`);
closed: roll > 0.26,
```

**A member can log every dose for a month and their streak will not move.** Additionally `MemberLogProvider` is mounted on `app/portal/page.tsx:114` — a **page**, not a layout, and `app/portal/layout.tsx` does not exist — so `useMemberLog` throws on every other portal route. And `DayLog` holds **one day** (`logStore.tsx:46-53,98`): there is no history array, so nothing accumulates. The entire Investment quadrant is fiction.

Severity: **P0** for anything depending on adherence data — which includes the coach's adherence-risk worklist and the clinician's view of whether a patient is taking their medication.
