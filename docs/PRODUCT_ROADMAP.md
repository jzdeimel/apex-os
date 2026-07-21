# Apex — product roadmap

Five products sharing one brain: **client app · medical cockpit · coach cockpit ·
front-desk cockpit · exec cockpit.** Each needs its own hook.

> **Sequencing rule.** Nothing in this document ships before the stop-ship list in
> `docs/STOP_SHIP.md` is closed. Two of these features depend on it directly and
> would otherwise be built on sand:
> - The **Today screen** and **milestone mechanics** read streaks, rings and
>   adherence. Those are currently two independent `seededRandom` streams that
>   disagree with each other and never move when a member logs anything. Animating
>   them first would make a prettier lie, not a better product.
> - **Celebration** fires on completion events. Several of those events do not yet
>   happen (a "sent" that sends nothing, a "booked" that books nothing). Celebrating
>   an action the system did not take is the worst version of this idea.

---

## The momentum loop (the thesis)

Client completes action → app celebrates → app shows measurable progress → app
reveals the next milestone → coach/provider responds quickly → client feels seen →
client returns tomorrow.

Ethical constraint: momentum, not a slot machine. Every celebration must
correspond to something that really happened, and every number shown must be the
member's own record. Variable-ratio reward mechanics are out.

---

## Global

- Universal **CommandBar** — search clients, jump to chart, create task, message,
  book, refill, escalate.
- **Handoff animation** as work moves client → coach → provider → front desk →
  pharmacy.
- Consistent **completion language + motion**: signed, booked, reviewed, sent,
  resolved, ready.
- **Useful empty states** — next best action, never "nothing here".
- **Since You Last Looked** strip on every role home. *(Component exists; it was
  passed a non-actor id so it never fired — fixed, now wire it to every role.)*
- Role-specific soundless motion: pulses, count-ups, stamps, ring closures.
- **Event timeline drawer** app-wide — every action becomes visible history.
  *(The durable ledger already backs this; it needs a surface.)*
- Skeletons + optimistic transitions.
- **Notification centre** with unread grouped by urgency.
- Saved views, keyboard shortcuts, quick filters.

## Client

Today screen (one action, rings, streak, next milestone, next appointment/order/
lab) · progress journey with animated reveal, milestone unlocks, body-scan
comparison · weekly recap (moved / stalled / next) · protocol companion (AM-PM
checklist, dose reminders, side-effect check-ins) · daily AI coach pulse ·
**Ask my record** · upload moments that animate into a review queue · streaks,
milestone badges, scan anniversaries · accountability sharing without PHI ·
Domino's-style refill/order tracker · appointment prep ("3 things to tell your
provider") · recovery flows (missed check-in/dose, stalled progress, side effect)
· intake completion moment.

## Medical / providers

Signing cockpit (stacked consults, AI summary, red flags, meds/labs, one-click
sign) · clinical risk radar · timeline mode · diff since last visit · protocol
rationale panel · smart note composer with citations to chart facts · order
safety checks (allergies, interactions, dose limits, lab requirements) · lab
review queue grouped by severity · **"needs my license"** queue · escalation
handoff with instant context · signature ceremony + immutable audit proof.

## Coaches

Coach home ("who needs attention today?") · client momentum score · quick-reply
studio with tone options and compliance guardrails · winback queue · celebration
triggers · habit board · conversation context · group/community prompts · call
prep card · leaderboard on retention/outcomes **not** message volume ·
"done for today" moment.

## Front desk

Lead capture cockpit · animated calendar with conflict handling · **intake rescue
queue** (started but not finished) · insurance/payment/admin checklist · walk-in
mode *(built)* · room board *(built)* · no-show recovery · "ready for visit"
checklist · phone script assistant · magic-link sender with delivery status ·
checkout flow (book next, collect payment, trigger refill/labs).

## Exec

Executive cockpit (revenue, retention, conversion, clinical safety, queue health)
· funnel animation lead → intake → booked → first visit → active → retained ·
cohort analytics by protocol/coach/location/source · quality score · capacity
planner · margin view · **marketing attribution on retained clients, not leads**
*(acquisition console built; needs retention join)* · churn prediction + save
playbooks · "what changed this week" · board-ready export · scenario simulator.

## AI / agent swarm

Client agent (daily guidance, check-in interpretation, appointment prep) · coach
agent (triage, draft replies, drift detection) · provider agent (summarise chart,
flag risks, draft note) · front-desk agent (rescue incomplete intake, fill
schedule gaps) · exec agent (explain metrics, surface anomalies) · compliance
agent (claims, consent, PHI, risky messaging) · revenue agent (stalled orders,
unpaid invoices, missed refills) · quality agent (overdue labs, unsigned notes,
unresolved incidents).

---

## Build order

1. **CelebrationProvider** — one event system over the existing `Confetti`,
   `RingCloseBurst`, `SignedSeal`: `celebrate("intake.completed")`,
   `"visit.booked"`, `"ring.closed"`, `"lab.uploaded"`, `"message.sent"`,
   `"milestone.hit"`, `"order.confirmed"`.
2. Animated success/completion components.
3. **Client Today screen.**
4. Progress page animation upgrade.
5. Guided intake completion flow.
6. Notification / re-engagement layer.
7. Light, warmer client portal theme — a deliberate fork from the dense dark
   staff theme, not drift.

### Top 10 polish builds
Client Today · CelebrationProvider · animated milestone/progress · provider
signing cockpit · coach triage home · front-desk lead/intake rescue · exec
operating cockpit · notification centre · AI "since you last looked" · order/
refill/visit tracking timeline.

---

## Re-engagement (retention)

Morning check-in reminder · missed check-in recovery · upcoming lab reminder ·
refill/order status · appointment prep · weekly recap · milestone celebration ·
"your provider reviewed X". Useful, not spammy — and every one of these is a
message to a patient, so each must pass the existing consent gate in
`lib/comms/send.ts` before it is sent, not after.
