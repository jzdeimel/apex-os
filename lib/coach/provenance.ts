import { formatDate } from "@/lib/utils";

/**
 * Source references — the unit of traceability for every coach surface.
 *
 * ── Why a shared type rather than a string on each feature ────────────────
 * The product thesis is "everything visible, everything traceable". In practice
 * that dies one convenience at a time: a brief renders `"they said they'd
 * reorder"` as a plain string because the record id was two function calls away,
 * and six months later nobody can tell whether a coach read that off a consult
 * or the engine inferred it. Making provenance a REQUIRED FIELD on every claim
 * — not an optional decoration — is the only version of this that survives
 * contact with a deadline.
 *
 * So the rule enforced by the types in this file: a coach-facing assertion
 * carries a `SourceRef`, or it carries `NO_SOURCE` and says out loud that there
 * is nothing on record. There is deliberately no third option, and no way to
 * spell "trust me".
 *
 * ── Why `quote` is verbatim and never rewritten ───────────────────────────
 * `ExtractedItem.sourceQuote` (lib/consult/types.ts) already holds the exact
 * substring of the coach's own typing that produced a finding. Paraphrasing it
 * on the way to a chip would defeat the entire mechanism: the reason the chip
 * is convincing is that the coach recognises their own words in it. Where a
 * quote exists it is passed through untouched, including its lowercase
 * mid-sentence shorthand.
 */

/**
 * The kinds of record a coach claim can be traced back to.
 *
 * Deliberately named after the SOURCE, not the topic. "lab" means "a LabResult
 * row said this", not "this is about labs" — a distinction that matters the
 * moment somebody wants to click the chip and land on the actual record.
 */
export type SourceKind =
  | "consult"
  | "journal"
  | "lab"
  | "scan"
  | "order"
  | "subscription"
  | "escalation"
  | "appointment"
  | "contact"
  | "protocol"
  | "ledger"
  /** No record produced this. Reserved for NO_SOURCE — never invent one. */
  | "none";

export interface SourceRef {
  kind: SourceKind;
  /**
   * The record's own id, exactly as stored. This is what makes a chip
   * inspectable rather than decorative — an auditor can go and find the row.
   */
  recordId: string;
  /** Chip face. Short enough to sit inline: "Consult · May 22". */
  label: string;
  /**
   * Verbatim text from the record, when the record has text. Never a summary
   * of it, never reflowed, never sentence-cased.
   */
  quote?: string;
  /** When the source record happened, for chips that need to show recency. */
  at?: string;
  /**
   * Deep link, when one genuinely exists. Left undefined rather than pointed at
   * a page that merely mentions the record — lib/changes/since.ts makes the
   * same call for the same reason: a link that does not land where it says is
   * worse than no link.
   */
  href?: string;
}

/**
 * The absence of evidence, made explicit and typed.
 *
 * This exists so "we have nothing on this" is a value the UI can render with
 * the same machinery as a real citation, rather than a null that each call site
 * has to remember to handle. A brief that silently omits an unverifiable claim
 * is indistinguishable from a brief that never considered it.
 */
export const NO_SOURCE: SourceRef = {
  kind: "none",
  recordId: "",
  label: "Nothing on record",
};

export function isSourced(ref: SourceRef): boolean {
  return ref.kind !== "none";
}

// ---------------------------------------------------------------------------
// Constructors — one per record type, so labels stay consistent everywhere
// ---------------------------------------------------------------------------

/**
 * Labels are built here rather than at each call site on purpose. The same
 * consult cited from the prep brief and from the change card must read
 * identically, or a coach comparing two panels will reasonably assume they are
 * looking at two different records.
 */

export function consultSource(
  consultId: string,
  at: string,
  kind: string,
  quote?: string,
): SourceRef {
  return {
    kind: "consult",
    recordId: consultId,
    label: `${kind} · ${formatDate(at)}`,
    quote,
    at,
  };
}

export function journalSource(entryId: string, date: string, note?: string): SourceRef {
  return {
    kind: "journal",
    recordId: entryId,
    // Journal entries are a DAY, not an instant (see lib/symptoms/journal.ts),
    // so the label anchors to midday to keep the printed day equal to the
    // stored day in every timezone the clinic runs in.
    label: `Journal · ${formatDate(`${date}T12:00:00`)}`,
    quote: note,
    at: `${date}T12:00:00`,
  };
}

export function labSource(labId: string, panelName: string, resultedOn: string): SourceRef {
  return {
    kind: "lab",
    recordId: labId,
    label: `${panelName} · ${formatDate(resultedOn)}`,
    at: resultedOn,
  };
}

export function scanSource(scanId: string, scannedOn: string, device?: string): SourceRef {
  return {
    kind: "scan",
    recordId: scanId,
    label: `Body scan · ${formatDate(scannedOn)}`,
    quote: device,
    at: scannedOn,
  };
}

export function orderSource(orderId: string, status: string, at: string): SourceRef {
  return {
    kind: "order",
    recordId: orderId,
    label: `Order ${orderId} · ${status}`,
    at,
  };
}

export function subscriptionSource(
  subscriptionId: string,
  itemName: string,
  nextRefillOn: string,
): SourceRef {
  return {
    kind: "subscription",
    recordId: subscriptionId,
    label: `Refill · ${itemName}`,
    at: `${nextRefillOn}T12:00:00`,
  };
}

export function escalationSource(
  escalationId: string,
  kind: string,
  raisedAt: string,
  question?: string,
): SourceRef {
  return {
    kind: "escalation",
    recordId: escalationId,
    label: `Escalation · ${kind}`,
    quote: question,
    at: raisedAt,
  };
}

export function appointmentSource(
  appointmentId: string,
  type: string,
  start: string,
  status?: string,
): SourceRef {
  return {
    kind: "appointment",
    recordId: appointmentId,
    label: `${type} · ${formatDate(start)}${status ? ` · ${status}` : ""}`,
    at: start,
  };
}

export function contactSource(
  entryId: string,
  channel: string,
  at: string,
  body?: string,
): SourceRef {
  return {
    kind: "contact",
    recordId: entryId,
    label: `${channel} · ${formatDate(at)}`,
    quote: body,
    at,
  };
}

/**
 * A ledger row as a citation.
 *
 * The strongest chip in the system: the row is hash-chained, so "this is what
 * the record said" is verifiable rather than asserted. Used wherever a claim
 * rests on an event (a protocol change, an approval) rather than on the current
 * shape of an entity.
 */
export function ledgerSource(rowId: string, action: string, entity: string, at: string): SourceRef {
  return {
    kind: "ledger",
    recordId: rowId,
    label: `Ledger · ${action} ${entity}`,
    at,
  };
}
