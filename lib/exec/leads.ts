import type { ClientStatus } from "@/lib/types";
import { clients } from "@/lib/mock/clients";
import { consults } from "@/lib/mock/consults";
import type { NotComputable } from "@/lib/exec/provenance";
import {
  TRAILING_DAYS,
  TRAILING_FROM,
  YESTERDAY,
  activityBetween,
} from "@/lib/exec/morning";

/**
 * LEAD PIPELINE — and the honest answer is that there very nearly isn't one.
 *
 * The audit's finding, verified: the entire lead model is ONE ENUM VALUE on a
 * patient record (`ClientStatus = "Lead"`). There is no lead entity. There is no
 * source, no UTM, no campaign, no referrer, no stage history, no owner, no SLA
 * and no created date distinct from `joinedOn`. `app/book/page.tsx:104-113`
 * collects name, email, phone, location, care track and reason from a real form
 * — and discards all of it. `addLead` in `lib/store.tsx:30,152` is the only
 * lead-creation path in the product and it has zero call sites.
 *
 * The consequence is blunt and it is the single most important sentence on the
 * pipeline page: **Apex cannot answer "how many leads did we get last month".**
 * Not approximately, not with a caveat. A Lead has no creation timestamp, so
 * there is no field to filter a month against.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS MODULE REFUSES TO DRAW A FUNNEL
 * ---------------------------------------------------------------------------
 * A funnel is the obvious component to build here, and `lib/analytics.ts:123-143`
 * already builds one by counting clients at-or-past each status. It renders
 * convincingly and it is not a funnel — it is a bar chart of where 500 people
 * are standing right now.
 *
 * The difference matters in a specific, load-bearing way. A funnel is a cohort:
 * of the people who entered in March, what share reached each stage. This is a
 * snapshot: of the people here today, where is each one. Those two answer
 * different questions and only the first has a conversion rate in it. Worse, in
 * a snapshot a member who converted in March and cancelled in May counts as
 * converted forever, because status only records where they are now — so the
 * chart cannot go down, and a metric that cannot go down is not a metric.
 *
 * So this module exposes the snapshot AS a snapshot, with stage counts and no
 * rates, and puts the arithmetic an owner actually wants — dated top-of-funnel
 * activity — on a separate footing where it can be computed for real.
 */

// ---------------------------------------------------------------------------
// What CAN be shown
// ---------------------------------------------------------------------------

/**
 * Where the book is standing today. A census, not a funnel.
 *
 * Deliberately carries NO conversion rate between stages. Dividing one stage by
 * another here would produce a number that looks exactly like a conversion rate,
 * cannot be interpreted as one, and would be quoted as one within a week.
 */
export interface StageCount {
  stage: string;
  statuses: ClientStatus[];
  count: number;
}

const STAGES: { stage: string; statuses: ClientStatus[] }[] = [
  { stage: "Lead", statuses: ["Lead"] },
  { stage: "Consult booked", statuses: ["Consult Booked"] },
  { stage: "Labs ordered", statuses: ["Labs Ordered"] },
  { stage: "Results / review", statuses: ["Results Ready", "Plan Review"] },
  { stage: "On protocol", statuses: ["Active Protocol", "Follow-Up Due"] },
  { stage: "Inactive", statuses: ["Inactive"] },
];

export function stageCensus(): StageCount[] {
  return STAGES.map((s) => ({
    ...s,
    count: clients.filter((c) => s.statuses.includes(c.status)).length,
  }));
}

/**
 * Dated top-of-funnel activity — the one part of acquisition Apex can measure.
 *
 * Initial-consult bookings and intake consults both carry real timestamps, so
 * unlike status they can be filtered to a window. This is not a lead count and
 * the naming is careful about that: it counts CONSULTS, which is one step below
 * the top of the funnel. What happened before the consult — the enquiry, the
 * source, the time to first contact — is not recorded anywhere.
 */
export interface TopOfFunnel {
  windowDays: number;
  from: string;
  to: string;
  consultsBooked: number;
  consultsHeld: number;
  consultsLost: number;
  /** Intake consults written in the window — a member's first documented visit. */
  intakesDocumented: number;
}

export function topOfFunnel(): TopOfFunnel {
  const a = activityBetween(TRAILING_FROM, YESTERDAY, "all");
  const intakes = consults.filter((c) => {
    const d = c.startedAt.slice(0, 10);
    return c.kind === "Intake" && d >= TRAILING_FROM && d <= YESTERDAY;
  });

  return {
    windowDays: TRAILING_DAYS,
    from: TRAILING_FROM,
    to: YESTERDAY,
    consultsBooked: a.consultsBooked,
    consultsHeld: a.consultsHeld,
    consultsLost: a.consultsLost,
    intakesDocumented: intakes.length,
  };
}

/**
 * Show rate — the one genuine ratio on this page.
 *
 * Held ÷ booked, over dated booking records. It is a real rate with a real
 * denominator, and it is emphatically NOT a conversion rate: it says nothing
 * about whether the person who showed up bought anything. Returned as null
 * below a floor of 20, matching `MIN_SLOT_N` in `lib/analytics/attendance.ts`,
 * because a rate on a thin denominator is how a slot gets cancelled for no
 * reason.
 */
export function consultShowRate(): { rate: number; n: number } | null {
  const t = topOfFunnel();
  if (t.consultsBooked < 20) return null;
  return { rate: t.consultsHeld / t.consultsBooked, n: t.consultsBooked };
}

// ---------------------------------------------------------------------------
// What CANNOT be shown
// ---------------------------------------------------------------------------

/**
 * The gaps, each named against the table that would close it.
 *
 * `lib/db/schema.ts` now defines `lead` (with source, utm_source, utm_medium,
 * utm_campaign, owner_staff_id, created_at, converted_at) and `leadStageEvent`
 * (dated from/to transitions). Both are defined; neither is populated, and the
 * database is not wired to the UI. Naming them keeps this list a roadmap
 * against real columns rather than a wish.
 */
export function pipelineGaps(): NotComputable[] {
  return [
    {
      id: "leads-per-month",
      question: "How many leads did we get last month?",
      why:
        "A Lead is a status on a client record, not an entity. It has no creation timestamp distinct from joinedOn, so there is no field to filter a month against. The count of people currently sitting in Lead status is a census — it tells you nothing about how many arrived, and it falls when someone converts.",
      needs:
        "lib/db/schema.ts:lead — created_at on a real lead row, written at capture time. Defined, not populated.",
      replaces: "app/book/page.tsx:104-113 validates a real capture form and then discards it.",
    },
    {
      id: "source",
      question: "Which channel is actually producing members?",
      why:
        "No source, UTM, campaign or referrer is recorded anywhere on a client or anywhere else in the codebase. Spend cannot be attributed to a single member. Referral attribution is architecturally excluded on purpose — lib/mock/referrals.ts:16-22 states it.",
      needs:
        "lib/db/schema.ts:lead — source, utm_source, utm_medium, utm_campaign, referrer_client_id, captured on the booking form that already collects everything else.",
    },
    {
      id: "speed-to-lead",
      question: "How fast do we call a new enquiry back?",
      why:
        "Speed-to-lead needs a dated capture and a dated first contact. Neither exists: there is no lead timestamp, no lead owner, and no SLA concept anywhere in the product.",
      needs:
        "lib/db/schema.ts:leadStageEvent — dated from/to transitions with by_staff_id, plus owner_staff_id on the lead.",
    },
    {
      id: "close-rate",
      question: "What is our close rate, by location and by consultant?",
      why:
        "Close rate is a cohort measure: of the leads that entered in a window, what share converted. Status is a snapshot, so a member who converted and later cancelled counts as converted permanently and the ratio can only ever rise.",
      needs:
        "lib/db/schema.ts:lead.converted_at plus leadStageEvent, giving a dated cohort denominator and a dated conversion numerator.",
      replaces:
        "lib/analytics.ts:123-143 counts clients at-or-past each status and presents it as a funnel with rates.",
    },
  ];
}
