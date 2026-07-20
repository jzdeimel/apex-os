import type { Client, Biomarker } from "@/lib/types";
import type { PlanItem, PlanOfCare } from "@/lib/planOfCare/types";
import type { Consult, ConsultKind, ConsultChannel } from "@/lib/consult/types";
import { memberReasons } from "@/lib/planOfCare/memberVoice";
import { recommendationsForClient } from "@/lib/mock/recommendations";
import { recommendationRules } from "@/lib/rules";
import { getLabsForClient } from "@/lib/mock/labs";
import { consultsForClient } from "@/lib/mock/consults";
import { staffMap } from "@/lib/mock/staff";
import type { LedgerDraft } from "@/lib/trace/ledger";

/**
 * "WHY AM I ON THIS?" — the member-facing face of the traceability thesis.
 *
 * Every other surface in Apex can already answer this question for staff: the
 * rule that fired, the panel that fired it, the consult it was raised in, the
 * clinician who owns the decision. A member gets none of that in the system
 * this replaces — they get a bottle and a coach's word for it, and when the
 * coach leaves, the reason leaves with them.
 *
 * So this module walks one plan item back to the things that produced it and
 * returns them as *records with dates on them*, not as prose. The UI renders
 * dates, names and numbers the member can check against their own chart. That
 * is the difference between traceability and a reassuring paragraph.
 *
 * ══ THE RULE THAT MATTERS MOST ════════════════════════════════════════════
 *
 * WHEN THERE IS NO RECORDED REASON, SAY THERE IS NO RECORDED REASON.
 *
 * The tempting failure here is a fallback sentence — "this supports your
 * overall goals" — that renders whenever the joins come back empty. It would
 * make every card look complete and it would be a lie, and worse, it would make
 * the cards that *are* backed by a real panel indistinguishable from the ones
 * that are not. `unexplained` and `gap` exist so the empty case is a visible
 * product state rather than a hole the copy papers over. A member who reads
 * "we don't have a reason recorded for this — ask your coach" and then asks is
 * a member the system has served correctly.
 *
 * Nothing in here interprets a number. It reports which number was on the panel
 * on which day; `memberReasons()` (lib/planOfCare/memberVoice.ts) owns the
 * clinical→member language boundary and is the only thing allowed to put words
 * around a value.
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** A number off a real panel, with the day it resulted. No status word. */
export interface WhyLabSource {
  kind: "lab";
  markerKey: string;
  markerName: string;
  value: number;
  unit: string;
  panelName: string;
  /** Day the blood was taken. */
  collectedOn: string;
  /** Day the result landed. Both are shown — the gap is often the story. */
  resultedOn: string;
}

/** A conversation this item was actually raised in. */
export interface WhyConsultSource {
  kind: "consult";
  consultId: string;
  at: string;
  what: ConsultKind;
  channel: ConsultChannel;
  authorName: string;
  /**
   * The goal or symptom that both the plan item and the consult record mention.
   * Shown to the member so the link is inspectable rather than asserted — they
   * can see *why* we think this conversation is the relevant one.
   */
  matchedOn: string;
  /** What the consult recorded them saying, when it recorded anything. */
  quote?: string;
}

/**
 * Who owns the decision, and whether they have made it.
 *
 * `at` is optional and frequently absent, and that is deliberate rather than a
 * gap in the demo data: `PlanOfCare.approvedAt` is only written when a provider
 * signs inside Apex, and a member whose protocol predates that has a signature
 * living on a paper order. Modelling the timestamp as required would have
 * forced a fabricated date onto exactly the assertion that must never be
 * fabricated.
 */
export interface WhySignoff {
  state: "signed-off" | "with-provider" | "coach-led" | "not-going-ahead";
  who?: string;
  role?: string;
  at?: string;
}

export interface WhyThis {
  itemId: string;
  /** Plain-language reasons, via the member-voice boundary. */
  reasons: string[];
  labs: WhyLabSource[];
  consults: WhyConsultSource[];
  signoff: WhySignoff;
  /** The rule that produced the item, and what that rule looks for. */
  rule?: { id: string; name: string; looksFor: string };
  /** When the reasoning behind this item was computed. */
  decidedOn?: string;
  /** True when nothing above resolved to anything. */
  unexplained: boolean;
  /** Rendered verbatim when `unexplained`. Never softened. */
  gap: string | null;
}

/**
 * The honest empty state, held as a constant so it cannot drift between the
 * places that render it. Phrased as an action for the member, because "no data"
 * is a dead end and "ask your coach" is not.
 */
export const NO_RECORDED_REASON =
  "We don't have a recorded reason for this one. That's a gap in your record, not a secret — ask your coach to tell you where it came from, and they'll either point you at it or take it off your plan.";

// ---------------------------------------------------------------------------
// Joins
// ---------------------------------------------------------------------------

/**
 * Pull the marker name out of an engine trace line.
 *
 * `because[]` mixes two formats: `supporting.labs` produces exact panel names
 * ("Hemoglobin A1C 5.9 % — watch") while `triggeredBy` produces prose ("Lab:
 * elevated A1C"). Matching only the first would silently drop the second, and
 * a member would see a card claiming a lab reason with no lab attached to it.
 * So both are tried, and anything that matches nothing is simply not claimed.
 */
function markersIn(lines: string[], biomarkers: Biomarker[]): Biomarker[] {
  const hits = new Map<string, Biomarker>();

  for (const raw of lines) {
    const line = raw.toLowerCase();

    /**
     * The marker label at the head of the line, with the engine's prefix and
     * severity adjective stripped: "lab: elevated a1c" → "a1c",
     * "a1c 5.9 % — watch" → "a1c", "lab: low igf-1" → "igf-1".
     *
     * The split point is whitespace-then-digit rather than the first digit,
     * because several marker names contain one — splitting "a1c 5.9%" on the
     * first digit yields "a", which matches nothing and silently dropped the
     * lab evidence off every nutrition item. A join that fails quietly is
     * worse than no join at all here: the card would render "no recorded
     * reason" for an item that has one.
     */
    const stem = line
      .replace(/^(lab|body scan|goal|symptom|risk|program):\s*/, "")
      .split(/\s(?=[\d(])/)[0]
      .replace(/^(elevated|low|high)\s+/, "")
      .trim();

    for (const b of biomarkers) {
      const name = b.name.toLowerCase();
      // Either direction: the trace may spell the marker out in full, or use a
      // shorthand ("A1C") that the panel spells out ("Hemoglobin A1C").
      if (line.includes(name) || (stem.length >= 3 && name.includes(stem))) {
        hits.set(b.key, b);
      }
    }
  }

  return [...hits.values()];
}

/** Goal/Symptom tokens the item was triggered by — the consult join key. */
function topicsIn(lines: string[]): string[] {
  const out = new Set<string>();
  for (const line of lines) {
    const m = /^(Goal|Symptom):\s*(.+)$/i.exec(line.trim());
    if (m) out.add(m[2].trim());
  }
  return [...out];
}

/**
 * Consults that recorded one of the item's trigger topics.
 *
 * `visibleToClient` is the gate and it is load-bearing, not decorative: an
 * unsigned consult is a coach's working draft, and surfacing one here would
 * show a member half-formed clinical thinking that nobody has stood behind yet.
 * The filter is applied first, before any matching, so there is no code path
 * where a draft leaks through a join.
 */
function consultsBehind(clientId: string, topics: string[]): WhyConsultSource[] {
  if (topics.length === 0) return [];

  const lowered = topics.map((t) => t.toLowerCase());
  const out: WhyConsultSource[] = [];

  for (const c of consultsForClient(clientId)) {
    if (!c.visibleToClient) continue;
    const summary = c.finalSummary;
    if (!summary) continue;

    const recorded = [...summary.goalsDiscussed, ...summary.symptomsRaised];
    const matched = recorded.find((r) => lowered.includes(r.toLowerCase()));
    if (!matched) continue;

    out.push({
      kind: "consult",
      consultId: c.id,
      at: c.startedAt,
      what: c.kind,
      channel: c.channel,
      authorName: staffMap[c.authorId]?.name ?? "your care team",
      matchedOn: matched,
      quote: quoteFor(summary.subjective, matched),
    });
  }

  // Newest first, capped. Six historical consults all matching "Energy" is
  // technically complete provenance and practically a wall — the two most
  // recent are the ones a member can actually remember having.
  return out.slice(0, 2);
}

/** The member's own reported line, when the consult recorded one about this. */
function quoteFor(subjective: string[], topic: string): string | undefined {
  const needle = topic.toLowerCase();
  return subjective.find((s) => s.toLowerCase().includes(needle));
}

// ---------------------------------------------------------------------------
// Sign-off
// ---------------------------------------------------------------------------

function signoffFor(client: Client, plan: PlanOfCare, item: PlanItem): WhySignoff {
  const provider = staffMap[client.providerId];
  const coach = staffMap[client.coachId];

  // Nutrition and training are the coach's to set. Attaching a provider
  // signature to "eat more protein" would devalue the signature on the items
  // that genuinely carry one.
  if (!item.requiresProviderApproval) {
    return { state: "coach-led", who: coach?.name, role: "Your coach" };
  }

  const rec = recommendationFor(client, item);

  if (rec?.status === "declined") {
    return { state: "not-going-ahead", who: provider?.name, role: "Your provider" };
  }
  if (rec?.status === "provider approved") {
    return {
      state: "signed-off",
      who: provider?.name,
      role: "Your provider",
      // Usually undefined — see WhySignoff. The UI says so out loud.
      at: plan.approvedAt,
    };
  }
  return { state: "with-provider", who: provider?.name, role: "Your provider" };
}

/**
 * The recommendation behind a protocol item.
 *
 * The join is real rather than positional: the plan engine stores the firing
 * rule id on `PlanItem.ruleIds`, and recommendation ids are
 * `rec-<clientId>-<ruleId>`. Matching on array index instead would break
 * silently the first time a rule stops firing.
 */
function recommendationFor(client: Client, item: PlanItem) {
  const ruleId = item.ruleIds[0];
  if (!ruleId) return undefined;
  return recommendationsForClient(client.id).find((r) => r.id === `rec-${client.id}-${ruleId}`);
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export function whyThis(client: Client, plan: PlanOfCare, item: PlanItem): WhyThis {
  const labs = getLabsForClient(client.id);
  const reasons = memberReasons(item);

  const rec = recommendationFor(client, item);
  // Protocol items get their marker list from the recommendation's own
  // `supporting.labs`, which is the engine's explicit statement of what it
  // read. Falling back to text-matching the trace lines covers nutrition and
  // training items, whose evidence only ever exists as prose.
  const named = rec ? rec.supporting.labs.map((l) => l.name) : [];
  const markers = markersIn([...named, ...item.because], labs?.biomarkers ?? []);

  const labSources: WhyLabSource[] = labs
    ? markers.map((b) => ({
        kind: "lab" as const,
        markerKey: b.key,
        markerName: b.name,
        value: b.value,
        unit: b.unit,
        panelName: labs.panelName,
        collectedOn: labs.collectedOn,
        resultedOn: labs.resultedOn,
      }))
    : [];

  const consults = consultsBehind(client.id, topicsIn(item.because));

  const ruleDef = recommendationRules.find((r) => r.id === item.ruleIds[0]);
  const rule = ruleDef
    ? { id: ruleDef.id, name: ruleDef.name, looksFor: ruleDef.triggerSummary }
    : undefined;

  const unexplained = reasons.length === 0 && labSources.length === 0 && consults.length === 0;

  return {
    itemId: item.id,
    reasons,
    labs: labSources,
    consults,
    signoff: signoffFor(client, plan, item),
    rule,
    decidedOn: rec?.generatedOn ?? plan.createdAt,
    unexplained,
    gap: unexplained ? NO_RECORDED_REASON : null,
  };
}

/** Every item on the plan, keyed by item id. */
export function whyThisAll(client: Client, plan: PlanOfCare): Record<string, WhyThis> {
  const out: Record<string, WhyThis> = {};
  for (const item of [...plan.protocol, ...plan.nutrition, ...plan.training]) {
    out[item.id] = whyThis(client, plan, item);
  }
  return out;
}

/**
 * The ledger event for a member opening the reasoning behind one item.
 *
 * Returned as a draft rather than appended here for the reason every other
 * domain module in this codebase does the same: a pure function that returns an
 * event can be called during render or in a test without mutating the chain.
 * The component appends it from an event handler.
 *
 * A member reading their own chart is still a read of a chart, and reads are
 * first-class events in this ledger (see lib/trace/ledger.ts). Logging it also
 * gives the clinic something genuinely useful: which parts of a plan members
 * actually go looking for an explanation of.
 */
export function whyOpenedEvent(client: Client, item: PlanItem): LedgerDraft {
  return {
    actorId: client.id,
    actorName: `${client.firstName} ${client.lastName}`,
    actorRole: "Client",
    action: "view",
    entity: item.requiresProviderApproval ? "recommendation" : "chart",
    entityId: item.id,
    subjectId: client.id,
    subjectName: `${client.firstName} ${client.lastName}`,
    locationId: client.locationId,
    reason: "Member opened the reasoning behind a plan item",
    after: { item: item.title, section: item.section, ruleIds: item.ruleIds },
  };
}
