import { ledgerForSubject } from "@/lib/trace/ledger";
import { getLabsForClient } from "@/lib/mock/labs";
import { consultsForClient } from "@/lib/mock/consults";
import { ordersForClient } from "@/lib/mock/orders";
import { contactLogForClient } from "@/lib/mock/contactLog";
import { escalationsForClient } from "@/lib/escalations/queue";
import { staffName } from "@/lib/mock/staff";
import type { Biomarker } from "@/lib/types";

/**
 * "What changed since you last looked."
 *
 * ── Why no other system in this space can do this ─────────────────────────
 * The hard half of this feature is not the diff. It is the word *you*.
 *
 * Answering "what changed since YOU last looked" requires knowing when this
 * specific staff member last had this specific chart open — which is a READ,
 * and reads are exactly what conventional audit logs throw away. The systems
 * we are replacing log writes (rows changed, by whom) because that is what an
 * ORM gives you for free. A write log can tell you the chart changed; it can
 * never tell you whether the person now reading it has already seen the change.
 *
 * Apex logs reads as first-class ledger events (see lib/trace/ledger.ts, where
 * `view` is a real action with a subject, an actor and a reason). That log was
 * built for HIPAA §164.312(b). This file is the second dividend from it: the
 * same rows that prove who looked at a chart also tell each person what is new
 * to *them*. A clinic that only logs writes cannot build this feature later —
 * the data was never captured.
 *
 * ── The safety rule this file obeys ───────────────────────────────────────
 * Every headline and detail below is assembled from values that already exist
 * on a record: a biomarker's own name/value/unit/status, an order's own status,
 * a consult's own kind. Nothing here infers, interprets or invents a clinical
 * fact, and nothing here produces a dose. If a string looks clinical, it is
 * quoting the record, not authoring it.
 */

export type ChangeKind =
  | "lab"
  | "plan"
  | "protocol"
  | "consult"
  | "order"
  | "message"
  | "escalation";

/**
 * Two levels, not five. This banner exists to answer "is there anything here I
 * need to deal with before I start talking?" — a scale finer than yes/no makes
 * that judgement the reader's problem again.
 */
export type ChangeImportance = "high" | "normal";

export interface ChangeItem {
  /** Stable, derived from the source record — safe as a React key. */
  id: string;
  /** ISO timestamp of the change itself. */
  at: string;
  kind: ChangeKind;
  /** One scannable line. */
  headline: string;
  /** The supporting sentence. Always sourced from the record. */
  detail: string;
  /**
   * Deep link, when one exists.
   *
   * Most chart sub-views are local tab state today (app/clients/[id]/page.tsx),
   * so there is deliberately nothing to link to for those kinds. We leave the
   * field empty rather than emit an href that lands on the wrong tab — a link
   * that does not go where it says is worse than no link.
   */
  href?: string;
  importance: ChangeImportance;
}

/** Parse once, compare numerically. */
function ms(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * Timestamps in Apex come from several generators — some emit UTC (`toISOString`)
 * and some emit naive local wall-clock (lib/mock/orders.ts explains why). String
 * comparison across those two regimes is wrong; epoch comparison is not. Every
 * window test in this file goes through here.
 */
function isAfter(iso: string | undefined, sinceIso: string): boolean {
  if (!iso) return false;
  return ms(iso) > ms(sinceIso);
}

// ---------------------------------------------------------------------------
// The read that makes this possible
// ---------------------------------------------------------------------------

/**
 * Session start. Pinned, like every clock in Apex.
 *
 * Doubles as the cut line below — see lastViewedBy.
 */
export const NOW = "2026-06-12T09:00:00";

/**
 * When did THIS staff member previously open THIS chart?
 *
 * The subtlety is excluding the *current* look. Comparing a chart against the
 * instant you opened it always yields zero changes, so the current session's own
 * view event must not be the baseline.
 *
 * We cut by time rather than by "drop the newest row". Dropping the newest is
 * the obvious implementation and it is wrong in both directions: if the current
 * visit was never logged it silently discards the real answer, and if it was
 * logged twice it still returns the current session. Anything stamped at or
 * after session start belongs to this visit; anything before it is history.
 * That holds whether or not a chart-open view was recorded.
 *
 * `null` means never — a genuinely different state from "nothing changed", and
 * the UI must say so rather than render an empty list.
 */
export function lastViewedBy(
  clientId: string,
  staffId: string,
  nowIso: string = NOW,
): string | null {
  const now = ms(nowIso);
  // ledgerForSubject is already newest-first.
  const previous = ledgerForSubject(clientId).find(
    (r) =>
      r.actorId === staffId &&
      (r.action === "view" || r.action === "break-glass") &&
      ms(r.at) < now,
  );
  return previous?.at ?? null;
}

/**
 * True when this staff member has opened this chart before the current session.
 *
 * Same cut as lastViewedBy on purpose — two functions that disagree about what
 * "has viewed" means is how a banner ends up saying "first look" above a list
 * of changes.
 */
export function hasEverViewed(
  clientId: string,
  staffId: string,
  nowIso: string = NOW,
): boolean {
  return lastViewedBy(clientId, staffId, nowIso) !== null;
}

// ---------------------------------------------------------------------------
// Collectors — one per source of truth
// ---------------------------------------------------------------------------

/** Out of the lab's own reference range, as the lab itself reported it. */
function isAbnormal(b: Biomarker): boolean {
  return b.status === "low" || b.status === "high";
}

function labChanges(clientId: string, since: string): ChangeItem[] {
  const labs = getLabsForClient(clientId);
  if (!labs || !isAfter(labs.resultedOn, since)) return [];

  const abnormal = labs.biomarkers.filter(isAbnormal);
  const watch = labs.biomarkers.filter((b) => b.status === "watch");

  const out: ChangeItem[] = [
    {
      id: `chg-lab-${labs.id}`,
      at: labs.resultedOn,
      kind: "lab",
      headline: `${labs.panelName} resulted`,
      detail: abnormal.length
        ? `${abnormal.length} marker${abnormal.length === 1 ? "" : "s"} outside the reference range, ${watch.length} sub-optimal.`
        : `All markers within the reference range, ${watch.length} sub-optimal.`,
      // An abnormal panel is the single most common thing a clinician needs to
      // have seen BEFORE the member starts talking, so it leads.
      importance: abnormal.length ? "high" : "normal",
    },
  ];

  // Each out-of-range marker gets its own line. A count buried in a sentence is
  // read as a count; a named marker is read as a finding.
  for (const b of abnormal.slice(0, 4)) {
    out.push({
      id: `chg-lab-${labs.id}-${b.key}`,
      at: labs.resultedOn,
      kind: "lab",
      headline: `${b.name} ${b.value}${b.unit ? ` ${b.unit}` : ""} — ${b.status}`,
      detail: `Reference range ${b.refLow}–${b.refHigh}${b.unit ? ` ${b.unit}` : ""}.`,
      importance: "high",
    });
  }

  return out;
}

function consultChanges(clientId: string, since: string): ChangeItem[] {
  return consultsForClient(clientId)
    .filter((c) => isAfter(c.startedAt, since))
    .map((c) => {
      const summary = c.finalSummary ?? c.aiSummary;
      const escalated = summary?.escalations.length ?? 0;
      return {
        id: `chg-consult-${c.id}`,
        at: c.startedAt,
        kind: "consult" as const,
        headline: `${c.kind} — ${staffName(c.authorId)}`,
        detail:
          summary?.headline ??
          `${c.channel} consult, ${c.durationMin ?? 0} min. ${c.status}.`,
        // Unsigned means nobody has taken responsibility for it yet, and a
        // flagged escalation inside it means it contains a question for a
        // provider. Either way it is work, not history.
        importance: escalated > 0 || c.status !== "Signed" ? ("high" as const) : ("normal" as const),
      };
    });
}

/** Order statuses where the shipment is not moving and a human must intervene. */
const ORDER_EXCEPTIONS = new Set(["Insufficient stock", "QC hold", "Failed", "Cancelled"]);

function orderChanges(clientId: string, since: string): ChangeItem[] {
  const out: ChangeItem[] = [];

  for (const order of ordersForClient(clientId)) {
    // One line per order, describing its newest movement inside the window —
    // not one line per event. An order that walked through six happy-path
    // statuses is one thing that happened, and rendering it as six drowns the
    // one order that is genuinely stuck.
    const moved = order.statusHistory.filter((e) => isAfter(e.at, since));
    if (!moved.length) continue;

    const latest = moved[moved.length - 1];
    const exception = ORDER_EXCEPTIONS.has(latest.status);

    out.push({
      id: `chg-order-${order.id}`,
      at: latest.at,
      kind: "order",
      headline: `Order ${order.id} — ${latest.status}`,
      detail:
        latest.note ??
        `${moved.length} update${moved.length === 1 ? "" : "s"} via ${latest.source}, last by ${latest.actor} (${latest.actorRole}).`,
      importance: exception ? "high" : "normal",
    });
  }

  return out;
}

function messageChanges(clientId: string, since: string): ChangeItem[] {
  return contactLogForClient(clientId)
    .filter((m) => isAfter(m.at, since))
    .map((m) => ({
      id: `chg-msg-${m.id}`,
      at: m.at,
      kind: "message" as const,
      headline:
        m.direction === "inbound"
          ? `${m.channel} from the member`
          : `${m.channel} sent — ${m.outcome.toLowerCase()}`,
      detail: m.body,
      // Deliberately normal, including inbound. A message is context you read
      // on the way into the room; a lab or an escalation is something you must
      // have dealt with before you walk in. Ranking them equally is what turns
      // a triage banner back into a feed.
      importance: "normal" as const,
    }));
}

function escalationChanges(clientId: string, since: string): ChangeItem[] {
  const out: ChangeItem[] = [];

  for (const e of escalationsForClient(clientId)) {
    if (isAfter(e.raisedAt, since)) {
      out.push({
        id: `chg-esc-raised-${e.id}`,
        at: e.raisedAt,
        kind: "escalation",
        headline: `${e.priority} escalation raised — ${e.kind}`,
        detail: `${staffName(e.raisedByStaffId)} → ${staffName(e.assignedToStaffId)}: ${e.question}`,
        // A new escalation outranks everything else in the list, always.
        importance: "high",
      });
    }

    if (isAfter(e.answeredAt, since)) {
      out.push({
        id: `chg-esc-answered-${e.id}`,
        at: e.answeredAt!,
        kind: "escalation",
        headline: `Escalation answered — ${e.kind}`,
        detail: e.answer ?? `Answered by ${staffName(e.answeredByStaffId)}.`,
        // An answered Urgent still changes what happens in the room today; an
        // answered Routine is a closed loop worth noting and nothing more.
        importance: e.priority === "Urgent" ? "high" : "normal",
      });
    }
  }

  return out;
}

/**
 * Plan and protocol movement, read off the ledger rather than recomputed.
 *
 * buildPlanOfCare() is a pure function of current client state stamped with the
 * pinned clock, so diffing two plan objects would report "changed" on every
 * chart forever. The ledger, by contrast, records the actual events with their
 * own before/after payloads — which is both true and explainable a year later.
 */
function planChanges(clientId: string, since: string): ChangeItem[] {
  const out: ChangeItem[] = [];

  for (const row of ledgerForSubject(clientId)) {
    if (!isAfter(row.at, since)) continue;

    const describeDiff = () => {
      const before = row.before ? Object.entries(row.before) : [];
      const after = row.after ? Object.entries(row.after) : [];
      if (!before.length && !after.length) return "";
      const fmt = (pairs: [string, unknown][]) =>
        pairs.map(([k, v]) => `${k}: ${String(v)}`).join(", ");
      if (!before.length) return fmt(after);
      return `${fmt(before)} → ${fmt(after)}`;
    };

    if (row.entity === "protocol" && row.action === "update") {
      out.push({
        id: `chg-${row.id}`,
        at: row.at,
        kind: "protocol",
        headline: "Protocol updated",
        detail: `${row.actorName} (${row.actorRole}). ${describeDiff()}`.trim(),
        importance: "high",
      });
      continue;
    }

    if (
      row.entity === "recommendation" &&
      (row.action === "approve" || row.action === "decline")
    ) {
      out.push({
        id: `chg-${row.id}`,
        at: row.at,
        kind: "plan",
        headline:
          row.action === "approve" ? "Recommendation approved" : "Recommendation declined",
        detail: `${row.actorName} (${row.actorRole}). ${describeDiff()}`.trim(),
        // Approval is the moment a proposal becomes something the member is
        // actually doing. That is never a footnote.
        importance: "high",
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

const IMPORTANCE_RANK: Record<ChangeImportance, number> = { high: 0, normal: 1 };

/**
 * Everything that happened on this chart after `sinceIso`, ranked.
 *
 * Order is importance first, recency second. Recency-first is the intuitive
 * choice and the wrong one: it buries an abnormal panel from Monday under three
 * delivery-status pings from this morning, which is precisely the failure mode
 * a "what changed" banner exists to prevent.
 */
export function changesSince(clientId: string, sinceIso: string): ChangeItem[] {
  const items = [
    ...labChanges(clientId, sinceIso),
    ...escalationChanges(clientId, sinceIso),
    ...planChanges(clientId, sinceIso),
    ...consultChanges(clientId, sinceIso),
    ...orderChanges(clientId, sinceIso),
    ...messageChanges(clientId, sinceIso),
  ];

  return items.sort((a, b) => {
    const rank = IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance];
    if (rank !== 0) return rank;
    return ms(b.at) - ms(a.at);
  });
}

/** Labels for the grouped list. Kept here so staff and UI agree on wording. */
export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  lab: "Labs",
  plan: "Plan",
  protocol: "Protocol",
  consult: "Consults",
  order: "Orders",
  message: "Messages",
  escalation: "Escalations",
};

export interface ChangeGroup {
  kind: ChangeKind;
  label: string;
  items: ChangeItem[];
}

/**
 * Group while preserving rank: groups come out in the order their most
 * important member appeared, so escalations lead when there are escalations and
 * messages lead on a quiet chart.
 */
export function groupChanges(items: ChangeItem[]): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  const index = new Map<ChangeKind, ChangeGroup>();

  for (const item of items) {
    let group = index.get(item.kind);
    if (!group) {
      group = { kind: item.kind, label: CHANGE_KIND_LABEL[item.kind], items: [] };
      index.set(item.kind, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
}

/** Whole days between two instants, floored. Used for the banner's copy. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor(Math.abs(ms(toIso) - ms(fromIso)) / 86_400_000);
}

/** "3 weeks ago", "yesterday" — the phrase the banner puts after "since you". */
export function elapsedPhrase(fromIso: string, toIso: string): string {
  const days = daysBetween(fromIso, toIso);
  if (days === 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "a week ago";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}
