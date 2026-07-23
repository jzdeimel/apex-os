import { sha256, canonicalJson } from "@/lib/trace/hash";
import { clients, clientName } from "@/lib/mock/clients";
import { staff, staffName } from "@/lib/mock/staff";
import { seededRandom, absolute } from "@/lib/utils";
import type { LocationId } from "@/lib/types";

/**
 * The Apex ledger — append-only, hash-chained record of everything that
 * happened, reads included.
 *
 * Design notes that carry over verbatim to production:
 *  - READS ARE EVENTS. Most systems log writes and call it an audit log.
 *    HIPAA §164.312(b) is primarily about who *viewed* what, so `view` is a
 *    first-class action here, not an afterthought.
 *  - DENIALS ARE EVENTS. A blocked cross-location access attempt is the single
 *    most security-relevant thing that can happen; it must not be the one
 *    thing that leaves no trace.
 *  - EVERY EVENT CARRIES ITS DIFF. `before`/`after` are on the row, so a
 *    change is reconstructable years later without replaying application code.
 *  - THE CHAIN IS REAL. `hash = sha256(prevHash + canonicalJson(payload))`.
 *    Tamper with any row and every subsequent link fails verification —
 *    see `verifyChain` and, for the demo, `tamperedLedger`.
 */

export type LedgerAction =
  | "view"
  | "create"
  | "update"
  | "sign"
  | "approve"
  | "decline"
  | "deny"
  | "export"
  | "archive"
  | "deliver"
  | "login"
  | "break-glass";

export type LedgerEntity =
  | "chart"
  | "lab"
  | "lab-order"
  | "lab-result"
  | "adverse-event"
  | "note"
  | "recommendation"
  | "protocol"
  | "membership"
  | "invoice"
  | "payment"
  | "order"
  | "consent"
  | "document"
  | "session"
  | "message"
  | "appointment"
  | "clinic-resource"
  | "resource-reservation"
  | "calendar"
  | "rule-set"
  /**
   * A feature flag change. Distinct from "rule-set", which versions CLINICAL
   * rules — this is configuration that changes what the clinic can see and do.
   * It earns a ledger entity because turning a surface off changes what gets
   * recorded, and a change to what gets recorded must itself be recorded.
   */
  | "feature-flag";

export interface LedgerPayload {
  seq: number;
  at: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: LedgerAction;
  entity: LedgerEntity;
  entityId: string;
  /** Patient the event concerns, when it concerns one. */
  subjectId?: string;
  subjectName?: string;
  locationId?: LocationId;
  /** Stated reason — required for break-glass and denials. */
  reason?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface LedgerRow extends LedgerPayload {
  id: string;
  prevHash: string;
  hash: string;
}

/** Genesis anchor — the chain's immovable root. */
export const GENESIS_HASH = "0".repeat(64);

/**
 * Put a payload into ONE canonical shape before hashing.
 *
 * THIS IS THE WHOLE CORRECTNESS OF THE CHAIN. The write path hashed the sparse
 * draft — optional fields simply absent — while Postgres stores those columns
 * as NULL and hands them back present-and-null. `canonicalJson` includes a
 * present null key and omits an absent one, so the same logical row hashed
 * differently on write and on read-back, and `verifyChain` reported
 * hash-mismatch (i.e. "someone tampered with this") for rows nobody had
 * touched. A tamper-evidence mechanism that cries wolf is worse than none,
 * because the first real alarm is indistinguishable from the noise.
 *
 * Second, subtler instance of the same fault: `at` is a timestamptz, so it
 * comes back as a Date. `typeof Date === "object"` and it has no own
 * enumerable keys, so canonicalJson rendered it as `{}` — every read-back row
 * would have failed regardless of the null handling.
 *
 * Normalising HERE, inside hashRow, means both callers get it for free and no
 * future call site can reintroduce the drift.
 */
export function normalizeLedgerPayload(payload: LedgerPayload): Record<string, unknown> {
  // `at` is typed string, but a row read back from Postgres carries a Date in
  // that slot — which canonicalJson would render as "{}" because a Date has no
  // own enumerable keys. Widen to unknown so the runtime check is legal and the
  // two shapes converge.
  const rawAt: unknown = payload.at;
  const at =
    rawAt instanceof Date
      ? rawAt.toISOString()
      : typeof rawAt === "string"
        ? rawAt
        : String(rawAt);

  // Every field named explicitly, optionals coerced to null. Deliberately NOT
  // a spread of the input: an unexpected extra key would change the hash on one
  // side only.
  return {
    seq: payload.seq,
    at,
    actorId: payload.actorId,
    actorName: payload.actorName,
    actorRole: payload.actorRole,
    action: payload.action,
    entity: payload.entity,
    entityId: payload.entityId,
    subjectId: payload.subjectId ?? null,
    subjectName: payload.subjectName ?? null,
    locationId: payload.locationId ?? null,
    reason: payload.reason ?? null,
    before: payload.before ?? null,
    after: payload.after ?? null,
  };
}

export function hashRow(prevHash: string, payload: LedgerPayload): string {
  return sha256(prevHash + canonicalJson(normalizeLedgerPayload(payload)));
}

/** Link a payload sequence into a chain. Pure — used by the generator + tests. */
export function buildChain(payloads: LedgerPayload[]): LedgerRow[] {
  const rows: LedgerRow[] = [];
  let prev = GENESIS_HASH;
  for (const p of payloads) {
    const hash = hashRow(prev, p);
    rows.push({ ...p, id: `led-${String(p.seq).padStart(5, "0")}`, prevHash: prev, hash });
    prev = hash;
  }
  return rows;
}

export interface ChainVerdict {
  ok: boolean;
  checked: number;
  /** Ledger row id of the first link that failed, if any. */
  brokenAt?: string;
  /** Which invariant failed — useful copy for the UI. */
  failure?: "hash-mismatch" | "link-mismatch";
}

/**
 * Recompute every link and compare.
 *
 * Two distinct failure modes, deliberately distinguished:
 *  - `hash-mismatch` — the row's contents no longer produce its stored hash
 *    (someone edited the data)
 *  - `link-mismatch` — the row's prevHash doesn't match the previous row's
 *    hash (someone removed or reordered rows)
 */
export function verifyChain(rows: LedgerRow[]): ChainVerdict {
  let prev = GENESIS_HASH;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.prevHash !== prev) {
      return { ok: false, checked: i + 1, brokenAt: row.id, failure: "link-mismatch" };
    }
    const { id: _id, prevHash: _p, hash, ...payload } = row;
    if (hashRow(prev, payload as LedgerPayload) !== hash) {
      return { ok: false, checked: i + 1, brokenAt: row.id, failure: "hash-mismatch" };
    }
    prev = hash;
  }
  return { ok: true, checked: rows.length };
}

// ---------------------------------------------------------------------------
// Demo event generation
// ---------------------------------------------------------------------------

const NOW = absolute("2026-06-12T09:00:00");

const VIEW_REASONS = [
  "Scheduled visit prep",
  "Lab result review",
  "Coach check-in",
  "Refill request",
  "Care-team consult",
];

interface Shape {
  action: LedgerAction;
  entity: LedgerEntity;
  weight: number;
}

// Weighted so the ledger reads like a real clinic day: overwhelmingly reads,
// a steady trickle of writes, rare approvals, rarer denials.
const SHAPES: Shape[] = [
  { action: "view", entity: "chart", weight: 34 },
  { action: "view", entity: "lab", weight: 14 },
  { action: "update", entity: "note", weight: 9 },
  { action: "view", entity: "recommendation", weight: 8 },
  { action: "create", entity: "note", weight: 7 },
  { action: "approve", entity: "recommendation", weight: 6 },
  { action: "sign", entity: "note", weight: 5 },
  { action: "update", entity: "protocol", weight: 4 },
  { action: "create", entity: "order", weight: 4 },
  { action: "login", entity: "session", weight: 4 },
  { action: "export", entity: "chart", weight: 2 },
  { action: "decline", entity: "recommendation", weight: 1 },
  { action: "deny", entity: "chart", weight: 1 },
  { action: "break-glass", entity: "chart", weight: 1 },
];

const SHAPE_TOTAL = SHAPES.reduce((s, x) => s + x.weight, 0);

function pickShape(r: number): Shape {
  let acc = 0;
  const target = r * SHAPE_TOTAL;
  for (const s of SHAPES) {
    acc += s.weight;
    if (target <= acc) return s;
  }
  return SHAPES[0];
}

/** Diffs that make the before/after column meaningful rather than decorative. */
function diffFor(
  shape: Shape,
  rand: () => number,
): { before?: Record<string, unknown>; after?: Record<string, unknown> } {
  if (shape.action === "approve") {
    return { before: { status: "Pending review" }, after: { status: "Approved" } };
  }
  if (shape.action === "decline") {
    return { before: { status: "Pending review" }, after: { status: "Declined" } };
  }
  if (shape.action === "sign") {
    return { before: { status: "Draft", signedAt: null }, after: { status: "Signed", signedAt: "2026-06-12" } };
  }
  if (shape.entity === "protocol") {
    const cadences = ["3x / week", "Daily", "5x / week", "2x / week"];
    const a = Math.floor(rand() * cadences.length);
    const b = (a + 1 + Math.floor(rand() * (cadences.length - 1))) % cadences.length;
    return { before: { cadence: cadences[a] }, after: { cadence: cadences[b] } };
  }
  if (shape.action === "create" && shape.entity === "note") {
    return { after: { type: "SOAP", authored: "AI-assisted draft", status: "Draft" } };
  }
  if (shape.action === "update" && shape.entity === "note") {
    return { before: { chars: 480 + Math.floor(rand() * 300) }, after: { chars: 700 + Math.floor(rand() * 500) } };
  }
  if (shape.action === "create" && shape.entity === "order") {
    return { after: { lines: 1 + Math.floor(rand() * 3), status: "Draft" } };
  }
  return {};
}

/**
 * The member whose portal the demo opens on. Kept in sync with
 * components/portal/PortalHeader.ts's `ME` — if that changes, change this.
 */
const DEMO_SUBJECT_ID = "c-001";
const DEMO_SUBJECT = clients.find((c) => c.id === DEMO_SUBJECT_ID) ?? clients[0];

/** Share of ledger events that concern the demo member. */
const DEMO_SUBJECT_SHARE = 0.16;

function generate(count: number): LedgerPayload[] {
  const rand = seededRandom("apex-ledger-v1");
  const out: LedgerPayload[] = [];

  // Walk backwards from NOW so the newest event is seq = count.
  let cursor = NOW.getTime() - count * 4 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const shape = pickShape(rand());
    const actor = staff[Math.floor(rand() * staff.length)];

    // Bias a share of events onto the demo member.
    //
    // Without this the subject is uniform across ~500 clients, so any single
    // member's access log is empty or near-empty — which silently guts the
    // client portal's "who has seen my chart" page, the one surface where an
    // empty state is indistinguishable from the feature not working. A real
    // deployment needs no such bias; a 240-event demo does.
    const subject =
      rand() < DEMO_SUBJECT_SHARE
        ? DEMO_SUBJECT
        : clients[Math.floor(rand() * clients.length)];

    // Gaps are irregular — a uniform cadence reads as fake immediately.
    cursor += Math.floor(60_000 + rand() * 9 * 60_000);

    const needsSubject = shape.entity !== "session" && shape.entity !== "rule-set";
    const { before, after } = diffFor(shape, rand);

    const payload: LedgerPayload = {
      seq: i + 1,
      at: absolute(cursor).toISOString(),
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: shape.action,
      entity: shape.entity,
      entityId:
        shape.entity === "session"
          ? `ses-${actor.id}`
          : `${shape.entity.slice(0, 3)}-${subject.id.slice(-3)}-${(i % 7) + 1}`,
      ...(needsSubject ? { subjectId: subject.id, subjectName: clientName(subject) } : {}),
      ...(needsSubject ? { locationId: subject.locationId } : {}),
      ...(shape.action === "view"
        ? { reason: VIEW_REASONS[Math.floor(rand() * VIEW_REASONS.length)] }
        : {}),
      ...(shape.action === "break-glass"
        ? { reason: "Emergency access — patient in clinic, provider unavailable" }
        : {}),
      ...(shape.action === "deny"
        ? { reason: "Out-of-scope location — access blocked by scope engine" }
        : {}),
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    };

    out.push(payload);
  }

  return out;
}

/**
 * The canonical ledger — newest last, exactly like an append-only table.
 *
 * Mutable by design, but ONLY through `appendLedger`. Nothing else in the
 * codebase may push to it, splice it, or reorder it: the array's index order is
 * the chain's link order, and a stray `sort()` would break verification just as
 * surely as tampering would.
 */
export const ledger: LedgerRow[] = buildChain(generate(240));

/**
 * Newest-first view, recomputed on read.
 *
 * This used to be a frozen `[...ledger].reverse()` captured at module load,
 * which meant anything appended afterwards was invisible to every surface that
 * read it. A live chain needs a live view.
 */
export function ledgerNewestFirst(): LedgerRow[] {
  return [...ledger].reverse();
}

/**
 * What a domain function returns when something happened.
 *
 * `seq` and `at` are deliberately NOT the caller's to set. Sequence is assigned
 * centrally so it can never collide or skip, and letting a caller backdate an
 * event is the one thing an append-only log must refuse.
 */
export type LedgerDraft = Omit<LedgerPayload, "seq" | "at">;

/**
 * THE append point. Assigns `seq`, stamps `at`, links against the current tail,
 * hashes, and pushes.
 *
 * Returns the committed row so a caller can store its id — which is what makes
 * a reference from another record (a contact entry, an order event) resolve to
 * something real rather than being a fabricated join key.
 *
 * In production this is a Postgres insert inside the same transaction as the
 * mutation it records, so a write that cannot be recorded does not persist.
 * Here it is an array push, but the contract is identical: the row is committed
 * before the caller continues.
 */
export function appendLedger(draft: LedgerDraft, at: string = NOW_ISO): LedgerRow {
  const tail = ledger[ledger.length - 1];
  const prevHash = tail?.hash ?? GENESIS_HASH;
  const payload: LedgerPayload = { ...draft, seq: (tail?.seq ?? 0) + 1, at };
  const hash = hashRow(prevHash, payload);
  const row: LedgerRow = {
    ...payload,
    id: `led-${String(payload.seq).padStart(5, "0")}`,
    prevHash,
    hash,
  };
  ledger.push(row);
  return row;
}

/** Pinned clock so appends made during a demo session stay deterministic. */
const NOW_ISO = "2026-06-12T09:00:00";

/**
 * Produce a copy of the ledger with one row's contents silently altered —
 * exactly what a bad actor with database access would do.
 *
 * Powers the "Tamper with a record" demo control. The row still carries its
 * original hash, so `verifyChain` catches it on that row and every row after
 * it fails to link. This is the moment the whole traceability story lands.
 */
export function tamperedLedger(rows: LedgerRow[], index: number): LedgerRow[] {
  const copy = rows.map((r) => ({ ...r }));
  const target = copy[index];
  if (!target) return copy;
  copy[index] = {
    ...target,
    action: target.action === "approve" ? "decline" : "approve",
    after: { ...(target.after ?? {}), status: "Quietly rewritten" },
  };
  return copy;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Every event touching one patient, newest first. */
export function ledgerForSubject(subjectId: string): LedgerRow[] {
  return ledgerNewestFirst().filter((r) => r.subjectId === subjectId);
}

/** Read-only access events for one patient — powers the client portal. */
export function accessLogForSubject(subjectId: string): LedgerRow[] {
  return ledgerNewestFirst().filter(
    (r) => r.subjectId === subjectId && (r.action === "view" || r.action === "export" || r.action === "break-glass"),
  );
}

export function ledgerForActor(actorId: string): LedgerRow[] {
  return ledgerNewestFirst().filter((r) => r.actorId === actorId);
}

export interface LedgerStats {
  total: number;
  reads: number;
  writes: number;
  denials: number;
  breakGlass: number;
  actors: number;
}

export function ledgerStats(rows: LedgerRow[] = ledger): LedgerStats {
  const reads = rows.filter((r) => r.action === "view" || r.action === "export").length;
  const denials = rows.filter((r) => r.action === "deny").length;
  const breakGlass = rows.filter((r) => r.action === "break-glass").length;
  return {
    total: rows.length,
    reads,
    writes: rows.length - reads - denials - breakGlass,
    denials,
    breakGlass,
    actors: new Set(rows.map((r) => r.actorId)).size,
  };
}

export { staffName };
