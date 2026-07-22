# Aug 7 cutover — what the roadmap, the roster and the NCV spec actually require

> Status note (2026-07-22): this is the original planning analysis. Apex now has an
> isolated non-production environment and the contrast sweep is clean. Use
> `READINESS_STATUS.md` for current completion/blocker status and
> `CUTOVER_RUNBOOK.md` for the controlled migration and rollback procedure.

Companion to `SYNC_2026-07-21_ACTIONS.md`. That doc turned the call into changes.
This one takes the three artifacts that arrived after it — the **product roadmap**, the
**staff roster**, and **Stephanie's NCV scheduling requirements** — and says what they
change.

One line summary: the roadmap's Aug 7 entry is not "V2 data structure foundation release."
It is ***"Mindbody and GHL go away."*** Those are different projects, and the second one
has three dependencies with lead times that cannot be compressed by working harder.

---

## 1. The date is not Aug 7. It is Wed Aug 5.

The roadmap sets **QA complete by noon Thursday Aug 6**. Working backwards:

| | |
| --- | --- |
| Today | Tue Jul 21 |
| V1 release (not Apex) | Fri Jul 24 |
| V1 bug-fix release, QA complete noon Jul 30 | Fri Jul 31 |
| **Apex code freeze** | **Wed Aug 5** |
| QA complete | noon Thu Aug 6 |
| Cutover | Fri Aug 7 |

**Eleven working days**, two of which are consumed by V1 releases. Everything below is
scoped against eleven, not seventeen.

Also: **Apex has no dev environment.** There is one Container App, `ca-apex`, and it is
production. The roadmap has formal QA gates and Matt is the tester. Stand up `ca-apex-dev`
with its own Postgres and seed **this week**, or QA on Aug 6 means Matt testing in prod on
the morning of a cutover.

---

## 2. Three things that can kill Aug 7, in lead-time order

These are not build tasks. They are **wait tasks**, and the waiting starts the day someone
files the request. Every one of them should be started this week regardless of what else
slips.

### 2.1 Cards on file — the one nobody has mentioned

MindBody vaults members' cards with **MindBody's** processor. Alpha is moving to **Clover**.
Vault tokens do not transfer between processors by copying a column. There are two paths:

1. **Processor-to-processor vault migration** — PCI-scoped, requires both the losing and
   gaining processor to cooperate, and is measured in weeks. It has to be *requested*, and
   MindBody has no commercial incentive to be fast about it.
2. **Re-collect every active member's card** — a campaign that has to run for weeks before
   cutover and will never reach 100%.

If neither has happened by Aug 7, **recurring membership billing fails on Aug 8** for
everyone whose card did not come across, and the clinic finds out via failed charges rather
than via a plan. This is the single most likely way the release turns into an incident.

**Action this week:** ask MindBody for a vault export / migration path in writing, and ask
Clover what they support on the receiving side. Whichever answer comes back, the re-collect
campaign should start anyway as the fallback — it costs a message and buys the difference.

### 2.2 Mass texting — A2P 10DLC registration

The roadmap lists *"mass text marketing capabilities and all associated features like DNC"*
as an Aug 7 deliverable. US carriers require **A2P 10DLC brand + campaign registration**
before a number can send application-to-person traffic. Brand registration is quick;
**campaign vetting is carrier-dependent and runs days to weeks**, and healthcare-adjacent
use cases attract more scrutiny, not less. Unregistered traffic gets filtered or blocked
outright — it does not fail loudly, it just doesn't arrive.

**Action this week:** provision the ACS numbers and file the 10DLC brand + campaign now,
with the real use case described honestly. Verify current lead times rather than assuming;
they move.

Related and equally non-negotiable: **DNC / opt-out state must migrate out of GHL before
the first send.** Texting someone who unsubscribed in GHL is TCPA exposure at statutory
damages per message, and the suppression list is the least glamorous and most expensive
thing to forget.

### 2.3 Email marketing — domain authentication and warmup

Moving email off MindBody/GHL means Alpha starts sending from new infrastructure. That
requires SPF, DKIM and DMARC on the sending domain, ACS Email domain verification, and a
**sending quota increase** (the default limits are low and raising them is a request with
a turnaround, not a config toggle). Then the part nobody schedules: **reputation warmup**.
A cold domain that sends a full marketing list on day one lands in spam, and the recovery
takes longer than the warmup would have.

**Action this week:** verify the domain, publish the DNS records, file the quota increase,
and begin warmup with transactional mail — which Apex is already sending anyway.

### 2.4 Also on the clock, less severe

- **Clover API keys and the four merchant IDs.** Paul said "very shortly." Needed in a
  sandbox well before Aug 5, not on Aug 5.
- **MindBody + GHL data export.** Patients, appointments, memberships and packages,
  contracts, notes, marketing lists with consent state. MindBody's API is rate-limited and
  app access is gated. The export must be *rehearsed* before freeze, with a final delta
  pull at cutover.
- **Website forms and booking widgets** currently post to GHL. The swap is a scheduled
  change on properties Apex does not control.

---

## 3. Recommended re-scope: two dated cutovers, not one

The clinical half of Aug 7 is achievable. The commerce and marketing half is gated on
§2.1–2.3, none of which Apex controls. Proposing the split now — while there is time to
plan it — is a much better conversation than discovering it on Aug 5.

**Aug 7 — clinical cutover.** Apex becomes the system of record for scheduling, the EMR,
intake → POC, orders and the member portal. MindBody goes **read-only**: no new bookings,
no new members, still available for history and still running existing recurring billing.
GHL's *inbound* (site forms, booking widgets) repoints to Apex, which is what kills the
human-in-the-loop intake trigger.

**~Aug 21 — commerce + marketing cutover.** Clover recurring billing goes live once cards
have moved or been re-collected. Marketing sending goes live once 10DLC and domain warmup
are done. GHL and MindBody both switch off.

"MindBody and GHL go away" still happens. It happens as two dated events, and neither one
is gated on a dependency that cannot be compressed.

---

## 4. Stephanie's NCV spec vs. what the booking engine can express

The NCV is **three components with three different credential requirements**, and the
governing principle is *"always utilize the lowest appropriate clinical license."*

| Component | Required | Priority order |
| --- | --- | --- |
| Coach Introduction | Performance Coach | Coach only, no substitution |
| Lab Draw | RN/LPN, NP, or PA | 1. Nurse → 2. NP/PA |
| Physical Examination | NP, PA, or Physician | 1. NP/PA → 2. Physician |

**Apex cannot currently express any of this.** `StaffRole` is
`"Admin" | "Coach" | "Medical"` (`lib/types.ts:35`) and `VisitType.roles` is
`StaffRole[]`. So to the booking engine, Belal Khokhar (Medical Director) and Nathalie
Callahan (Nurse) are the same resource. The scheduling priority that Stephanie's entire
document exists to encode — prefer the nurse, protect provider capacity — is **exactly
inverted** by a role model that can't tell them apart.

Worse, `VISIT_TYPES` currently declares **Lab Draw** as `roles: ["Medical", "Admin"]`
(`lib/booking/availability.ts`). An office manager is not a qualified phlebotomist.

### What to build

1. **Credential-based scheduling, not role-based.** `staffCredential` already exists with
   the right shape — `credential`, `state`, `licenseNumber`, `expiresOn`, `deaNumber`,
   `supervisingStaffId`. Make the booking engine resolve resources by **credential class**
   (`RN | LPN | NP | PA | MD | DO | Coach`), with `StaffRole` retained only for app
   authorization. Two different questions; they have been one field.
2. **A composite `New Client Visit` appointment type** — one member-facing booking that
   schedules three linked components, each with its own resource, in sequence, on one day
   at one location. Not three separate bookings the front desk has to keep in step.
3. **A priority-ordered resource resolver.** For each component: try priority 1, fall back
   to priority 2, and if neither exists at that location on that day, **say so** rather
   than offering the slot. The existing rule in `lib/booking/availability.ts` — never
   offer a slot that doesn't exist — is the best thing in that module; this extends it.
4. **The two-team-member model is a real case, not a degenerate one.** When no nurse is
   available, one NP/PA performs both the lab draw and the physical. The resolver must be
   able to assign the same person to two components without double-booking them against
   themselves.
5. **Expired licence = not schedulable.** `staffCredential.expiresOn` exists and there is
   an index on it. A booking engine that schedules a lapsed licence is a compliance event
   with a paper trail.

### Sequencing note

The spec puts "review of laboratory indications" inside the Physical. Matt's flow has labs
coming back **after** the visit, with an admin entering results and the plan of care
following. Those are consistent only if the physical reviews *which labs were indicated and
ordered*, not results. Worth confirming with Stephanie in one sentence, because the whole
POC timing depends on it.

---

## 5. The roster tells you things the roster wasn't asked

29 real staff after excluding the five Alpha Gym trainers. Mapping the call's first names
to it:

| Called on the call | Roster | Note |
| --- | --- | --- |
| "Bal" | **Belal Khokhar** | Medical Director, Myrtle Beach |
| "Holly" | **Holly Marlowe** | NP, Myrtle Beach — "all local MB females" |
| "Chris Dominguez" | **Chris Domingez** | PA, Southern Pines — roster spells it without the *u*; pick one |
| "Natalie", who owns the intake form | **Nathalie Callahan** | Nurse, Myrtle Beach |
| "Mark", the telehealth coach | **Marc McCully** | Coach, Myrtle Beach |
| "Ashley at the front" | **Ashley McAleavy** | Office Manager, Raleigh |
| "Amanda, the new girl" at MedSource | **Amanda Pheabus** | Fulfillment Specialist, part time — the restricted role Matt asked for. Note there are **two Amandas**; the other is Amanda Gibbons, Stephanie's assistant |
| "Melissa puts the tracking number on" | **Melissa Ha** | Order Manager |
| Author of the NCV spec | **Stephanie Butler** | COO |

### 5.1 Every NCV location has a single point of failure

Run Stephanie's three-component requirement against the roster:

**Myrtle Beach** — 3 coaches, nurse Nathalie, NP Holly, Medical Director Belal, telehealth
physician Jerry Cattelane. Full depth at every component. Healthy.

**Raleigh** — **one coach** (Zac Duffy), one nurse (Rebecca Truesdell), one NP (Morgan
Gibson), **no physician**. If Zac Duffy is out, Raleigh cannot perform a New Client Visit
at all, because the coach intro has no substitution. If Morgan Gibson is out, there is no
physical and no local priority-2 fallback.

**Southern Pines** — **one coach** (Shane James), one **part-time** nurse (Regina Grimm),
NP Jayne Miller and PA Chris Domingez, **no physician**. Better provider depth, same coach
fragility, and lab draws depend on a part-timer's days.

The system should surface this rather than let the front desk discover it: a **coverage
view** that shows, per location per day, whether a New Client Visit is bookable at all —
and *which* missing credential is the reason. That is a small feature with a direct
revenue line, because the failure mode today is a booked new client who cannot be seen.

### 5.2 Nobody is located at "Telehealth" — which settles the model question

Jerry Cattelane's title is *Telehealth Physician* and his **location is Myrtle Beach**.
Marc McCully, the coach the call named for telehealth patients, is **Myrtle Beach**. Not
one person on the roster sits at a telehealth location.

This is independent confirmation of the point Paul made on the call: **telehealth is a
patient panel served by staff at physical clinics, not a sixth clinic.** Apex currently
models it as a location (`lib/mock/locations.ts`), and `VISIT_TYPES` doubles down in
member-facing copy: *"Telehealth is one of our five locations, not a fallback."* That
sentence is now wrong and should come out with the model change
(`SYNC_2026-07-21_ACTIONS.md` §10).

Which also means: **Stephanie's spec does not cover the telehealth NCV.** A remote new
client cannot have an in-clinic lab draw or an in-person physical. Presumably that is a
LabCorp draw plus a video physical — but the credential matrix, the sequencing and who
owns the result do not exist for that path. It needs its own answer before Aug 7, since
telehealth patients are a whole panel.

### 5.3 Raleigh DC has no staff

Paul asked for Raleigh to be split into Raleigh and **Raleigh DC (Douglas Carroll)**. The
roster has **no rows at Raleigh DC**. Either the split is not staffed yet, the DC people are
missing from the sheet, or "Raleigh DC" is a room-and-schedule distinction inside one
Raleigh team. The repo currently carries `raleigh` (701 Mutual Ct) and `raleigh-boutique`
(6325 Falls of Neuse) — which of those is DC is currently a guess. Blocking question.

### 5.4 Supervision and licence data does not exist yet

The roster says "Nurse" — Stephanie's spec makes **LPN** conditional on state scope of
practice, and NC and SC differ. It also says "Nurse Practitioner" and "Physicians
Assistant" without licences, states or supervising physicians. NC and SC both impose
supervision or collaborative-practice requirements on PAs and NPs, and Apex has the column
for it (`staffCredential.supervisingStaffId`) sitting empty.

Note the shape the roster implies: **Jeff Grimm is Medical Director NC** (at AHQ) and
**Belal Khokhar is Medical Director** at Myrtle Beach (SC). That reads as the supervision
split, and as the priority-2 physician fallback for each state. Confirm it, then populate:
credential, state, licence number, expiry, DEA where held, supervising physician.

### 5.5 Roster → Apex is not a find-and-replace

Apex ships 24 synthetic staff (`lib/mock/staff.ts`, ids `st-001`…), and clients reference
them by `coachId` / `providerId` across the whole seed. `/api/audit` will fail loudly on
any dangling reference — which is the system working. Map real people **onto existing ids**
and let the audit route prove the graph still closes. Do not regenerate the ids.

Also add to the staff model: `department` (Leadership / Medical / Coaching / Operations /
Personal Trainer), and `excludeFromScheduling` for the five Alpha Gym trainers — the sheet
says IGNORE ALPHA GYM, and that instruction should live in data, not in someone's memory.

---

## 6. Where the two requirements documents disagree

Stephanie's NCV spec and what Matt described on the call are both authoritative and they do
not describe the same system. Get these resolved before building, because they change the
resolver:

1. **Continuity vs. availability.** Matt: *"the H&P has to match the same guy who did the
   plan of care."* Stephanie: assign whichever NP/PA is available, physician as fallback.
   A pure availability resolver breaks continuity by design. Which wins — and if
   continuity wins, is it a hard constraint or a preference the scheduler can override with
   a reason?
2. **Holly and "all local Myrtle Beach females."** Is that a hard routing rule, a patient
   preference, or an informal convention? Hard rule → data. Preference → a weight, and a
   documented reason it exists. It is absent from Stephanie's doc entirely.
3. **Telehealth NCV.** Not covered anywhere. See §5.2.
4. **State-of-practice rules.** Matt raised Ohio approving medications, and a second state.
   Stephanie's doc does not address which providers may see which patients by state. That
   is the constraint that is actually law, and it is the one still least specified.
5. **Lab Draw by Admin.** Apex currently permits it. Stephanie's matrix does not. Fixing
   the code is trivial; confirming nobody is doing it today is the actual question.

---

## 7. What to do this week

**Today / tomorrow**
- Start the three wait-tasks: MindBody vault migration request, 10DLC brand + campaign,
  email domain auth + quota increase. None of them require a decision from anyone.
- Send Paul the re-scope proposal in §3 and the open questions in §6.
- Stand up `ca-apex-dev` so Matt has somewhere to QA that is not production.

**Rest of the week**
- Patient auth decision, then build it — it gates the pilot and nothing else can start
  late (`SYNC_2026-07-21_ACTIONS.md` §1).
- Credential-based scheduling + the composite NCV visit type (§4). This is the largest
  single build item in the release and Stephanie's spec is finally specific enough to
  write it against.
- Feature flags (§2 of the companion doc) — required for the V1 skin, the pilot gate and
  the "turn off what Matt doesn't like" plan.
- Seed the real roster onto existing staff ids, with credentials and supervision.

**Deliverables owed to Paul from the call**
- The GoHighLevel replacement feature list. The roadmap now names the four he cares about:
  email marketing, portable calendars with end-to-end campaign tracking, mass text with
  DNC, and Alpha Plan contract documents. Answer it in that structure.
- The list of roles the system supports (now answerable as a credential matrix, §4).
