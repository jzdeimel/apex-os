import { absolute } from "@/lib/utils";
import type { Client } from "@/lib/types";
import { getClient } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { consultsForClient } from "@/lib/mock/consults";
import { ordersForClient } from "@/lib/mock/orders";
import { escalationsForClient } from "@/lib/escalations/fixtureSelectors";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { alphaScore } from "@/lib/alphaScore";
import { ledgerForSubject, type LedgerRow } from "@/lib/trace/ledger";

/**
 * The Time Machine — reconstruct a member's chart as it stood at any past instant.
 *
 * This is possible for exactly one reason: the ledger is append-only and every
 * mutation row carries its own `before`/`after`. State at time T is therefore a
 * fold of events up to T, not a query against a mutable row that has since been
 * overwritten. Almost no clinical system can answer "what did we know on the
 * 14th?" — they can only show you today's record and let you guess.
 *
 * ---------------------------------------------------------------------------
 * THE HONESTY RULE
 * ---------------------------------------------------------------------------
 * A replayed snapshot must NEVER show information that did not exist yet.
 *
 * If a lab resulted after `asOf`, it is ABSENT — not greyed out, not "pending",
 * not shown with a lock icon. Same for consults, orders, escalations and the
 * Alpha Score. The entire clinical value of this feature is that it is not a
 * filtered view of today: a reviewer asking "was it reasonable to miss that?"
 * gets an honest answer only if the future is genuinely invisible.
 *
 * Every derivation below is therefore written as a forward filter (`<= asOf`),
 * never as a reverse redaction of the current record. The two look similar and
 * are not: a redaction still has to decide what to hide, and a decision that can
 * be made wrong will eventually be made wrong.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE LEDGER RUNS OUT
 * ---------------------------------------------------------------------------
 * The demo ledger carries diffs for the things it records (plan approvals, note
 * signatures, protocol cadence changes) but it does not version every field on a
 * chart — no production audit log does either. For those fields we derive from
 * DATED SOURCE DATA (lab `resultedOn`, consult `startedAt`, order status events,
 * escalation `raisedAt`/`answeredAt`), which is the same evidence a human
 * auditor would use. Each such derivation is marked `DERIVED:` at its site, and
 * the fields we genuinely cannot time-travel are marked `NOT VERSIONED:` and
 * carried forward from the live record rather than being invented.
 */

/** Pinned clock. Identical to lib/trace/ledger.ts and lib/mock/orders.ts. */
export const NOW = "2026-06-12T09:00:00";

/**
 * Parse to epoch ms.
 *
 * The corpus mixes two timestamp regimes: naive local wall-clock strings
 * ("2026-06-12T09:00:00", from the order book and the pinned clock) and UTC
 * `toISOString()` output (the ledger, consults). Bare dates ("2026-06-01") would
 * be parsed as UTC midnight by the spec, which drags them into the other regime
 * and can shift a lab a calendar day either side of a scrub point — so we pin
 * them to local midnight instead. Everything else is compared as-is; a
 * sub-day offset does not change which side of an event a scrub lands on.
 */
function ms(iso: string): number {
  return absolute(iso.length === 10 ? `${iso}T00:00:00` : iso).getTime();
}

/** True when `iso` happened at or before the as-of instant. The only gate. */
function atOrBefore(iso: string | undefined, asOfMs: number): boolean {
  return iso !== undefined && ms(iso) <= asOfMs;
}

/**
 * How a field on a snapshot was obtained.
 *
 * This exists because a replay that cannot distinguish "the ledger recorded
 * this" from "we inferred this from today's data" is worse than no replay at
 * all — it launders a guess into a historical fact. The UI renders this tag
 * next to every value; a `derived` number is legitimate context, a `ledger`
 * number is evidence, and they must never look the same.
 */
export type Provenance = "ledger" | "derived" | "not-versioned";

export interface ChartSnapshot {
  /** The instant being replayed. */
  asOf: string;
  status: Client["status"];
  planStatus: Client["planStatus"];
  /** Null when no lab had resulted yet — a score with no inputs is a lie. */
  alphaScore: number | null;
  /** Resulted lab panels known at `asOf`. */
  labCount: number;
  latestLabDate?: string;
  /**
   * Protocol membership at `asOf` — or null.
   *
   * NOT VERSIONED. Protocol membership is not carried on the ledger as dated
   * rows, and the earlier implementation filled this by calling
   * `buildPlanOfCare(client)`, which derives items from TODAY'S labs. That
   * meant a snapshot could name interventions justified by results that had not
   * been drawn yet — the exact fabrication this whole feature exists to refuse.
   *
   * Null is the honest answer until protocol changes are versioned.
   */
  activeProtocolItems: string[] | null;
  openOrders: number;
  consultCount: number;
  escalationsOpen: number;
  /**
   * Care team at `asOf` — or null.
   *
   * NOT VERSIONED. Assignment changes are not dated on the ledger, so carrying
   * today's coach and provider backwards would attribute a past encounter to
   * whoever holds the client now. Misattributing clinical responsibility to a
   * named clinician is not a fidelity gap; it is a false record.
   */
  careTeam: { coachId: string; providerId: string } | null;

  /** Per-field provenance, rendered beside each value. */
  provenance: Record<
    "status" | "planStatus" | "alphaScore" | "labCount" | "activeProtocolItems" | "openOrders" | "consultCount" | "escalationsOpen" | "careTeam",
    Provenance
  >;
  /**
   * What the care team ACTUALLY KNEW at this moment, in plain language.
   *
   * The most important field on this object. The counts above tell you the
   * shape of the chart; this tells you what a clinician standing in front of
   * this member could have acted on. Every line is generated from a dated fact
   * that had already occurred — nothing here is ever back-filled from today.
   */
  knownAt: string[];
}

export type MarkKind =
  | "join"
  | "consult"
  | "lab"
  | "order"
  | "escalation"
  | "plan"
  | "now";

export interface TimelineMark {
  at: string;
  label: string;
  kind: MarkKind;
}

export interface SnapshotDiff {
  field: string;
  from: string;
  to: string;
}

/* ------------------------------------------------------------------ *
 * Folds
 * ------------------------------------------------------------------ */

/**
 * Plan status, folded from the ledger.
 *
 * This one genuinely IS in the chain: approvals and declines of a recommendation
 * carry `before: { status }` / `after: { status }`, so we replay the transitions
 * in order and take the last one at or before `asOf`. We map the ledger's own
 * vocabulary onto the chart's `planStatus` rather than inventing a third one.
 *
 * At the present instant the live record wins outright. Not every member's plan
 * approval is on this demo's chain, and when it is missing the honest reading is
 * "we cannot date this approval" — NOT "the plan was a draft until today". So we
 * decline to assert an active plan at any past instant we have no event for, and
 * we defer to the real value at NOW rather than contradicting the chart the user
 * can see for themselves one panel over.
 */
function foldPlanStatus(
  rows: LedgerRow[],
  asOfMs: number,
  hadConsult: boolean,
  live: Client["planStatus"],
): Client["planStatus"] {
  if (asOfMs >= ms(NOW)) return live;

  let status: Client["planStatus"] | undefined;

  for (const r of rows) {
    if (ms(r.at) > asOfMs) break; // rows arrive oldest-first; nothing after this matters
    if (r.entity !== "recommendation" && r.entity !== "protocol") continue;
    const after = (r.after ?? {}) as { status?: unknown };
    if (r.action === "approve" || after.status === "Approved") status = "Active";
    else if (r.action === "decline" || after.status === "Declined") status = "Needs review";
  }

  if (status) return status;
  // DERIVED: no plan event on the chain yet. A chart with a consult on it has at
  // minimum a draft in flight; one without has nothing at all.
  return hadConsult ? "Draft" : "No plan";
}

/**
 * Client status.
 *
 * NOT VERSIONED: the ledger records actions on entities, not lifecycle
 * transitions of the member record, so there is no diff to replay here.
 * DERIVED instead from the dated milestones that define the lifecycle, which is
 * exactly the evidence an auditor would reconstruct it from. When `asOf` is the
 * present we defer to the live record rather than to our own ladder — the real
 * value always wins over a derivation of it.
 */
function deriveStatus(
  client: Client,
  asOfMs: number,
  hadConsult: boolean,
  labsKnown: boolean,
  planStatus: Client["planStatus"],
): Client["status"] {
  if (asOfMs >= ms(NOW)) return client.status;
  if (!atOrBefore(client.joinedOn, asOfMs)) return "Lead";
  if (planStatus === "Active") return "Active Protocol";
  if (labsKnown) return "Results Ready";
  if (hadConsult) return "Consult Booked";
  return "Lead";
}

/**
 * Protocol items in force at `asOf` — TITLES ONLY, deliberately.
 *
 * NOT VERSIONED: the plan-of-care engine is deterministic but not historical, so
 * we cannot know which items were in the plan on an arbitrary past date. We
 * therefore show them ONLY while the plan was actually in force — a draft that
 * no provider had approved yet was not directing anyone's care, and listing its
 * items under "protocol in force" would assert a treatment that was never given.
 *
 * We also deliberately do NOT reattach the ledger's `cadence` diffs to these
 * items. The chain records that *a* protocol cadence changed; it does not record
 * WHICH item it belonged to. Pairing an arbitrary cadence with a named clinical
 * item would manufacture a timing claim that no source asserts — the exact bug
 * class this product treats as highest severity. Cadence changes are surfaced as
 * events in `knownAt` and on the timeline, where they are true, and nowhere else.
 */
/**
 * Protocol membership is deliberately NOT reconstructed.
 *
 * `buildPlanOfCare` reads today's labs and scan, so anything it returns is a
 * statement about now, not about `asOf`. Presenting it as the protocol that was
 * in force at a past instant would name interventions on the strength of
 * results that did not exist yet.
 *
 * Until protocol changes are written to the ledger as dated rows, the honest
 * answer is that we do not know — so the snapshot says so and the UI renders
 * it as unavailable rather than as an empty list, which would read as
 * "they were on nothing".
 */
function activeProtocolTitles(): string[] | null {
  return null;
}

/**
 * Alpha Score as of `asOf`.
 *
 * DERIVED: `alphaScore().trend` is a dated series, so we take the newest point
 * at or before `asOf`. Before the first point there is no score — and we return
 * null rather than 0, because 0 would render as a catastrophically bad score
 * instead of as an absence.
 */
function scoreAsOf(client: Client, asOfMs: number, labsKnown: boolean): number | null {
  if (!labsKnown) return null;
  const past = alphaScore(client).trend.filter((t) => atOrBefore(t.date, asOfMs));
  return past.length ? past[past.length - 1].value : null;
}

/** Non-terminal order statuses. Mirrors the fulfillment lifecycle's terminals. */
const TERMINAL = new Set(["Delivered", "Cancelled", "Failed"]);

/**
 * Open orders at `asOf`.
 *
 * DERIVED, and honestly so: an order carries its full `statusHistory`, so its
 * state at a past instant is the last event that had already fired. An order
 * delivered yesterday was genuinely open last week, and this says so — reading
 * today's `status` field would have silently rewritten that history.
 */
function openOrdersAsOf(clientId: string, asOfMs: number): number {
  let open = 0;
  for (const o of ordersForClient(clientId)) {
    if (!atOrBefore(o.placedAt, asOfMs)) continue; // not yet placed: absent, not pending
    const past = o.statusHistory.filter((e) => atOrBefore(e.at, asOfMs));
    const statusThen = past.length ? past[past.length - 1].status : "Draft";
    if (!TERMINAL.has(statusThen)) open += 1;
  }
  return open;
}

/** Escalations raised by `asOf` and not yet answered by then. */
function openEscalationsAsOf(clientId: string, asOfMs: number): number {
  return escalationsForClient(clientId).filter(
    (e) => atOrBefore(e.raisedAt, asOfMs) && !atOrBefore(e.answeredAt, asOfMs),
  ).length;
}

/* ------------------------------------------------------------------ *
 * The replay
 * ------------------------------------------------------------------ */

/**
 * Reconstruct `clientId`'s chart as it stood at `asOfIso`.
 *
 * Pure and deterministic: same client + same instant always yields the same
 * snapshot, which is what makes it admissible as an explanation of a past
 * decision rather than merely a nice animation.
 */
export function replayAt(clientId: string, asOfIso: string): ChartSnapshot {
  const client = getClient(clientId);
  const asOfMs = ms(asOfIso);

  // Empty-but-valid snapshot for an unknown id. Returning null here would push
  // the honesty problem onto every caller, and one of them would get it wrong.
  if (!client) {
    return {
      asOf: asOfIso,
      status: "Lead",
      planStatus: "No plan",
      alphaScore: null,
      labCount: 0,
      activeProtocolItems: null,
      openOrders: 0,
      consultCount: 0,
      escalationsOpen: 0,
      careTeam: null,
      provenance: {
        status: "derived",
        planStatus: "derived",
        alphaScore: "derived",
        labCount: "derived",
        activeProtocolItems: "not-versioned",
        openOrders: "derived",
        consultCount: "derived",
        escalationsOpen: "derived",
        careTeam: "not-versioned",
      },
      knownAt: ["No chart exists for this identifier."],
    };
  }

  // Oldest-first: a fold has to run forward, and ledgerForSubject is newest-first.
  const rows = [...ledgerForSubject(clientId)].reverse();

  const labs = getLabsForClient(clientId);
  const labsKnown = Boolean(labs && atOrBefore(labs.resultedOn, asOfMs));

  const consultsKnown = consultsForClient(clientId).filter((c) =>
    atOrBefore(c.startedAt, asOfMs),
  );
  const hadConsult = consultsKnown.length > 0;

  const planStatus = foldPlanStatus(rows, asOfMs, hadConsult, client.planStatus);
  const status = deriveStatus(client, asOfMs, hadConsult, labsKnown, planStatus);
  const protocolItems = activeProtocolTitles();
  const openOrders = openOrdersAsOf(clientId, asOfMs);
  const escalationsOpen = openEscalationsAsOf(clientId, asOfMs);

  // Reads count too: HIPAA's question is who *looked*, and "nobody had opened
  // this chart yet" is a materially different situation from "four people had".
  const viewsByThen = rows.filter(
    (r) => ms(r.at) <= asOfMs && (r.action === "view" || r.action === "export"),
  ).length;
  const cadenceChanges = rows.filter(
    (r) => ms(r.at) <= asOfMs && r.entity === "protocol" && r.action === "update",
  ).length;

  const knownAt: string[] = [];
  knownAt.push(
    labsKnown && labs
      ? `${labs.panelName} resulted ${labs.resultedOn} — ${labs.biomarkers.length} markers on file.`
      : "No lab panel had resulted yet.",
  );
  knownAt.push(
    hadConsult
      ? `${consultsKnown.length} consult${consultsKnown.length === 1 ? "" : "s"} on the chart, most recent ${consultsKnown[0].kind.toLowerCase()}.`
      : "No consult had been documented yet.",
  );
  knownAt.push(
    planStatus === "No plan"
      ? "No plan of care existed."
      : planStatus === "Active"
        ? // The plan's APPROVAL is a dated ledger event, so we can state it.
          // Its CONTENTS are not versioned, so we deliberately do not claim
          // what was on it — an item count sourced from today would be a guess
          // wearing the clothes of a record.
          "Plan of care approved and in force. Its contents at this date are not on the record."
        : `Plan of care ${planStatus.toLowerCase()} — not yet in force.`,
  );
  if (openOrders > 0) knownAt.push(`${openOrders} order${openOrders === 1 ? "" : "s"} in flight.`);
  if (escalationsOpen > 0) {
    knownAt.push(
      `${escalationsOpen} escalation${escalationsOpen === 1 ? "" : "s"} awaiting a provider answer.`,
    );
  }
  if (cadenceChanges > 0) {
    knownAt.push(
      `${cadenceChanges} protocol cadence change${cadenceChanges === 1 ? "" : "s"} recorded on the chain.`,
    );
  }
  knownAt.push(
    viewsByThen === 0
      ? "No one had opened this chart yet."
      : `${viewsByThen} chart access${viewsByThen === 1 ? "" : "es"} logged to this point.`,
  );

  return {
    asOf: asOfIso,
    status,
    planStatus,
    alphaScore: scoreAsOf(client, asOfMs, labsKnown),
    labCount: labsKnown ? 1 : 0,
    // Absent, not withheld: a lab that had not resulted has no date to show.
    latestLabDate: labsKnown ? labs!.resultedOn : undefined,
    activeProtocolItems: protocolItems,
    openOrders,
    consultCount: consultsKnown.length,
    escalationsOpen,
    // NOT VERSIONED: care-team assignment carries no ledger diff, so it is
    // carried forward from the live record rather than fabricated backwards.
    // Not versioned — see the field docs. Null, never today's assignment.
    careTeam: null,
    provenance: {
      status: "derived",
      planStatus: "ledger",
      alphaScore: "derived",
      labCount: "derived",
      activeProtocolItems: "not-versioned",
      openOrders: "ledger",
      consultCount: "derived",
      escalationsOpen: "derived",
      careTeam: "not-versioned",
    },
    knownAt,
  };
}

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

/**
 * The instants where something on this chart actually changed.
 *
 * The scrubber snaps to these rather than to calendar days on purpose. Arbitrary
 * days invite a reviewer to land between events and read a snapshot that no one
 * ever lived through; snapping to real transitions means every position on the
 * track is a moment the care team genuinely occupied.
 *
 * Always oldest-first, always ending at NOW so "today" is reachable.
 */
export function timelineMarks(clientId: string): TimelineMark[] {
  const client = getClient(clientId);
  if (!client) return [{ at: NOW, label: "Today", kind: "now" }];

  const marks: TimelineMark[] = [{ at: client.joinedOn, label: "Joined Alpha Health", kind: "join" }];

  for (const c of consultsForClient(clientId)) {
    marks.push({ at: c.startedAt, label: `${c.kind} — ${c.channel.toLowerCase()}`, kind: "consult" });
  }

  const labs = getLabsForClient(clientId);
  if (labs) {
    marks.push({ at: labs.collectedOn, label: `${labs.panelName} drawn`, kind: "lab" });
    // Collection and result are separate moments and the gap is where the
    // interesting question lives: what did we know while we were waiting?
    if (labs.resultedOn !== labs.collectedOn) {
      marks.push({ at: labs.resultedOn, label: `${labs.panelName} resulted`, kind: "lab" });
    }
  }

  for (const o of ordersForClient(clientId)) {
    marks.push({ at: o.placedAt, label: `Order ${o.id} placed`, kind: "order" });
    const delivered = o.statusHistory.find((e) => e.status === "Delivered");
    if (delivered) marks.push({ at: delivered.at, label: `Order ${o.id} delivered`, kind: "order" });
  }

  for (const e of escalationsForClient(clientId)) {
    marks.push({ at: e.raisedAt, label: `Escalation raised — ${e.kind}`, kind: "escalation" });
    if (e.answeredAt) marks.push({ at: e.answeredAt, label: "Escalation answered", kind: "escalation" });
  }

  // Ledger events that moved the plan. Reads are omitted here: they are real and
  // they are counted in `knownAt`, but 40 view markers would bury the six that
  // changed the chart.
  for (const r of ledgerForSubject(clientId)) {
    if (r.entity !== "recommendation" && r.entity !== "protocol") continue;
    if (r.action === "view") continue;
    const after = (r.after ?? {}) as { status?: unknown };
    const label =
      r.action === "approve" || after.status === "Approved"
        ? "Plan approved by provider"
        : r.action === "decline" || after.status === "Declined"
          ? "Recommendation declined"
          : "Protocol updated";
    marks.push({ at: r.at, label, kind: "plan" });
  }

  marks.push({ at: NOW, label: "Today — current record", kind: "now" });

  const nowMs = ms(NOW);
  const seen = new Set<string>();
  return marks
    .filter((m) => {
      // Future-dated entries (a scheduled appointment, an order's ETA) are not
      // history and must never become scrub targets.
      if (ms(m.at) > nowMs) return false;
      const key = `${m.at}|${m.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => ms(a.at) - ms(b.at));
}

/* ------------------------------------------------------------------ *
 * Diff
 * ------------------------------------------------------------------ */

function show(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

/**
 * What changed between two snapshots, in the order a clinician reads a chart.
 *
 * Unchanged fields are omitted entirely. A diff that lists everything is a table,
 * and a table makes the reader do the work the diff exists to do for them.
 */
export function diffSnapshots(a: ChartSnapshot, b: ChartSnapshot): SnapshotDiff[] {
  const out: SnapshotDiff[] = [];
  const push = (field: string, from: string, to: string) => {
    if (from !== to) out.push({ field, from, to });
  };

  push("Status", a.status, b.status);
  push("Plan", a.planStatus, b.planStatus);
  push("Alpha Score", show(a.alphaScore), show(b.alphaScore));
  push("Labs on file", show(a.labCount), show(b.labCount));
  push("Latest lab", show(a.latestLabDate), show(b.latestLabDate));
  push("Consults", show(a.consultCount), show(b.consultCount));
  push("Open orders", show(a.openOrders), show(b.openOrders));
  push("Open escalations", show(a.escalationsOpen), show(b.escalationsOpen));

  // Protocol added/removed rows are deliberately absent.
  //
  // They read as recorded transitions, but protocol membership is not versioned
  // — both sides would have come from today's plan, so every such row would be
  // a fabricated event. A diff that invents transitions is worse than a diff
  // that admits a gap.

  return out;
}
