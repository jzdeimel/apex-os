import { getClient } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { consultsForClient } from "@/lib/mock/consults";
import { ordersForClient } from "@/lib/mock/orders";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { memberReason, memberReasons, memberSummary } from "@/lib/planOfCare/memberVoice";
import { clientFacingStatus } from "@/lib/orders/lifecycle";
import { staffName } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { PlanItem } from "@/lib/planOfCare/types";
import type { Biomarker } from "@/lib/types";

/**
 * "Ask your own record" — the member-facing assistant.
 *
 * ── The rule, which IS the feature ────────────────────────────────────────
 * This function answers questions about ONE member's own record and refuses
 * everything else. Not "tries to stay on topic" — refuses, structurally, with a
 * named reason and a route to a human.
 *
 * That constraint is not a limitation we are apologising for. It is the entire
 * value proposition. A member-facing health assistant that will take a swing at
 * a general medical question is a liability with a chat bubble: it will
 * eventually produce a confident sentence about a drug, a dose or a symptom that
 * no clinician wrote and no record supports, addressed to someone who has every
 * reason to act on it. We shipped one clinical fabrication in this product once
 * and removed it. The design response is not a better model, it is a smaller
 * question space.
 *
 * So there is no generation here at all. Every sentence returned is either
 * (a) fixed copy written by us, or (b) a value read directly off this member's
 * own record — a biomarker they were sent, a plan item their provider approved,
 * an order status, a date. Every one of those carries a Citation pointing at the
 * portal page where the member can see the same thing themselves.
 *
 * ── Three hard boundaries ────────────────────────────────────────────────
 *  1. NO DOSING, EVER. Any question about amount, frequency or titration routes
 *     to the provider untouched. Apex does not hold a dose (see
 *     lib/planOfCare/types.ts — the field structurally does not exist), and the
 *     one place a dose is authoritative is the prescriber's signature.
 *  2. NO ONE ELSE'S RECORD. `clientId` is the session's subject. There is no
 *     parameter that widens it and no question phrasing that can.
 *  3. NO GENERAL MEDICAL ADVICE. "Is creatine safe", "what causes low
 *     testosterone" — these have no answer inside this member's record, so the
 *     honest response is a handoff, not a paragraph.
 *
 * ── Member language ──────────────────────────────────────────────────────
 * Anything derived from the plan of care goes through lib/planOfCare/memberVoice
 * before it is rendered. Plan `because[]` and `detail` are rule-engine trace
 * output addressed to a clinician; that boundary exists precisely so it is never
 * crossed by a new surface like this one.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CitationKind = "lab" | "consult" | "plan" | "order" | "document";

export interface Citation {
  kind: CitationKind;
  /** What the member should recognise it as. */
  label: string;
  /** ISO timestamp of the underlying record. */
  at: string;
  /** Where in THEIR portal this lives. Never a staff route. */
  href?: string;
  /** Verbatim text from the record, when quoting is more honest than summarising. */
  quote?: string;
}

/** Why we would not answer. Each maps to a different handoff sentence. */
export type RefusalKind =
  /** Amount, frequency, titration — provider territory by law and by design. */
  | "dosing"
  /** The answer simply is not in this member's record. */
  | "not-in-record"
  /** A general health question with no answer in any one record. */
  | "general-advice"
  /** A question about a person who is not the member. */
  | "someone-else";

export interface Refusal {
  kind: RefusalKind;
  /** Shown to the member verbatim. Warm, specific, never an error. */
  reason: string;
  /** Who this should go to instead. */
  handoffTo: "coach" | "provider";
  /** Display name of that person, resolved from the member's own care team. */
  handoffName: string;
}

export interface RecordAnswer {
  /** Echoed back so the UI can render a transcript without re-plumbing state. */
  question: string;
  /** Empty string when refused — the UI renders the refusal instead. */
  answer: string;
  citations: Citation[];
  /** Present iff we declined to answer. */
  refused?: Refusal;
}

// ---------------------------------------------------------------------------
// Intent matching — deterministic, ordered, no model
// ---------------------------------------------------------------------------

/**
 * Ordered because the first match wins and the ordering encodes safety.
 *
 * The lab-schedule pattern deliberately sits ABOVE the dosing pattern: "how
 * often should I get labs" contains "how often" but is a scheduling question we
 * can answer from the monitoring plan, and burying it under the dosing guard
 * would refuse a question we have a real, cited answer for. Every other
 * ambiguity resolves the other way — toward the refusal.
 */
const SOMEONE_ELSE =
  /\b(my (wife|husband|partner|girlfriend|boyfriend|friend|brother|sister|mother|father|mom|dad|son|daughter|buddy)|someone else|another (patient|member|client|person)|other people)\b/i;

const LAB_SCHEDULE =
  /\b(next|upcoming|when|how often)\b.{0,40}?\b(lab|labs|panel|bloodwork|blood work|draw)\b|\b(lab|labs|panel|bloodwork)\b.{0,24}?\b(due|again|next|schedule|how often)\b/i;

/**
 * The dosing guard, deliberately over-broad.
 *
 * The gaps in the first draft of this pattern were instructive: a `.{0,20}`
 * window between "how much" and "take" let "how much testosterone should I take"
 * fall through to the lab handler, which cheerfully answered with a testosterone
 * value. Nothing false was said and it was still the wrong answer — a member
 * asking about amount got a number back.
 *
 * So the windows are wide and `should i take/start/stop` is matched outright.
 * The cost of a false positive is one extra handoff to the prescriber, which is
 * where a dosing question was going anyway. The cost of a false negative is the
 * failure mode this whole file exists to prevent. Those are not comparable, and
 * the pattern is tuned accordingly.
 */
const DOSING =
  /\b(dose|doses|dosing|dosage|titrat|\bmg\b|\bmcg\b|\bml\b|\biu\b|units?\b)|how (much|many).{0,40}?\b(take|taking|inject|injection|use|using|do i)\b|how often.{0,40}?\b(take|inject|dose|shot|do i)\b|\bshould i (take|taking|inject|use|start|stop|change|increase|decrease|double|split)\b|\b(increase|decrease|lower|raise|double|skip).{0,24}?\b(dose|amount|injection|shot)\b/i;

const NEXT_VISIT = /\b(next|upcoming).{0,20}\b(visit|appointment|appt|consult|follow.?up)\b|when.{0,20}\b(see|seeing)\b.{0,20}\b(you|doctor|provider|coach)\b/i;

const CARE_TEAM = /\b(who is|who's|whos)\b.{0,20}\b(my|the)\b.{0,20}\b(coach|doctor|provider|prescriber|care team|clinician)\b|\bmy care team\b/i;

const WHY_TAKING = /\bwhy\b.{0,30}\b(taking|on|prescribed|doing|have|got)\b|\bwhat('| i)?s? (this|it) for\b|\bwhy is (this|that) on my plan\b|\breason(s)? for\b/i;

const WHAT_TAKING = /\bwhat (am i|do i|are my)\b.{0,20}\b(taking|take|on|protocol|plan|medications?|peptides?)\b|\bmy (protocol|plan|regimen)\b/i;

const PROVIDER_SAID = /\b(what did|what'd)\b.{0,24}\b(provider|doctor|dr\.?|coach|they|she|he)\b.{0,16}\b(say|said|tell|told|note)\b|\blast (visit|consult|appointment)\b.{0,20}\b(notes?|summary|say)\b|\bmy (visit|consult) (notes?|summary)\b/i;

const ORDER_STATUS = /\b(order|refill|shipment|ship|shipped|tracking|package|delivery|arrive)\b/i;

const LAB_RESULT = /\b(lab|labs|panel|result|results|bloodwork|blood work|level|levels|number|numbers|marker)\b/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pinned clock. Everything member-facing reads from this, never a live Date. */
const NOW = "2026-06-12T09:00:00";

function careTeam(clientId: string) {
  const client = getClient(clientId);
  return {
    coachName: staffName(client?.coachId),
    providerName: staffName(client?.providerId),
  };
}

function refuse(clientId: string, question: string, kind: RefusalKind, reason: string): RecordAnswer {
  const { coachName, providerName } = careTeam(clientId);
  // Dosing goes to the prescriber. Everything else starts with the coach, who
  // is the member's actual first point of contact and who escalates upward
  // through a queue with an SLA (lib/escalations) rather than a hallway.
  const toProvider = kind === "dosing";
  return {
    question,
    answer: "",
    citations: [],
    refused: {
      kind,
      reason,
      handoffTo: toProvider ? "provider" : "coach",
      handoffName: toProvider ? providerName : coachName,
    },
  };
}

/** Member-language rendering of one of their own biomarkers. */
function markerSentence(b: Biomarker): string {
  // Routed through memberVoice so the raw status word ("high") is never handed
  // to a member unaccompanied — see that module's docblock for why.
  return memberReason(`${b.name} ${b.value}${b.unit ? ` ${b.unit}` : ""} — ${b.status}`);
}

function labCitation(clientId: string): Citation | null {
  const labs = getLabsForClient(clientId);
  if (!labs) return null;
  return {
    kind: "lab",
    label: `${labs.panelName} — ${formatDate(labs.collectedOn)}`,
    at: labs.resultedOn,
    href: "/portal/labs",
  };
}

/** Find a marker the member named, by loose name match against THEIR panel. */
function findMarker(clientId: string, question: string): Biomarker | undefined {
  const labs = getLabsForClient(clientId);
  if (!labs) return undefined;
  const q = question.toLowerCase();

  // Common member phrasings that do not appear verbatim in the panel names.
  const ALIASES: Record<string, string> = {
    testosterone: "total testosterone",
    "t level": "total testosterone",
    a1c: "hemoglobin a1c",
    sugar: "fasting glucose",
    "blood sugar": "fasting glucose",
    thyroid: "tsh",
    "vitamin d": "vitamin d",
    cholesterol: "ldl cholesterol",
    iron: "ferritin",
    inflammation: "hs-crp",
  };

  for (const [alias, target] of Object.entries(ALIASES)) {
    if (q.includes(alias)) {
      const hit = labs.biomarkers.find((b) => b.name.toLowerCase().includes(target));
      if (hit) return hit;
    }
  }

  return labs.biomarkers.find((b) => q.includes(b.name.toLowerCase()));
}

function planCitation(item: PlanItem, createdAt: string): Citation {
  return {
    kind: "plan",
    label: item.title,
    at: createdAt,
    href: "/portal/protocol",
  };
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

/**
 * Answer a member's question from their own record, or refuse.
 *
 * Pure and deterministic: same member, same question, same answer, forever.
 * There is no temperature here to turn down.
 */
export function answer(clientId: string, question: string): RecordAnswer {
  const client = getClient(clientId);
  const q = question.trim();

  if (!client) {
    return refuse(clientId, q, "not-in-record", "We couldn't open your record just now.");
  }
  if (!q) {
    return refuse(
      clientId,
      q,
      "not-in-record",
      "Ask a question about your labs, your plan, your orders or your next visit.",
    );
  }

  // -- Guard rails first. Order here is a safety decision, not a style one. --

  if (SOMEONE_ELSE.test(q)) {
    return refuse(
      clientId,
      q,
      "someone-else",
      "This only ever looks at your record — never anyone else's, even a family member's. That's true in both directions: nobody sees yours here either.",
    );
  }

  if (LAB_SCHEDULE.test(q)) {
    return nextLabsAnswer(clientId, q);
  }

  if (DOSING.test(q)) {
    const { providerName } = careTeam(clientId);
    return refuse(
      clientId,
      q,
      "dosing",
      `How much and how often is set and signed by ${providerName}, and it's the one thing this will never answer — not from your plan, not from your notes. Send it over and you'll get the real answer from the person who prescribes it.`,
    );
  }

  // -- Questions we can answer from the record. --

  if (CARE_TEAM.test(q)) return careTeamAnswer(clientId, q);
  if (NEXT_VISIT.test(q)) return nextVisitAnswer(clientId, q);
  if (PROVIDER_SAID.test(q)) return consultAnswer(clientId, q);
  if (ORDER_STATUS.test(q)) return orderAnswer(clientId, q);
  if (WHY_TAKING.test(q)) return whyAnswer(clientId, q);
  if (WHAT_TAKING.test(q)) return whatAnswer(clientId, q);

  // A named marker beats the generic lab handler — "what's my A1C" should
  // return the number, not a panel summary.
  const marker = findMarker(clientId, q);
  if (marker) return markerAnswer(clientId, q, marker);

  if (LAB_RESULT.test(q)) return labsAnswer(clientId, q);

  // -- Nothing matched. This is the default, and it is meant to be. --
  return refuse(
    clientId,
    q,
    "general-advice",
    "That isn't something we can answer from your record, and we won't guess at it — general health answers that aren't about your own numbers are exactly where this kind of tool gets things wrong.",
  );
}

// ---------------------------------------------------------------------------
// Answer builders — each one reads the record and cites it
// ---------------------------------------------------------------------------

function markerAnswer(clientId: string, q: string, b: Biomarker): RecordAnswer {
  const labs = getLabsForClient(clientId)!;
  const cite = labCitation(clientId)!;

  const trend =
    b.history && b.history.length > 1
      ? ` Last time it was ${b.history[b.history.length - 2].value}${b.unit ? ` ${b.unit}` : ""}.`
      : "";

  const optimal =
    b.optimalLow !== undefined && b.optimalHigh !== undefined
      ? ` The window your care team aims for is ${b.optimalLow}–${b.optimalHigh}${b.unit ? ` ${b.unit}` : ""}.`
      : "";

  return {
    question: q,
    answer:
      `${markerSentence(b)}${trend}${optimal} That's from your ${labs.panelName} drawn ${formatDate(labs.collectedOn)}. ` +
      `What it means for your plan is your care team's call, not this page's.`,
    citations: [{ ...cite, quote: `${b.name} ${b.value}${b.unit ? ` ${b.unit}` : ""}` }],
  };
}

function labsAnswer(clientId: string, q: string): RecordAnswer {
  const labs = getLabsForClient(clientId);
  if (!labs) {
    return refuse(
      clientId,
      q,
      "not-in-record",
      "There aren't any lab results on your record yet, so there's nothing here to read from.",
    );
  }

  const flagged = labs.biomarkers.filter((b) => b.status !== "optimal");
  const cite = labCitation(clientId)!;

  if (!flagged.length) {
    return {
      question: q,
      answer: `Your ${labs.panelName} from ${formatDate(labs.collectedOn)} came back with everything in the range your care team aims for.`,
      citations: [cite],
    };
  }

  // Name the markers and let memberVoice phrase each one. No interpretation,
  // no ranking of what "matters most" — that is a clinician's judgement.
  const lines = flagged.slice(0, 4).map(markerSentence);
  const more = flagged.length > 4 ? ` Plus ${flagged.length - 4} more on your Labs page.` : "";

  return {
    question: q,
    answer:
      `From your ${labs.panelName} drawn ${formatDate(labs.collectedOn)}: ${lines.join(" ")}${more} ` +
      `Your care team has reviewed all of it — the full panel is on your Labs page.`,
    citations: [cite],
  };
}

function nextLabsAnswer(clientId: string, q: string): RecordAnswer {
  const client = getClient(clientId)!;
  const plan = buildPlanOfCare(client);
  const labs = getLabsForClient(clientId);

  const recheck = plan.monitoring.find((m) => /lab|panel/i.test(m.label));
  if (!recheck) {
    return refuse(
      clientId,
      q,
      "not-in-record",
      "There isn't a lab recheck scheduled on your plan yet.",
    );
  }

  const citations: Citation[] = [
    { kind: "plan", label: `Monitoring — week ${recheck.week}`, at: plan.createdAt, href: "/portal/protocol" },
  ];
  const labCite = labCitation(clientId);
  if (labCite) citations.push(labCite);

  return {
    question: q,
    answer:
      `Your plan has "${recheck.label}" at week ${recheck.week} of a ${plan.durationWeeks}-week block, owned by your ${recheck.owner.toLowerCase()}. ${recheck.detail}` +
      (labs ? ` Your last panel was drawn ${formatDate(labs.collectedOn)}.` : "") +
      ` Your coach books the actual date — message them if you want it moved.`,
    citations,
  };
}

function nextVisitAnswer(clientId: string, q: string): RecordAnswer {
  const client = getClient(clientId)!;
  if (!client.nextAppointment) {
    return refuse(
      clientId,
      q,
      "not-in-record",
      "There's nothing on your calendar with us right now.",
    );
  }

  return {
    question: q,
    answer:
      `Your next visit is ${formatDateTime(client.nextAppointment)} at ${locationName(client.locationId)}, ` +
      `with ${staffName(client.coachId)} on your care team.`,
    citations: [
      {
        kind: "plan",
        label: `Appointment — ${formatDateTime(client.nextAppointment)}`,
        at: client.nextAppointment,
        href: "/portal",
      },
    ],
  };
}

function careTeamAnswer(clientId: string, q: string): RecordAnswer {
  const client = getClient(clientId)!;
  return {
    question: q,
    answer:
      `${staffName(client.coachId)} is your coach and your first stop for anything day to day. ` +
      `${staffName(client.providerId)} is your provider and signs off on anything clinical, including what you take and how much. ` +
      `You're seen out of ${locationName(client.locationId)}.`,
    citations: [
      { kind: "plan", label: "Your care team", at: client.joinedOn, href: "/portal" },
    ],
  };
}

function consultAnswer(clientId: string, q: string): RecordAnswer {
  // Only consults the clinic has explicitly released to the member. An unsigned
  // note is a draft, and showing a member a draft their clinician has not stood
  // behind is how a half-formed thought becomes a decision they act on.
  const visible = consultsForClient(clientId).filter((c) => c.visibleToClient && c.finalSummary);
  const latest = visible[0];

  if (!latest || !latest.finalSummary) {
    return refuse(
      clientId,
      q,
      "not-in-record",
      "Your most recent visit notes haven't been released to your portal yet — they're still with your care team.",
    );
  }

  const s = latest.finalSummary;
  const firstAction = s.actionItems[0];

  const citations: Citation[] = [
    {
      kind: "consult",
      label: `${latest.kind} with ${staffName(latest.authorId)} — ${formatDate(latest.startedAt)}`,
      at: latest.startedAt,
      href: "/portal/messages",
      quote: firstAction?.sourceQuote,
    },
  ];

  const actions = s.actionItems.slice(0, 3).map((a) => a.value);

  return {
    question: q,
    answer:
      `From your ${latest.kind.toLowerCase()} with ${staffName(latest.authorId)} on ${formatDate(latest.startedAt)}: ${s.headline}` +
      (actions.length ? ` What you agreed to: ${actions.join("; ")}.` : "") +
      ` That's the signed summary, in their words — nothing here is a rewrite of it.`,
    citations,
  };
}

function orderAnswer(clientId: string, q: string): RecordAnswer {
  const orders = ordersForClient(clientId).filter((o) => o.visibleToClient);
  const latest = orders[0];

  if (!latest) {
    return refuse(
      clientId,
      q,
      "not-in-record",
      "There aren't any orders on your record right now.",
    );
  }

  const tracking = latest.tracking
    ? ` Tracking ${latest.tracking}${latest.carrier ? ` via ${latest.carrier}` : ""}.`
    : "";
  const eta = latest.estDelivery ? ` Estimated arrival ${formatDate(latest.estDelivery)}.` : "";

  return {
    question: q,
    answer:
      // clientFacingStatus is the member-safe wording of an internal status —
      // "QC hold" is an operations term, not something to put in front of a
      // member waiting on a package.
      `Your most recent order is ${clientFacingStatus(latest.status).toLowerCase()}.${tracking}${eta} ` +
      `It updates on its own, so you won't need to ask us where it is.`,
    citations: [
      {
        kind: "order",
        label: `Order ${latest.id}`,
        at: latest.lastActivity ?? latest.placedAt,
        href: "/portal",
      },
    ],
  };
}

function whyAnswer(clientId: string, q: string): RecordAnswer {
  const client = getClient(clientId)!;
  const plan = buildPlanOfCare(client);
  const items = [...plan.protocol, ...plan.nutrition, ...plan.training];

  if (!items.length) {
    return refuse(
      clientId,
      q,
      "not-in-record",
      "There isn't a plan on your record yet for us to explain.",
    );
  }

  // If they named something on their plan, answer about that. Otherwise explain
  // the plan's leading item — never a substance we cannot find on their record.
  const lower = q.toLowerCase();
  const named = items.find((i) => lower.includes(i.title.toLowerCase()));
  const target = named ?? items[0];

  const reasons = memberReasons(target);

  return {
    question: q,
    answer:
      `${target.title}: ${memberSummary(target)} ` +
      (reasons.length ? `Here's why it's on your plan — ${reasons.join(" ")} ` : "") +
      (target.requiresProviderApproval
        ? `${staffName(client.providerId)} confirms whether it's right for you and sets the amount.`
        : `Your coach owns this one with you.`),
    citations: [planCitation(target, plan.createdAt), ...(labCitation(clientId) ? [labCitation(clientId)!] : [])],
  };
}

function whatAnswer(clientId: string, q: string): RecordAnswer {
  const client = getClient(clientId)!;
  const plan = buildPlanOfCare(client);

  if (!plan.protocol.length) {
    return refuse(
      clientId,
      q,
      "not-in-record",
      "There's nothing clinical on your plan right now — your plan is nutrition and training at the moment.",
    );
  }

  // Titles and purpose only. No amounts: the plan engine does not hold a dose,
  // and this surface must not be the place one appears.
  const lines = plan.protocol.map((p) => `${p.title} — ${memberSummary(p)}`);

  return {
    question: q,
    answer:
      `Your plan has ${plan.protocol.length} clinical item${plan.protocol.length === 1 ? "" : "s"} on it. ` +
      `${lines.join(" ")} ` +
      `Amounts and timing come from ${staffName(client.providerId)}, on your prescription — not from here.`,
    citations: plan.protocol.map((p) => planCitation(p, plan.createdAt)),
  };
}

// ---------------------------------------------------------------------------
// UI support
// ---------------------------------------------------------------------------

/**
 * The suggested prompts.
 *
 * Chosen to teach the boundary as much as to save typing: every one of them has
 * a real, cited answer, so a member's first interaction succeeds and their
 * mental model becomes "this knows my record" rather than "this is a chatbot".
 */
export const SUGGESTED_QUESTIONS: string[] = [
  "When are my next labs?",
  "Why am I taking this?",
  "What did my provider say?",
  "What's my A1C?",
  "When is my next visit?",
  "Where is my order?",
  "Who is on my care team?",
];

/** Shown quietly and permanently under the ask box. Not a disclaimer — a fact. */
export const SCOPE_NOTICE =
  "This can only see your record — your labs, your plan, your orders and your visits. It can't see anyone else's, and it won't answer general health questions or anything about how much to take.";
