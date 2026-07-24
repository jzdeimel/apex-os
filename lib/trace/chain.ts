import { canonicalJson, sha256 } from "@/lib/trace/hash";
import type { LocationId } from "@/lib/types";

/**
 * Pure audit-chain contract used by authoritative persistence.
 *
 * This file must remain free of demo records, clocks, and module-level state.
 * The visual demo ledger lives in `lib/trace/ledger.ts`; PostgreSQL repositories
 * import this module so loading a real API never initializes fixture patients
 * or staff.
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
  | "inventory-lot"
  | "inventory-movement"
  | "inventory-recall"
  | "dispense"
  | "order"
  | "consent"
  | "lead"
  | "lead-note"
  | "lead-task"
  | "operational-case"
  | "document"
  | "session"
  | "message"
  | "appointment"
  | "clinic-resource"
  | "resource-reservation"
  | "calendar"
  | "rule-set"
  | "community"
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
  subjectId?: string;
  subjectName?: string;
  locationId?: LocationId;
  reason?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface LedgerRow extends LedgerPayload {
  id: string;
  prevHash: string;
  hash: string;
}

export type LedgerDraft = Omit<LedgerPayload, "seq" | "at">;

export const GENESIS_HASH = "0".repeat(64);

export function normalizeLedgerPayload(
  payload: LedgerPayload,
): Record<string, unknown> {
  const rawAt: unknown = payload.at;
  const at =
    rawAt instanceof Date
      ? rawAt.toISOString()
      : typeof rawAt === "string"
        ? rawAt
        : String(rawAt);

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

export function buildChain(payloads: LedgerPayload[]): LedgerRow[] {
  const rows: LedgerRow[] = [];
  let prev = GENESIS_HASH;
  for (const payload of payloads) {
    const hash = hashRow(prev, payload);
    rows.push({
      ...payload,
      id: `led-${String(payload.seq).padStart(5, "0")}`,
      prevHash: prev,
      hash,
    });
    prev = hash;
  }
  return rows;
}

export interface ChainVerdict {
  ok: boolean;
  checked: number;
  brokenAt?: string;
  failure?: "hash-mismatch" | "link-mismatch";
}

export function verifyChain(rows: LedgerRow[]): ChainVerdict {
  let prev = GENESIS_HASH;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.prevHash !== prev) {
      return {
        ok: false,
        checked: index + 1,
        brokenAt: row.id,
        failure: "link-mismatch",
      };
    }
    const { id: _id, prevHash: _prevHash, hash, ...payload } = row;
    if (hashRow(prev, payload as LedgerPayload) !== hash) {
      return {
        ok: false,
        checked: index + 1,
        brokenAt: row.id,
        failure: "hash-mismatch",
      };
    }
    prev = hash;
  }
  return { ok: true, checked: rows.length };
}
