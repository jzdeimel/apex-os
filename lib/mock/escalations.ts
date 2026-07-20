import { absolute } from "@/lib/utils";
import type {
  Escalation,
  EscalationEvent,
  EscalationKind,
  EscalationPriority,
  EscalationStatus,
} from "@/lib/escalations/types";
import { getClient } from "@/lib/mock/clients";
import { staff } from "@/lib/mock/staff";
import { consultsForClient } from "@/lib/mock/consults";

/**
 * The escalation queue as it actually looks on a Friday morning.
 *
 * Composed by hand rather than generated, because the point of this surface is
 * that a provider can read a queue and know instantly what to do first — and
 * that only lands if the questions read like a coach wrote them at 7am between
 * sessions. Generated filler ("Client reports symptom 3") proves nothing.
 *
 * The mix is deliberately unflattering: five items are already past SLA, one of
 * them Urgent, and one Prompt item has been sitting for a day and a half. A demo
 * queue where everything is green demonstrates a list, not a control.
 *
 * All timestamps are relative to the pinned clock, 2026-06-12T09:00:00.
 */

interface Seed {
  id: string;
  clientId: string;
  kind: EscalationKind;
  priority: EscalationPriority;
  status: EscalationStatus;
  question: string;
  sourceQuote: string;
  raisedAt: string;
  /** Hours after raisedAt that a provider first picked it up. */
  ackAfterH?: number;
  /** Hours after raisedAt that it was answered. */
  answerAfterH?: number;
  answer?: string;
}

const SEEDS: Seed[] = [
  // ── Past SLA ─────────────────────────────────────────────────────────────
  {
    id: "esc-001",
    clientId: "c-005",
    kind: "Urgent symptom",
    priority: "Urgent",
    status: "Acknowledged",
    question:
      "Derek called before his 6am session — said he got chest tightness walking up from the parking deck and it took a few minutes to settle. He's talking normally and says he feels fine now, so I told him to sit this session out and not drive himself anywhere. He's on the GLP protocol. I don't want to be the one deciding this is nothing.",
    sourceQuote:
      "it was like a band across my chest coming up the stairs, went away after a few minutes but that's never happened before",
    raisedAt: "2026-06-12T05:15:00",
    ackAfterH: 1.5,
  },
  {
    id: "esc-002",
    clientId: "c-023",
    kind: "Out of scope",
    priority: "Prompt",
    status: "Open",
    question:
      "Tony's asking me straight out whether he should start TRT and what dose. I've told him twice that's not mine to answer and that a provider has to see his labs first, but he's getting frustrated and I think he's about to order something online. Someone needs to actually talk to him.",
    sourceQuote:
      "just tell me what number I'd be on, my buddy's on 200 a week and he says it changed his life — if you guys can't do it I'll find somewhere that will",
    raisedAt: "2026-06-09T15:30:00",
  },
  {
    id: "esc-003",
    clientId: "c-013",
    kind: "Out of scope",
    priority: "Routine",
    status: "Open",
    question:
      "Nathan's rheumatologist put him on a new anti-inflammatory last week and he wants to know if it conflicts with anything on his recovery protocol. Completely outside what I can answer. Flagging it rather than guessing.",
    sourceQuote:
      "my rheum started me on something new Tuesday, is that going to fight with the peptides I'm doing",
    raisedAt: "2026-06-08T14:00:00",
  },
  {
    id: "esc-004",
    clientId: "c-021",
    kind: "Side effect",
    priority: "Prompt",
    status: "In review",
    question:
      "Isaiah's had nausea most mornings since the last titration and skipped two doses on his own because of it. He's still eating fine and weight is tracking, but he's self-adjusting and I'd rather that decision came from a provider than from him.",
    sourceQuote:
      "I just didn't take it Thursday or Friday because the mornings were rough, figured I'd give my stomach a break",
    raisedAt: "2026-06-11T07:00:00",
    ackAfterH: 3,
  },
  {
    id: "esc-005",
    clientId: "c-001",
    kind: "Dose change request",
    priority: "Prompt",
    status: "In review",
    question:
      "Jake's plateaued for three weeks and is asking whether the dose should move up. Everything on my side is dialed — training's consistent, he's hitting protein, sleep improved. I'm not touching the number, but he deserves an actual answer rather than 'ask the doctor next visit'.",
    sourceQuote:
      "scale hasn't moved in three weeks and I'm doing everything you told me — is the dose too low or is this just how it goes",
    raisedAt: "2026-06-11T08:30:00",
    ackAfterH: 20,
  },

  // ── Running close ────────────────────────────────────────────────────────
  {
    id: "esc-006",
    clientId: "c-011",
    kind: "Lab concern",
    priority: "Urgent",
    status: "Open",
    question:
      "Victor's repeat panel came back this morning and hematocrit is up again from the last draw. He's due for his injection tomorrow and he's asking me if he should still take it. I'm not answering that.",
    sourceQuote:
      "so do I still do my shot Saturday or not, nobody's told me anything since the last blood draw",
    raisedAt: "2026-06-12T07:40:00",
  },
  {
    id: "esc-007",
    clientId: "c-008",
    kind: "Clinical question",
    priority: "Routine",
    status: "Acknowledged",
    question:
      "Tara wants to know whether her fasting glucose number means she's diabetic. She's read a lot online and is pretty anxious about it. I can talk about food and habits, I can't tell her what her labs mean diagnostically.",
    sourceQuote:
      "my sister was told the same number and she's on metformin now — am I diabetic or not, I'd rather just know",
    raisedAt: "2026-06-09T10:00:00",
    ackAfterH: 6,
  },

  // ── Comfortably on track ─────────────────────────────────────────────────
  {
    id: "esc-008",
    clientId: "c-006",
    kind: "Clinical question",
    priority: "Prompt",
    status: "Open",
    question:
      "Priya's thyroid results have been sitting in 'awaiting provider' for a week and she's now asked me twice what they say. I can see them, I just can't interpret them for her. She has a review booked Tuesday but a week of silence is a long time when you've been told something's off.",
    sourceQuote:
      "you said the thyroid panel was back last Thursday — is somebody going to call me or do I just wait",
    raisedAt: "2026-06-11T16:20:00",
  },
  {
    id: "esc-009",
    clientId: "c-014",
    kind: "Side effect",
    priority: "Prompt",
    status: "Open",
    question:
      "Olivia's getting headaches in the afternoons that started roughly when she moved up a step. Not severe, no vision changes, she's drinking and eating normally. Could easily be unrelated but I'd rather it be logged than mentioned in passing.",
    sourceQuote:
      "every day around three I get this dull headache behind my eyes, it wasn't happening a month ago",
    raisedAt: "2026-06-11T19:45:00",
  },
  {
    id: "esc-010",
    clientId: "c-012",
    kind: "Dose change request",
    priority: "Routine",
    status: "Acknowledged",
    question:
      "Hannah's sleep and recovery scores are the best they've been and she's asking whether she can step down or come off. Genuinely good problem to have, but it's a prescribing decision.",
    sourceQuote:
      "I feel like myself again — do I need to keep doing this forever or can we start backing it off",
    raisedAt: "2026-06-11T12:00:00",
    ackAfterH: 4,
  },
  {
    id: "esc-011",
    clientId: "c-022",
    kind: "Clinical question",
    priority: "Routine",
    status: "Open",
    question:
      "Naomi wants to know whether the B12 she's been buying herself is doing anything given what her panel showed, and whether she should keep spending on it. Fair question, not mine to answer.",
    sourceQuote:
      "I've been taking the sublingual B12 off Amazon for two months, is that even doing anything or am I wasting money",
    raisedAt: "2026-06-12T08:20:00",
  },
  {
    id: "esc-012",
    clientId: "c-003",
    kind: "Clinical question",
    priority: "Routine",
    status: "Open",
    question:
      "Marcus is asking whether he can keep lifting heavy through the knee flare or whether he should back off entirely. I can program around it either way — I need to know which one is clinically correct before I do.",
    sourceQuote:
      "I can squat fine, it's the day after that's bad — am I making it worse or is that just how it feels",
    raisedAt: "2026-06-11T13:00:00",
  },

  // ── Answered ─────────────────────────────────────────────────────────────
  {
    id: "esc-013",
    clientId: "c-016",
    kind: "Clinical question",
    priority: "Prompt",
    status: "Answered",
    question:
      "Grace is starting a two-week trip and wants to know whether she should pause anything or take it all with her, and what she does about the refrigerated item on a flight.",
    sourceQuote:
      "I fly out the 20th for two weeks — do I take everything with me or just skip it while I'm gone",
    raisedAt: "2026-06-11T10:15:00",
    ackAfterH: 1,
    answerAfterH: 5.4,
    answer:
      "She should take everything and not pause. Refrigerated item travels in a cooler bag in carry-on, never checked — it tolerates 72h out of fridge if it stays under 25C. Print the pharmacy label for security. If she'll be somewhere without reliable refrigeration for more than three days, tell me and we'll shift her injection days around the trip instead.",
  },
  {
    id: "esc-014",
    clientId: "c-019",
    kind: "Lab concern",
    priority: "Prompt",
    status: "Answered",
    question:
      "Sam's PSA came back a little higher than his last one. He's 60 and reads every number carefully, so he's going to ask me about it before I get a chance to say I don't know.",
    sourceQuote:
      "the prostate number went up from last time — that's the one you're supposed to worry about right",
    raisedAt: "2026-06-10T13:00:00",
    ackAfterH: 0.75,
    answerAfterH: 4.3,
    answer:
      "Still within range for his age and the move is smaller than normal assay variation. Not a concern at this value, but I want a repeat draw at his next panel rather than at the six-month mark so we have a trend rather than two dots. Tell him plainly: not abnormal, we're watching the direction, and he did the right thing asking.",
  },
  {
    id: "esc-015",
    clientId: "c-002",
    kind: "Clinical question",
    priority: "Routine",
    status: "Answered",
    question:
      "Andre's results have been ready since Friday and he's asked me what 'below optimal' means. I've said a provider will walk him through it but he's clearly reading it as a diagnosis.",
    sourceQuote:
      "below optimal — that sounds like something's wrong with me, is it low or isn't it",
    raisedAt: "2026-06-10T11:10:00",
    ackAfterH: 2,
    answerAfterH: 22.3,
    answer:
      "'Below optimal' is our language, not a lab flag — his total and free T are inside the reference range but at the bottom of it, which is consistent with what he's describing. That is a conversation, not a diagnosis. I've moved his review up to Saturday so he hears it from me rather than sitting with the phrase all week.",
  },
  {
    id: "esc-016",
    clientId: "c-024",
    kind: "Side effect",
    priority: "Routine",
    status: "Answered",
    question:
      "Renee's had some redness at the injection site the last two times. It fades within a day and there's no swelling or fever, but two in a row felt worth flagging.",
    sourceQuote:
      "it goes red and a bit itchy for about a day after, then it's completely fine — is that normal",
    raisedAt: "2026-06-07T09:00:00",
    ackAfterH: 3,
    answerAfterH: 26,
    answer:
      "Local site reaction, expected and benign at this description. Have her rotate sites properly and let the alcohol dry fully before injecting — most of these are the alcohol, not the compound. Escalate again immediately if she gets spreading redness, warmth that lasts past 48h, or any fever.",
  },
];

const HOUR_MS = 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Add hours and re-render in the same naive local form the input used.
 *
 * Deliberately NOT `toISOString()`: that converts to UTC, so on any machine not
 * at UTC the returned string is a different wall-clock time than the one the
 * arithmetic produced — which would silently offset every acknowledged and
 * answered timestamp by the local zone.
 */
function shift(iso: string, hours: number): string {
  const d = absolute(absolute(iso).getTime() + hours * HOUR_MS);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * Route to a licensed provider who actually covers this member's location.
 *
 * Falls back to the member's own provider of record first — routing an
 * escalation to a provider who has never seen the chart is technically "routed"
 * and practically useless.
 */
function assignee(clientId: string): string {
  const client = getClient(clientId);
  const own = staff.find((s) => s.id === client?.providerId && s.role === "Medical");
  if (own) return own.id;
  const covering = staff.find(
    (s) => s.role === "Medical" && client && s.locationIds.includes(client.locationId),
  );
  return covering?.id ?? "st-001";
}

function build(seed: Seed): Escalation {
  const client = getClient(seed.clientId);
  const assignedToStaffId = assignee(seed.clientId);
  const raisedBy = client?.coachId ?? "st-005";

  const acknowledgedAt =
    seed.ackAfterH !== undefined ? shift(seed.raisedAt, seed.ackAfterH) : undefined;
  const answeredAt =
    seed.answerAfterH !== undefined ? shift(seed.raisedAt, seed.answerAfterH) : undefined;

  // The timeline is derived from the same timestamps the card renders, so the
  // history can never disagree with the fields beside it.
  const statusHistory: EscalationEvent[] = [
    { status: "Open", at: seed.raisedAt, actor: raisedBy },
  ];
  if (acknowledgedAt) {
    statusHistory.push({ status: "Acknowledged", at: acknowledgedAt, actor: assignedToStaffId });
  }
  if (seed.status === "In review" && acknowledgedAt) {
    statusHistory.push({
      status: "In review",
      at: shift(acknowledgedAt, 0.5),
      actor: assignedToStaffId,
    });
  }
  if (answeredAt) {
    statusHistory.push({ status: "Answered", at: answeredAt, actor: assignedToStaffId });
  }

  return {
    id: seed.id,
    clientId: seed.clientId,
    raisedByStaffId: raisedBy,
    assignedToStaffId,
    kind: seed.kind,
    priority: seed.priority,
    status: seed.status,
    question: seed.question,
    sourceQuote: seed.sourceQuote,
    // Anchored to a consult that genuinely exists for this member, so the
    // traceability link is a real reference rather than a plausible-looking id.
    sourceConsultId: consultsForClient(seed.clientId)[0]?.id,
    raisedAt: seed.raisedAt,
    acknowledgedAt,
    answeredAt,
    answer: seed.answer,
    answeredByStaffId: answeredAt ? assignedToStaffId : undefined,
    statusHistory,
  };
}

export const escalations: Escalation[] = SEEDS.map(build);

/**
 * Commit a newly raised escalation into the shared store.
 *
 * Without this, a member-initiated escalation existed only in the component
 * that raised it — while the UI told them it was "on your provider's desk with
 * a clock on it". It was on nobody's desk. `queueFor()` could not see it, no
 * answer could ever arrive, and the single load-bearing promise of the
 * community guard was a toast message.
 *
 * Mirrors commitOrder / commitSubscription. Replaces in place by id so a
 * retried send is idempotent.
 */
export function commitEscalation(e: Escalation): Escalation {
  const i = escalations.findIndex((x) => x.id === e.id);
  if (i >= 0) escalations[i] = e;
  else escalations.push(e);
  escalationMap[e.id] = e;
  return e;
}

export const escalationMap: Record<string, Escalation> = Object.fromEntries(
  escalations.map((e) => [e.id, e]),
);

export function getEscalation(id: string): Escalation | undefined {
  return escalationMap[id];
}
