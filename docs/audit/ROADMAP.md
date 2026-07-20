# Apex — Expansion Roadmap

*Audit date: 2026-07-20 · Commit `4e7b970` · Reads on top of `INVENTORY.md`, `GAP_ANALYSIS.md`, `ENGAGEMENT.md`*

---

## The premise this plan is built on

Apex today is a **101k-line front-end prototype with no backend**. That is not a criticism of the work — several modules are production-grade design and should be ported unchanged. But it means the roadmap cannot be a feature list. Roughly the first third of it is building the system that the existing UI has been pretending to talk to.

**Two consequences worth stating plainly:**

1. **Most of the existing code survives.** The domain logic — availability, subscriptions, orders, costs, monitoring, interactions, velocity, dosing, streaks — is largely pure functions over typed data. Give it a persistence layer and most of it works unchanged. The rewrite risk is low.
2. **The demo is currently dangerous to show to clinicians.** See M0. Fix that this week regardless of everything else.

Effort sizing is in **engineer-weeks** for one competent full-stack engineer, and assumes the existing domain logic is retained.

---

## M0 — Stop the bleeding *(this week · ~1 week)*

Not a milestone so much as a hotfix set. Every item is a live hazard in a deployed, publicly-reachable, unauthenticated app.

| # | Fix | Why now | Effort |
|---|---|---|---|
| 0.1 | **Filter prescription templates by sex and program** — `lib/dosing/prescriptions.ts:180-214` | 4 of 8 female demo patients are assigned 100mg testosterone cypionate twice weekly under a named physician's signature. A clinician will find this in 90 seconds | 0.5d |
| 0.2 | **Take the public demo behind a password**, or pull it | Full patient dataset, no auth, indexed URL | 0.5d |
| 0.3 | **Remove the "level steps up" caption and make the dose burst non-blocking** — `components/portal/DoseLoggedBurst.tsx:110,207` | P0 guardrail violation: the richest variable reward in the product fires on medication administration | 0.5d |
| 0.4 | **Fix or remove the three lying buttons** — `TodayQueue.tsx:284` ("Written to the ledger"), `SymptomJournal.tsx:149` ("Your coach can see this"), `RefillRunway` reorder | Each asserts a clinical write that does not happen | 1d |
| 0.5 | **Fix provider-message routing** — `app/portal/messages/page.tsx:117` | "My chest hurts after the injection" reaches a non-clinician and vanishes | 0.5d |
| 0.6 | **Correct the three false recall comments** — `lib/catalog/types.ts:74`, `lib/orders/types.ts:89-91`, `lib/catalog/catalog.ts:503` | They will be read as spec by whoever builds this next | 0.5d |
| 0.7 | **Label every fabricated figure in the UI** — `lib/analytics.ts`, `app/clinic/page.tsx:85` | Owner-facing revenue contains a `+12000` magic constant and `seededRandom` sparklines | 1d |
| 0.8 | **Make the portal renderable as a woman** — unpin `ME` in `components/portal/PortalHeader.tsx:25` | The women's clinical content exists and is unreachable; every demo is a man's chart | 1d |

**Dependencies:** none. Do these first.

---

## M1 — Foundation: persistence, identity, authorization *(~8–10 weeks)*

Nothing else on this roadmap can start without this. It is unglamorous and it is the whole game.

| Workstream | Detail | Effort |
|---|---|---|
| **Datastore** | Azure Database for PostgreSQL Flexible Server, private endpoint, CMK, PITR backups. Schema derived from existing TypeScript types — they are already well-shaped | 2w |
| **ORM + migrations** | Drizzle or Prisma. Migration discipline from commit one | 1w |
| **Server boundary** | Next.js route handlers or server actions. **Every** read/write moves behind it. Today there is one API route | 2w |
| **Identity** | Entra External ID (CIAM) for patients, Entra ID for staff. MFA on staff. Session timeout + idle lock (currently absent) | 1.5w |
| **Authorization — wire `can()`** | `lib/authz/capabilities.ts` is a good model with **zero call sites**. Enforce **server-side** on every mutation. Delete the localStorage `role` (`lib/store.tsx:96`) which currently defaults every user to `"Medical"` | 1.5w |
| **Durable audit ledger** | Move `lib/trace/ledger.ts` off a module array into append-only storage. Consider Azure Confidential Ledger — the simulation is already written (`lib/azure/confidentialLedger.ts`) | 1w |
| **PHI hygiene** | Remove clinical drafts from `localStorage` (`ConsultComposer.tsx:144`). Encrypted server-side drafts | 0.5w |

**Exit criteria:** a member logs a dose on their phone and a coach sees it on a laptop; a page reload loses nothing; an unauthenticated request returns 401; every mutation writes a durable ledger row.

---

## M2 — Close the clinical safety gaps *(~6–8 weeks · depends on M1)*

These are P0 patient-safety and regulatory items. Several are *unmounting problems*, not build problems.

| Workstream | Detail | Effort |
|---|---|---|
| **Controlled substances** | DEA number on staff + location; `scheduleClass` on catalog items; branch validation on it; quantity caps; refill limits with expiry (today `refillsPlaced` only increments); dispensing record. Consider state PDMP integration (NC CSRS, SC SCRIPTS) | 2.5w |
| **Block the one-click testosterone path** | `lib/orders/place.ts` never checks `actor.role`; `requiresProviderApproval` emits a non-blocking `warning` (`:403`) whose remediation text is false. Make it a hard block requiring a provider signature | 0.5w |
| **Chart fundamentals** | Allergy list, problem list, outside-medication list, PMH/PSH/FHx. Absent today — the MTC/MEN2 boxed-warning check literally cannot execute | 1.5w |
| **Real SOAP notes** | `Consult` has one authored field; `subjective`/`objective` are derived by keyword regex and there is **no Assessment and no Plan**. Add structured fields, vitals, ROS. Keep the AI summary as an assist | 1w |
| **Mount `SafetyWatch`** | `lib/ai/safety.ts` correctly computes urgent haematocrit and E2 flags; `components/clinic/SafetyWatch.tsx` renders them; **nothing imports it**. The most safety-critical view in a TRT product is unreachable | 0.5w |
| **Fix coach→clinician escalation** | `raiseEscalation()`'s return value is discarded (`ConsultComposer.tsx:405`); the queue re-seeds from static mock. A coach raising an urgent concern gets a toast and the provider never sees it | 0.5w |
| **Adverse event logging** | No AE entity exists. Severity, outcome, reporting path | 1w |
| **Signature integrity** | `decide()` never writes `signedAt`/`signedBy`. Add attestation text, credential capture, re-auth, and a working addendum writer (the type exists, no UI creates one) | 1w |
| **Supervision / co-sign** | `StaffRole` is 3 values; NP and MD have identical authority. Add clinical credentials, supervising-physician links, NC vs SC oversight rules, co-sign queue | 1.5w |
| **Licensure hardening** | Keep `lib/booking/availability.ts:151-165` — it is the best regulatory control in the repo. Replace `seededRandom` licences with a credentialing table carrying **expiry dates**; re-check at visit time, not just slot generation; extend the gate to prescribing and signing | 1w |
| **Validated instruments** | ADAM / qADAM for men, Greene or MRS for women, plus PHQ-2/9. Zero exist today; six ad-hoc 1–5 scales are not a defensible treatment-response measure | 1w |

---

## M3 — Run the clinic: money and the front desk *(~8–10 weeks · depends on M1)*

Can run in parallel with M2 with a second engineer.

| Workstream | Detail | Effort |
|---|---|---|
| **Payments** | Processor integration (**not** Stripe per prior constraint — evaluate Braintree / Adyen / Authorize.net). Vaulted payment methods, charge/refund. Nothing debits anything today | 2w |
| **Subscription billing** | Distinct from the existing *fulfilment* engine, which is good and should be kept. Proration, pause, cancel, upgrade/downgrade | 2w |
| **Dunning** | Retry ladder, card-update request, auto-pause after N failures, write-off path. Today: one seeded string. **This is where a 5,000-patient book leaks money continuously** | 1w |
| **Invoices + HSA/FSA PDFs** | `lib/receipts/vault.ts` is a strong model asserting `itemised: true` with no generator behind it | 1w |
| **Payment plans** | Advertised by the clinic; absent from the code | 1w |
| **Front-desk persona** | Fourth portal in `lib/portals.ts` (only patient/clinic/coach exist). Check-in / check-out / rooming — `"Checked In"` is a seeded enum with no setter, so there is no encounter clock and no billable-visit basis | 1.5w |
| **Staff-side booking** | `lib/booking/availability.ts` is wired **only** to the patient portal. For a clinic on an 833 line this is the single most important front-desk action | 0.5w |
| **Inventory as a ledger** | Receiving, dispense-with-decrement, waste, cycle count. `quantity` is immutable today; wastage on $210/vial tirzepatide is unmeasurable | 1.5w |
| **Close the lot→patient join** | One lot vocabulary across catalog, inventory and orders (there are currently **three**, one private to `lib/mock/orders.ts`). A real `byLot()` query. In-clinic administration must create a record | 1w |

---

## M4 — Replace GoHighLevel and MindBody *(~6–8 weeks · depends on M1, M3)*

| Workstream | Detail | Effort |
|---|---|---|
| **Lead / CRM model** | `Client` has no source, UTM, campaign, stage history or owner; `addLead` has zero call sites. Apex cannot answer "how many leads last month" | 2w |
| **Pipeline analytics** | Source attribution, speed-to-lead, show rate, close rate, CAC by channel. Requires dated stage transitions, not a status snapshot | 1.5w |
| **Real revenue analytics** | Replace `lib/analytics.ts` fabrications with queries over transactions. Time-cohorted conversion (today a converted-then-churned client counts as converted forever) | 1.5w |
| **Scheduling parity** | Patient reschedule/cancel (absent — the most-used MindBody function), waitlists, recurring visits, calendar sync | 2w |
| **Migration** | MindBody + Google Sheets + GoHighLevel importers, ID mapping, reconciliation reports, dual-run period. **Do not underestimate this** — it is usually where these projects die | 2w |
| **Notification transport** | ACS or Twilio behind the **existing, genuinely good** consent/quiet-hours/rate-cap chain (`lib/comms/send.ts:264-345`), which today wraps a no-op. Ship with a **body allowlist**: no marker names, no drug names, no values in any payload | 1.5w |

---

## M5 — Close the habit loop *(~4–6 weeks · depends on M1, M4)*

The engagement layer is well-designed and disconnected. See `ENGAGEMENT.md`.

| Workstream | Detail | Effort |
|---|---|---|
| **Connect logging to rings/streak/XP** | Rings and streaks read `seededRandom` (`lib/daily/today.ts:347`). A member can log every dose for a month and nothing moves | 1.5w |
| **Move the provider to a layout** | `MemberLogProvider` is on `app/portal/page.tsx:114`; there is no `app/portal/layout.tsx`, so logging is impossible on every other route | 0.5w |
| **`DayLog` history** | Holds one day; restore is gated on today's date. Nothing accumulates | 0.5w |
| **Gamification opt-out** | **P0.** Zero matches repo-wide. Clinical experience already survives without it — there is simply no opt-out to take | 0.5w |
| **Lab-day reveal** | Mount `components/portal/LabExplainer.tsx` (built, imported by nothing) behind a `panel.first_opened` moment | 1w |
| **Coach reactions on member logs** | Requires a coach-side journal read surface, which does not exist | 1w |
| **Progress photos + PRs** | The two classic investment artifacts; both entirely absent | 1.5w |

---

## M6 — Staff efficiency *(~3–4 weeks · depends on M1, M2)*

Mostly *mounting existing work*. Roughly 2,000 lines of the best code in the repo are unreachable.

| Workstream | Detail | Effort |
|---|---|---|
| Mount `QuickReply`, `BulkBar`, `SavedViews`, `PatternInsights`, `LabDropzone` | All finished, all imported by zero files | 1w |
| Coach messaging inbox | **A coach cannot message a client anywhere in this app** | 1w |
| Win notifications to coach | `NotificationBell` has four types, **all negative**. No good-news channel to staff exists | 0.5w |
| "Clients helped this week" | Every staff stat is a backlog count | 0.5w |
| Ownership morning dashboard | Repoint `app/admin/daily-report` at consults/conversions/revenue and put it in a nav tree — it is currently URL-only | 1w |

---

## Sequencing summary

```
M0  Stop the bleeding        ── 1w   ── no dependencies, do now
M1  Foundation               ── 8-10w ── blocks everything
    ├── M2  Clinical safety  ── 6-8w  ── parallel with M3
    ├── M3  Money + front desk ── 8-10w
    │       └── M4  Replace GHL/MindBody ── 6-8w
    │               └── M5  Habit loop ── 4-6w
    └── M6  Staff efficiency ── 3-4w  ── parallel, after M2
```

**Realistic total to "runs the clinic": 9–14 months with 2–3 engineers**, and that assumes migration goes well. The prototype work is not wasted — it is arguably 60–70% of the product *design* — but it is close to 0% of the product *system*.

---

# Insane Value

Features beyond parity that would make Apex a genuine differentiator rather than a MindBody replacement. Ordered by defensibility.

**1 · AI lab interpretation drafts, with the epistemics already built.**
`lib/clinical/monitoring.ts` carries a `basis` field on every rule — `published-standard` / `clinic-policy` / `no-established-standard` — rendered as a visible chip, and the engine emits a requirement **with no due date** rather than inventing an interval. `lib/clinical/interactions.ts:349` renders `SCREEN_COVERAGE`, naming exactly what the screen structurally cannot see. That discipline is rarer than the AI. An interpretation draft built on it — every claim carrying its basis and its blind spots, clinician-reviewed before it reaches the patient — is defensible in a way that a raw LLM summary never is.

**2 · Protocol-adjustment suggestions with the guardrails already proven.**
The signature gate (`app/recommendations/page.tsx:203`) already excludes blocking findings from batch signing, requires individual acknowledgement, and records finding **ids** in the ledger rather than a count. Extend from "which compound" to "what change, given this trajectory" — using `lib/labs/velocity.ts`, which refuses to project below three points and refuses a crossing date when the slope CI straddles zero. The refusals are the product.

**3 · Rule-set second opinion.**
`lib/rules/secondOpinion.ts` runs the engine under two configurations and surfaces the disagreement set, distinguishing `rule-off` from `displaced`. This is genuinely novel: it makes visible the moment a rules edit silently becomes an unreviewed clinical policy change. No commercial product I know of does this.

**4 · Patient-facing lab trend storytelling.**
`components/portal/LabExplainer.tsx` — band scale, trend before explanation, lifestyle levers — is built and dead. Marker-by-marker on lab day, "testosterone 312 → 847" as an arrival moment, is the single highest-ceiling retention mechanic in TRT/HRT.

**5 · Symptom-score ↔ lab correlation, honestly bounded.**
`lib/symptoms/journal.ts` already forces a `caution` and a sample size onto every correlation and refuses below a minimum n. Pair validated instruments (M2) with panels and you can show a patient their ADAM score falling as free testosterone rises — with the uncertainty stated. Subjective improvement made undeniable is why people renew.

**6 · Automated pre-visit prep.**
`lib/coach/sinceLastVisit.ts` and `ConsultPrepBrief` already exist and are good: three-valued verdicts (`did` / `did not` / **`no evidence`**) rather than assuming silence means non-compliance. Extend to clinicians. The engagement hook for medical staff is "this saves me ten minutes per patient" and nothing else.

**7 · Churn-risk scoring for coach outreach.**
`lib/coach/adherenceRisk.ts` computes from real signals and **shows the contributing reasons** rather than a bare score. Once the habit loop is connected (M5) it becomes predictive rather than descriptive.

**8 · Smart refill forecasting against inventory.**
`lib/protocol/runway.ts` (days of supply) plus `lib/subscriptions/engine.ts` (advance-before-place with CAS) plus real inventory movement (M3) = ordering before a patient runs out, netted against what is actually on the shelf at their location. Running out is the commonest reason a protocol lapses.

**9 · Recall answerability as a sellable property.**
Once the lot join closes (M3), "who received lot BPC-2604A?" becomes a one-second query. Most compounding-adjacent clinics cannot answer this at all. It is a genuine competitive and regulatory differentiator — the comments already claim it; make them true.

**10 · Member-facing access log.**
`app/portal/access/page.tsx` turns HIPAA §164.528 from a 60-day written request into a live screen. Once the ledger is durable (M1) this is a trust feature no incumbent offers, and it costs almost nothing because the action vocabulary (`view` / `export` / `break-glass`) is already first-class.
