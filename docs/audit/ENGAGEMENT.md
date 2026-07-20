# Apex — Engagement & Habit-Loop Audit

*Audit date: 2026-07-20 · Commit `4e7b970`*

---

## The finding that subsumes every other

**The habit loop is not closed. It is not connected.**

Everything a member logs writes to `lib/member/logStore.tsx`. Everything a member *sees* about what they have done — rings, streak, XP, level, quests, season, leaderboard — reads from `lib/daily/today.ts:347-355`:

```ts
const rand = seededRandom(`${client.id}-ringhistory`);
const roll = rand();
return { closed: roll > 0.26, protectedDay: roll > 0.2 && roll <= 0.26 };
```

**A member can log every dose for a month and their streak, level and quest board will not move by one point.**

Three compounding defects:

1. **The provider is on a page, not a layout.** `MemberLogProvider` is mounted at `app/portal/page.tsx:114`; `app/portal/layout.tsx` **does not exist**. `useMemberLog` therefore throws on every other portal route — logging is physically impossible outside `/portal`.
2. **`DayLog` holds one day.** No history array (`logStore.tsx:46-53`); restore is gated on `parsed?.date === date` (`:98`). Nothing accumulates.
3. **`logStore` feeds three components** — `QuickLog`, `TodayDoses`, `TodayBlock` — and nothing else.

The entire **Investment** quadrant of the Hook Model is a 120-day `seededRandom` fiction the member never wrote (`lib/symptoms/journal.ts:238-251`). The file's own header names this exact failure and claims to have fixed it (`logStore.tsx:10-17`: *"a picture of adherence rather than a record of one"*). It fixed it for one card on one route.

**Severity: P0 beyond engagement.** The coach's adherence-risk worklist and the clinician's view of whether a patient is taking their medication both read the same fiction.

---

## Per-mechanic ratings

### CLIENT — Triggers

| Mechanic | Rating | Evidence |
|---|---|---|
| Protocol-timed push | **MISSING** | `lib/comms/send.ts:204` — `new DemoProvider()` returns a SHA-256; `AcsProvider` throws by design (`:188`). No `serviceWorker`, `PushManager`, `web-push` or `manifest.json` repo-wide |
| Nudge/trigger engine | **PARTIAL — orphaned** | `lib/engage/nudges.ts` — 7 trigger kinds, strict suppression stack. `nudgeFor` (`:591`) called by **nothing** |
| Curiosity triggers (open, don't dump) | **MISSING** | `lib/staff/templates.ts:190` — identified as a problem, delegated to coaches as an `editHint`. No redaction function, no lock-screen-safe variant |
| Anticipation / countdown | **EXISTS** | `components/portal/SeasonArc.tsx:79-88` — "N days to your recap" plus a dated clinical chapter rail. Best trigger-adjacent mechanic in the build |
| Scheduled report reveal | **MISSING** | `seasonRecap` computes; nothing schedules or reveals it |
| Consent / quiet hours / rate cap | **EXISTS** | `lib/comms/send.ts:264-345` — fails closed, 3 legal regimes, 21:00–08:00 quiet hours, weekly cap of 5. **Production-grade, wrapped around a no-op** |

### CLIENT — Action

| Mechanic | Rating | Evidence |
|---|---|---|
| "Today" screen closeable <60s | **PARTIAL** | `app/portal/page.tsx:173` — `TodayBlock` correctly hoisted, but 9 read-only blocks sit below it and its "N things left" counter silently excludes food, training and journal |
| Every action ≤2 taps | **FAILS** | only dose logging qualifies — see click table |
| Log-from-notification | **MISSING** | no notification layer to log from |
| Zero-friction capture (HealthKit / scale) | **MISSING** | none; weight is manual keyboard entry |
| Member bottom nav | **PARTIAL** | `components/layout/BottomNav.tsx:37-43` — Today / Progress / Protocol / Labs / Messages. **Four of five are read-only; no Food, Journal or Training tab** — the three daily-input surfaces sit behind a hamburger |

### CLIENT — Variable reward

| Mechanic | Rating | Evidence |
|---|---|---|
| Weekly recap, different insight each time | **PARTIAL** | `lib/member/weeklyReview.ts:527-536` — deterministic priority ladder, no rotation, no unseen-insight tracking. Against a pinned clock it renders byte-identical forever |
| Lab-day marker-by-marker story | **MISSING — built, dead** | `app/portal/labs/page.tsx:346-400` is a static grouped table. **`components/portal/LabExplainer.tsx` (BandScale, trend-before-explanation, lifestyle levers) is imported by zero files** |
| Coach reactions on logs | **MISSING** | `components/portal/SymptomJournal.tsx:151` — toast claims *"Your coach can see this"*; handler only calls `setSaved(true)` |
| Surprise milestone drops | **PARTIAL** | `lib/growth/milestones.ts:56-57` — fixed marks, no randomness, no first-seen tracking, no arrival moment. Shown only on `/portal/refer` |
| Celebrations | **EXISTS** | `components/celebrate/**`; `DoseLoggedBurst` genuinely varies — real sequence, hydropathy geometry, real PK curve. **See P0-2** |
| Streaks with grace tokens | **EXISTS — best in build** | `lib/play/streak.ts` — see below |

### CLIENT — Investment

| Mechanic | Rating | Evidence |
|---|---|---|
| Compounding trend history | **PARTIAL (fabricated)** | `lib/symptoms/journal.ts:238-251` — 120 days of `seededRandom`; member logs never join it |
| Progress photo timeline | **MISSING** | no route, component or model |
| Personal records | **MISSING** | `lib/training/workouts.ts` — no load, reps, 1RM or session history. `/portal/train` is a read-only prescription renderer |
| Symptom-score history | **PARTIAL** | real trend/correlation math on generated data; saves write nothing |
| Coach relationship thread | **PARTIAL** | `app/portal/messages/page.tsx` — 3 hardcoded messages, memory-only appends; header claims *"kept forever"* (`PortalHeader.tsx:157`) |
| Program-week content drip | **MISSING** | `lib/education/library.ts:650-712` — ranked on markers/goals against a coarse 4-step lifecycle, not protocol week |
| Referral at milestone | **PARTIAL** | `app/portal/refer/page.tsx:30-32` — layout order above an unconditional component, not a trigger |
| Opt-in community / leaderboard | **EXISTS — verified** | `lib/play/leaderboard.ts:87,103` — consent at source, `LeaderboardRow` carries no `clientId` or name **by type**, k-anon floor refuses rather than degrades |

### STAFF

| Mechanic | Rating | Evidence |
|---|---|---|
| Ranked at-risk queue | **EXISTS — best in build** | `components/coach/TodayQueue.tsx:115-184`; frozen sort (`:249`) so worked rows hold position |
| One-tap outreach | **MISSING — built, unmounted** | `components/coach/QuickReply.tsx` — 386 lines, consent guards, idempotency, ⌘↵. **Imported by nothing** |
| Bulk actions | **MISSING — built, unmounted** | `components/coach/BulkBar.tsx` — per-record ledger rows, compensating-write undo. **Imported by nothing** |
| "Clients helped this week" | **MISSING** | `app/coach/page.tsx:206-221` — four stats, all backlog counts. Gamification is built for patients and pointedly absent for staff |
| Win notifications to coach | **MISSING** | `components/NotificationBell.tsx:37-42` — four types, **all negative**, scoped by location not coach. **No good-news channel to staff exists** |
| Caseload health per coach | **MISSING** | `lib/roster/health.ts` is roster *data-quality*; `coachId` is not a filter dimension |
| Pre-visit summaries | **EXISTS** | `components/coach/ConsultPrepBrief.tsx`, `lib/coach/sinceLastVisit.ts` |
| One-screen lab deltas | **EXISTS** | `components/clinic/LabVelocityPanel.tsx` |
| Protocol suggestion drafts | **EXISTS** | `app/recommendations/page.tsx:230-266` — blocking-interaction gate |
| Front desk live day view | **MISSING ENTIRELY** | `lib/portals.ts:62-103` — only patient, clinic, coach. No front-desk persona, no check-in control |
| Ownership morning dashboard | **PARTIAL + unreachable** | `app/admin/daily-report/page.tsx` — 383 real lines, in **no nav tree**, and it is an *order* report |
| Shrinking queues / completion states | **EXISTS — strong** | `TodayQueue.tsx:516-528`, `MobileSignQueue.tsx:424`, `AdherenceWorklist.tsx:213` |

---

## Click counts (read from UI code)

| Flow | Taps | Path / note |
|---|---|---|
| Client logs today's dose | **2** | `TodayDoses.tsx:277` → site chip `:223`. **Never 1** — `:278` returns before committing and all six seeded templates set `rotateSites: true`. Then a **2.1s blocking full-screen overlay with no tap-to-dismiss** |
| Client daily check-in | **4** | `QuickLog.tsx:155` ×4, auto-commits on the 4th — no submit button, genuinely good |
| …same via `/portal/journal` | **9** | hamburger → sidebar → 6 ratings → Save — **which writes nothing** |
| Client logs weight | **5–7** | only keyboard entry left in the daily loop |
| Client logs a meal | **∞** | no `logMeal`, no `mealsLogged`. `MealLibrary` is a cookbook |
| **Coach logs a check-in** | **1 — and it writes nothing** | `TodayQueue.tsx:502` → toast *"Written to the ledger"*; **zero `appendLedger` calls in the file** |
| …real path | **5 + typing** | and it deletes the only durable copy (the localStorage draft) on sign |
| **Coach messages a client** | **∞ — no path exists** | no coach inbox; `QuickReply` unmounted |
| **Clinician approves a refill** | **does not exist** | nearest is a *coach* action: `app/coach/subscriptions/page.tsx:403` "Place refill", **1 click, no confirm, no role check** |
| Clinician signs a chart | **2** | `MobileSignQueue.tsx:559` — real ledger write. **No confirmation, no attestation, no credential re-entry, no undo**; auto-advances after 320 ms |
| Front desk checks a patient in | **N/A** | surface does not exist |

**Note the inversion:** the *coach's* note requires a two-step confirm with an immutability warning. The *provider's* co-signature — the one with legal weight — is a single unconfirmed tap.

---

## Friction inventory

1. **Logging is route-locked** — provider on a page, not a layout (`app/portal/page.tsx:114`).
2. **Site picker doubles every dose** — unavoidable; every seeded rx rotates.
3. **2.1s blocking modal per dose**, no early dismiss (`DoseLoggedBurst.tsx:110`).
4. **A mistyped weight is uncorrectable for the day.** The edit affordance is `className="hidden" aria-hidden` and passes `NaN` (`QuickLog.tsx:75-80`) — if reachable it would render "NaN lb logged" and write `Member logged NaN lb` to the ledger.
5. **Check-in is irreversible on mis-tap** — `disabled={!!feelDone}` on the 4th tap (`QuickLog.tsx:154`), no Back. The dead `CheckIn.tsx:164-173` had one.
6. **Undo writes no compensating ledger row** — `undoDose` (`logStore.tsx:157-162`) filters local state; the ledger permanently asserts a retracted dose. `BulkBar.tsx:44-45` does this correctly; the member surface does not.
7. **Journal Save is a no-op with a false promise** (`SymptomJournal.tsx:149-154`).
8. **Coach "Log touch" toasts a write that never happens** (`TodayQueue.tsx:284`). Two buttons labelled "Sign"; one is theatre.
9. **Progress-page streak tiles are fabricated** and shown as the member's record — `seededRandom(ME + "streaks")` (`app/portal/progress/page.tsx:148-155`).
10. **Messages claim "kept forever"**; memory-only.
11. **Nine dead components**, several the best work in the repo: `LabExplainer`, `TodayMoments`, `NotificationPrefs`, `CheckIn`, `PeopleLikeYou`, `QuickReply`, `BulkBar`, `SafetyWatch`, `SavedViews`. Plus `daily-report` reachable only by typing a URL.
12. **In-memory ledger** — every "committed" staff action dies on refresh.

---

## Grace, forgiveness and tone — what is genuinely excellent

**`lib/play/streak.ts` is the strongest engagement work in the build.**

- **Shields**: 1 per 14 closed days, cap 2 (`:59-61`) — **earned only; explicitly no purchase path, no ad-watch, no "restore for $4.99"** (rule 2, `:26-29`).
- **Protected days cost nothing and spend no shield** (`:138-141`). `PROTECTED_REASONS` = provider hold, scheduled washout, coach-logged illness, fasting for labs.
- **Travel mode protects the whole window** (`components/portal/TravelMode.tsx:149`).
- **The cushion is disclosed before the fact** (`:345-347`) — *"If today doesn't happen, a shield covers it automatically"* — explicitly so nobody trains at 11pm out of fear.
- Streak is a **replay, not a stored counter**, so a reviewer can point at the exact day a shield was spent.

**Shame / guilt / fake urgency: none.** Nearly every grep hit is a comment arguing *against* the pattern:

- `lib/engage/nudges.ts:417` — *"If today isn't the day, that's fine — a day your provider told you to pause is held, not lost."*
- `components/portal/NotificationPrefs.tsx:290` — *"Everything is off, and that is a perfectly reasonable setting."*
- `lib/staff/templates.ts:303` — *"Never imply they lost progress or wasted their money. Loss framing about someone's body is manipulative."*

---

## Guardrail findings

**CLEAN — dose/outcome pressure in scoring.** `XP_WEIGHTS` (`lib/play/levels.ts:64-77`) has six keys, all behaviours. No biomarker, no weight delta, no dose count. `lib/play/quests.ts:73` enforces this at **runtime** with a `DOSE_SHAPED` regex that drops any dose-shaped quest with a console warning.

**CLEAN — paused clients are not penalised.** `protectedDays = 10`, identical to `ringsClosed`, deliberately. Protected days extend the streak and spend no shield. The leaderboard inherits the property.

**CLEAN — leaderboard privacy.** Opt-in at source; no identity in the row type; k-anon floor.

### P0-1 — There is no gamification opt-out
Verified: zero matches repo-wide for `hideXp|gamif|showXp|hideLeaderboard|optOut`. `lib/portalStore.tsx` carries theme only; `app/settings/page.tsx` is a **staff** console. `NotificationPrefs` governs whether a message is *sent about* a mechanic, never whether it renders. A member who wants none of this still gets `StreakCard`, the season/quests/level section, `LevelCard` with confetti, and fabricated streak tiles.

The clinical experience *would* survive an opt-out — labs, protocol, journal, messages, plan-of-care and consents are all independent of `lib/play/*`. **There is simply no opt-out to take.** The codebase makes this argument for notifications (`NotificationPrefs.tsx:250`) and never applies it to display.

### P0-2 — A blocking full-screen reward fires on medication administration
`components/portal/DoseLoggedBurst.tsx` throws a blocking 2.1-second full-screen modal (`:110`, `fixed inset-0`, no dismiss) on every logged dose. It is the **only** celebration in the product that varies — animated molecular backbone, PK curve — and it is captioned **"your level steps up"** (`:207`).

The scoring layer is scrupulous about never rewarding a dose. The UI delivers the richest variable reward in the entire build for exactly that act, using the word *level*. `DayComplete` by contrast is `pointer-events-none` and non-blocking. This is the sharpest contradiction between the codebase's stated rules and its shipped behaviour, and it was introduced during this development cycle.

### P0-3 — A staff button asserts a clinical write that never happens
`components/coach/TodayQueue.tsx:284` toasts *"Written to the ledger"* with zero `appendLedger` calls in the file, and `lib/mock/contactLog.ts` has no write API. A coach who clicks "Log touch" believes a contact is on record. It is the most-clicked button on the coach home screen.

### P1 — PHI exposure surfaces if notifications are ever wired
- `lib/staff/templates.ts:202-207` `protocol-starting` (Email) interpolates `{{protocolName}}` and `{{providerName}}` — the only template putting a treatment identifier off-portal. Every other template is disciplined; `labs-ready` correctly routes to encrypted Portal and names no values.
- `lib/ops/broadcast.ts:324` `sendBroadcast` accepts **free-text operator body with no content validation** (`send.ts:277` checks non-empty only) and can target the `results-ready` clinical segment by SMS. Scope laundering is blocked; PHI-in-body is not checked at all.
- `lib/engage/moments.ts:281,310,384` carry lab markers, medication names with hold reasons and body-comp deltas — in-app today, lock-screen disclosures if reused as push bodies.

---

## Top 5 client mechanics, by expected retention impact

**1 · Connect the loop — make logged actions the source of rings, streak and XP.**
Nothing else matters until this is done; today the core promise is a PRNG.
*Data model:* `DayLog[]` keyed by member+date (replace the single-day shape), server-side, append-only.
*Events:* `dose.logged`, `dose.skipped{reason}`, `checkin.submitted`, `weight.logged`, `day.closed`, `day.protected{reason,setBy}`.
*Also:* move `MemberLogProvider` to `app/portal/layout.tsx`; repoint `ringHistory`/`behaviourFor` at real rows.

**2 · Ship the lab-day reveal — mount `LabExplainer` behind an arrival moment.**
Highest-ceiling variable reward in TRT/HRT, already built, currently dead. "312 → 847" is why members stay.
*Data model:* `LabPanel{collectedOn, releasedAt, markers[{name,value,unit,refLow,refHigh,priorValue}]}` + `MemberSeen{panelId, seenAt}` so first-open is a distinct beat.
*Events:* `panel.released`, `panel.first_opened`, `marker.expanded`.

**3 · Real external triggers with curiosity gating.**
The decision engine and the entire consent/quiet-hours/cap chain are done and good. Missing: a transport and a scheduler.
*Data model:* `PushSubscription{memberId, endpoint, keys}`, `NotificationOutbox{memberId, kind, sendAfter, dedupeKey, state}`.
*Events:* `notification.scheduled|sent|opened|dismissed`.
*Ship with a body allowlist* — no marker names, no drug names, no values in any payload. Closes P1 and creates the curiosity trigger in one move.

**4 · Coach reaction on a specific logged item.**
The cheapest large retention win. A named human responding to *your* Tuesday entry beats any confetti, and converts the journal from a diary into a relationship.
*Data model:* `LogReaction{targetType:'checkin'|'dose'|'weight', targetId, staffId, kind:'ack'|'note', body?, createdAt}`. Requires a coach-side journal read surface, which does not exist.
*Events:* `log.reacted`, `reaction.seen`. Deliver at a **variable** delay, not instantly.

**5 · Investment artifacts — progress photos and personal records.**
Both entirely absent; both are classic switching costs. Twelve months of photos and a lift history are assets a member will not abandon.
*Data model:* `ProgressPhoto{memberId, takenOn, pose, storageKey, visibility}` — private by default, never in a share card (reuse the refusal logic at `lib/growth/milestones.ts:243`); `SetLog{workoutId, exerciseId, loadKg, reps, at}` + derived `PersonalRecord`.
*Events:* `photo.captured`, `set.logged`, `pr.achieved`.

**Deliberately not on this list: more gamification.** The XP/quest/season layer is already ethically well-built and is not the constraint. **Add the opt-out (P0-1) and remove the dose reward (P0-2) before adding a single mechanic.**

---

## Top 5 staff mechanics, by time saved

**1 · Make the coach queue write — mount `QuickReply` and `BulkBar`, fix the lying toast.**
Both are finished, careful and unreachable. The coach persona is an interface shell over a working data layer, and its most-clicked button is theatre. This is wiring, not building.
*Data model:* a real `ContactEntry` write API on `lib/mock/contactLog.ts`.
*Events:* `contact.logged{channel, templateId, outcome}`, `queue.item_cleared`.

**2 · Front desk day view — the entire persona is missing.**
`Appointment.status` is declared, seeded, colour-coded and reported on, and can never be set. A 5,000-patient clinic runs its front desk on something else, which means Apex is not the system of record for arrivals.
*Data model:* `Appointment.status` transitions + `ArrivalEvent{apptId, at, byStaffId}`.
*Events:* `patient.arrived`, `patient.roomed`, `visit.completed`. Add a fourth persona to `lib/portals.ts` and `lib/nav.ts`.

**3 · Win notifications to the owning coach, with one-tap congrats.**
`NotificationBell` has four types, all negative, scoped by location. There is no good-news channel to staff anywhere. Cheapest way to make the coach console an app someone *wants* to open — and the congrats message drives client retention, closing the loop.
*Data model:* `StaffNotification{staffId, kind:'milestone'|'lab_improved'|'streak', subjectId, createdAt, readAt}`; requires a real `coachId → member` ownership edge.
*Events:* `milestone.reached`, `panel.improved`, `staff_notification.acted`.

**4 · "Clients helped this week" — a personal impact counter.**
Every staff stat today is a backlog count. Coaches burn out on queues that only measure what they have *not* done.
*Data model:* weekly aggregate over `ContactEntry` + `LogReaction` + signed notes by `staffId`.
*Events:* reuse the above — no new emission once #1 lands.

**5 · Ownership morning dashboard — repoint `daily-report` and put it in a nav tree.**
383 real lines nobody can reach, answering the wrong question. An owner opens an app for consults, conversions, revenue and at-risk — not order flags.
*Data model:* daily rollups — `consults_held`, `consults_converted`, `mrr_delta`, `at_risk_count`, `churned_30d`.
*Events:* `consult.completed{outcome}`, `subscription.started|paused|cancelled{reason}`.

---

## Measurement plan

Nothing below is measurable today — there is no analytics pipeline, no event bus and no persistence. These become available only after milestone M2 (see `ROADMAP.md`).

| Metric | Definition | Target | Instrumentation |
|---|---|---|---|
| DAU / WAU | distinct members with ≥1 logged action | >0.55 ratio | `dose.logged`, `checkin.submitted`, `weight.logged` |
| D30 / D60 / D90 retention | % of a join cohort with ≥1 action in the window | 70 / 55 / 45 | cohort on `member.activated` |
| Streak length distribution | p50 / p90 of active runs, shields spent | p50 ≥ 14 | `day.closed`, `shield.spent` |
| Notification open rate | opened ÷ delivered, by `kind` | >35% for `panel.released` | `notification.sent|opened` |
| Lab-day engagement | % of released panels opened <24h; markers expanded per open | >80%, ≥5 | `panel.first_opened`, `marker.expanded` |
| Coach reaction latency | log → first staff reaction | p50 <24h | `log.reacted` |
| Clicks per staff task | measured, not estimated, per flow in the table above | check-in ≤2, refill ≤3 with a confirm | UI instrumentation |
| Opt-out rate | members disabling gamification | tracked, **never optimised against** | `prefs.gamification_disabled` |

**A guardrail on the measurement itself:** adherence must never be reported as an engagement metric to staff without the `protectedDay` split. A clinic that optimises "days closed" will pressure patients their provider told to pause.
