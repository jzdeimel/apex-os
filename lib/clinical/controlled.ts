import { prescriptions, type Prescription } from "@/lib/dosing/prescriptions";
import { clients, getClient, clientName } from "@/lib/mock/clients";
import { inventory } from "@/lib/mock/inventory";
import { staff } from "@/lib/mock/staff";
import { credentialFor, CREDENTIAL_NOW } from "@/lib/mock/credentials";
import { seededRandom, absolute } from "@/lib/utils";
import type { LocationId } from "@/lib/types";

/**
 * Controlled-substance compliance — the part a testosterone clinic legally
 * cannot run on MindBody, GoHighLevel and a spreadsheet.
 *
 * WHAT THIS ENFORCES, AND WHY IT MATTERS
 * --------------------------------------
 * Testosterone is a Schedule III controlled substance. That pulls in a specific
 * set of obligations that a general booking tool has no concept of:
 *   - a PDMP (prescription drug monitoring program) check before dispensing,
 *   - a hard cap on authorised refills,
 *   - a prescriber with a current DEA registration and an unexpired licence,
 *   - lot traceability, so that if a lot is recalled you can name every patient
 *     who received it within minutes.
 *
 * This module is the model behind all of that. It classifies each prescription's
 * schedule, reconstructs the dispense history against real inventory lots, and
 * answers the one question the dispensing screen must ask every single time:
 * *may this be handed over right now, and if not, why not.*
 *
 * HONESTY ABOUT THE DATA
 * ----------------------
 * The dispense and PDMP-check records are seeded DETERMINISTICALLY from the
 * prescriptions and the real inventory lots — same pinned clock, same
 * seededRandom discipline as the rest of the demo, so a lot recall joins to
 * actual lot numbers a user can see in inventory. In production these are rows
 * in the dispense / pdmp_check tables (lib/db/schema.ts already defines them,
 * with dispense.lotNumber keyed to inventory precisely so this join is real).
 * The SHAPE is production-correct; the storage is seeded.
 */

/* -------------------------------------------------------------------------- */
/* Schedule classification                                                     */
/* -------------------------------------------------------------------------- */

export type Schedule = "II" | "III" | "IV" | "V";

/**
 * DEA schedule by compound. Deliberately conservative: only what is genuinely
 * scheduled is marked. Testosterone and its esters are Schedule III. Peptides,
 * GLP-1 agonists (semaglutide, tirzepatide) and the rest of this catalogue are
 * NOT controlled substances, and marking them so would be a compliance theatre
 * that cries wolf on the things that actually matter.
 */
export function scheduleFor(rx: Prescription): Schedule | null {
  if (/testosterone/i.test(rx.name) || rx.libraryKey === "testosterone-cypionate") return "III";
  return null;
}

export function isControlled(rx: Prescription): boolean {
  return scheduleFor(rx) !== null;
}

export const controlledPrescriptions: Prescription[] = prescriptions.filter(isControlled);

/* -------------------------------------------------------------------------- */
/* Dispense history (seeded against real lots)                                 */
/* -------------------------------------------------------------------------- */

export interface DispenseRecord {
  id: string;
  rxId: string;
  clientId: string;
  sku: string;
  lotNumber: string;
  quantity: number;
  unit: string;
  dispensedBy: string; // staff id
  dispensedAt: string; // ISO
  locationId: LocationId;
}

const NOW_MS = absolute(CREDENTIAL_NOW).getTime();

/** The inventory lots that could have supplied a SKU at a location. */
function lotsFor(sku: string, locationId: LocationId): { lotNumber: string; unit: string }[] {
  return inventory
    .filter((i) => i.sku === sku && i.locationId === locationId)
    .map((i) => ({ lotNumber: i.lotNumber, unit: i.unit }));
}

/**
 * Reconstruct the dispense history for a controlled prescription.
 *
 * One dispense at the signing, then one per elapsed refill interval up to now,
 * each drawn from a real lot at the client's location. Deterministic per rx.
 */
function buildDispenses(rx: Prescription): DispenseRecord[] {
  const client = getClient(rx.clientId);
  if (!client) return [];
  const lots = lotsFor(rx.sku, client.locationId);
  // Fall back to any lot of the SKU if the exact location has none seeded.
  const anyLots = lots.length ? lots : inventory.filter((i) => i.sku === rx.sku).map((i) => ({ lotNumber: i.lotNumber, unit: i.unit }));
  if (anyLots.length === 0) return [];

  const rand = seededRandom(rx.id + "disp");
  const signedMs = absolute(rx.signedAt).getTime();
  // Testosterone cypionate is typically dispensed monthly.
  const intervalMs = 30 * 86_400_000;
  const elapsed = Math.max(0, Math.floor((NOW_MS - signedMs) / intervalMs));
  const fills = Math.min(elapsed + 1, 6);

  const out: DispenseRecord[] = [];
  for (let i = 0; i < fills; i++) {
    const lot = anyLots[Math.floor(rand() * anyLots.length)];
    const at = absolute(signedMs + i * intervalMs).toISOString();
    if (absolute(at).getTime() > NOW_MS) break;
    out.push({
      id: `disp-${rx.id}-${i + 1}`,
      rxId: rx.id,
      clientId: rx.clientId,
      sku: rx.sku,
      lotNumber: lot.lotNumber,
      quantity: 1,
      unit: lot.unit,
      dispensedBy: rx.signedByStaffId,
      dispensedAt: at,
      locationId: client.locationId,
    });
  }
  return out;
}

export const dispenses: DispenseRecord[] = controlledPrescriptions.flatMap(buildDispenses);

export function dispensesForClient(clientId: string): DispenseRecord[] {
  return dispenses.filter((d) => d.clientId === clientId);
}

/* -------------------------------------------------------------------------- */
/* PDMP checks + refill cap                                                     */
/* -------------------------------------------------------------------------- */

/** Refills authorised on a controlled script before a new visit is required. */
export const REFILLS_AUTHORISED = 3;
/** A PDMP check older than this is stale and must be repeated before dispense. */
export const PDMP_VALID_DAYS = 90;
/** Licence/DEA expiring within this window is flagged, not just when lapsed. */
export const CREDENTIAL_WARN_DAYS = 45;

export interface PdmpCheck {
  rxId: string;
  clientId: string;
  checkedAt: string | null; // null = never checked
  checkedBy: string | null;
}

/**
 * PDMP check state per controlled rx. Deterministic, and deliberately NOT always
 * present — roughly a quarter have no check on file, because a compliance board
 * that shows every box already ticked is a stage set, not a control. The ones
 * with no check are the gate the dispense screen is supposed to catch.
 */
export const pdmpChecks: PdmpCheck[] = controlledPrescriptions.map((rx) => {
  const rand = seededRandom(rx.id + "pdmp");
  const roll = rand();
  if (roll < 0.25) {
    return { rxId: rx.id, clientId: rx.clientId, checkedAt: null, checkedBy: null };
  }
  // Checked somewhere between "current" and "stale" so both states appear.
  const daysAgo = Math.floor(rand() * 130);
  const checkedAt = absolute(NOW_MS - daysAgo * 86_400_000).toISOString();
  return { rxId: rx.id, clientId: rx.clientId, checkedAt, checkedBy: rx.signedByStaffId };
});

const pdmpByRx = Object.fromEntries(pdmpChecks.map((p) => [p.rxId, p]));

export function pdmpFor(rxId: string): PdmpCheck | undefined {
  return pdmpByRx[rxId];
}

/* -------------------------------------------------------------------------- */
/* The dispense gate — the enforcement point                                   */
/* -------------------------------------------------------------------------- */

export type BlockerKind = "pdmp-missing" | "pdmp-stale" | "refills-exhausted" | "licence-expired" | "dea-expired";

export interface Blocker {
  kind: BlockerKind;
  label: string;
  detail: string;
}

export interface DispenseGate {
  rxId: string;
  clientId: string;
  schedule: Schedule;
  canDispense: boolean;
  blockers: Blocker[];
  fillsUsed: number;
  refillsAuthorised: number;
  lastDispensedAt: string | null;
  pdmp: PdmpCheck | undefined;
}

function daysBetween(aIso: string, bMs: number): number {
  return Math.floor((bMs - absolute(aIso).getTime()) / 86_400_000);
}

/**
 * May this controlled prescription be dispensed right now — and if not, exactly
 * why. This is the function the dispensing screen calls, and the reason the
 * clinic can prove it checked: every blocker is a specific, nameable failure.
 */
export function dispenseGate(rx: Prescription): DispenseGate | null {
  const schedule = scheduleFor(rx);
  if (!schedule) return null;

  const blockers: Blocker[] = [];
  const pdmp = pdmpFor(rx.id);
  const rxDispenses = dispenses.filter((d) => d.rxId === rx.id);
  const fillsUsed = rxDispenses.length;
  const lastDispensedAt = rxDispenses.length ? rxDispenses[rxDispenses.length - 1].dispensedAt : null;

  // 1. PDMP check present and current.
  if (!pdmp || !pdmp.checkedAt) {
    blockers.push({
      kind: "pdmp-missing",
      label: "PDMP check required",
      detail: "No prescription-drug-monitoring check is on file for this controlled script. One must be run and recorded before it can be dispensed.",
    });
  } else if (daysBetween(pdmp.checkedAt, NOW_MS) > PDMP_VALID_DAYS) {
    blockers.push({
      kind: "pdmp-stale",
      label: "PDMP check is stale",
      detail: `The PDMP check on file is more than ${PDMP_VALID_DAYS} days old. It must be repeated before dispensing.`,
    });
  }

  // 2. Refill cap. A dispense beyond the authorised count needs a new visit.
  if (fillsUsed >= REFILLS_AUTHORISED + 1) {
    blockers.push({
      kind: "refills-exhausted",
      label: "Refill cap reached",
      detail: `This script authorised ${REFILLS_AUTHORISED} refills and they are used. A new provider visit is required to continue therapy.`,
    });
  }

  // 3. Prescriber credentials current.
  const cred = credentialFor(rx.signedByStaffId);
  if (cred) {
    if (daysBetween(cred.licenseExpires, NOW_MS) > 0) {
      blockers.push({
        kind: "licence-expired",
        label: "Prescriber licence expired",
        detail: `The signing prescriber's ${cred.licenseState} licence expired ${cred.licenseExpires}. It cannot back a controlled dispense.`,
      });
    }
    if (daysBetween(cred.deaExpires, NOW_MS) > 0) {
      blockers.push({
        kind: "dea-expired",
        label: "Prescriber DEA expired",
        detail: `The signing prescriber's DEA registration expired ${cred.deaExpires}.`,
      });
    }
  }

  return {
    rxId: rx.id,
    clientId: rx.clientId,
    schedule,
    canDispense: blockers.length === 0,
    blockers,
    fillsUsed,
    refillsAuthorised: REFILLS_AUTHORISED,
    lastDispensedAt,
    pdmp,
  };
}

export const dispenseGates: DispenseGate[] = controlledPrescriptions
  .map(dispenseGate)
  .filter(Boolean) as DispenseGate[];

/* -------------------------------------------------------------------------- */
/* Lot recall                                                                   */
/* -------------------------------------------------------------------------- */

export interface RecallHit {
  clientId: string;
  clientName: string;
  locationId: LocationId;
  dispensedAt: string;
  dispensedBy: string;
  quantity: number;
  unit: string;
}

export interface RecallResult {
  lotNumber: string;
  sku: string | null;
  productName: string | null;
  hits: RecallHit[];
  outreachDraft: string;
}

/** Every lot number that has been dispensed, for the recall picker. */
export function dispensedLots(): { lotNumber: string; sku: string; productName: string; count: number }[] {
  const map = new Map<string, { sku: string; productName: string; count: number }>();
  for (const d of dispenses) {
    const inv = inventory.find((i) => i.lotNumber === d.lotNumber);
    const cur = map.get(d.lotNumber) ?? { sku: d.sku, productName: inv?.name ?? d.sku, count: 0 };
    cur.count += 1;
    map.set(d.lotNumber, cur);
  }
  return [...map.entries()].map(([lotNumber, v]) => ({ lotNumber, ...v })).sort((a, b) => b.count - a.count);
}

/**
 * The recall answer: given a lot, every patient who received it.
 *
 * This is the query MindBody cannot run because it never held the join. Here the
 * dispense record carries the lot number in the same vocabulary as inventory, so
 * the join is exact and the outreach list is drafted, not assembled by hand
 * under time pressure with a recall notice on the desk.
 */
export function recallForLot(lotNumber: string): RecallResult {
  const inv = inventory.find((i) => i.lotNumber === lotNumber);
  const lotDispenses = dispenses.filter((d) => d.lotNumber === lotNumber);
  const hits: RecallHit[] = lotDispenses.map((d) => {
    const c = getClient(d.clientId);
    return {
      clientId: d.clientId,
      clientName: c ? clientName(c) : d.clientId,
      locationId: d.locationId,
      dispensedAt: d.dispensedAt,
      dispensedBy: staff.find((s) => s.id === d.dispensedBy)?.name ?? d.dispensedBy,
      quantity: d.quantity,
      unit: d.unit,
    };
  });
  // Unique patients (a patient may have had the lot more than once).
  const uniqueClients = new Set(hits.map((h) => h.clientId));

  const product = inv?.name ?? null;
  const outreachDraft =
    hits.length === 0
      ? `No patients received lot ${lotNumber}. Nothing to send.`
      : `Subject: Important safety notice about your medication\n\n` +
        `Our records show you received ${product ?? "a medication"} from lot ${lotNumber}. ` +
        `This lot is affected by a recall. Please stop using any product from this lot and contact the clinic ` +
        `so we can arrange a replacement and answer any questions. This is a precaution; your care team is reaching ` +
        `out to every patient who received this lot.\n\n— Alpha Health`;

  return {
    lotNumber,
    sku: inv?.sku ?? (lotDispenses[0]?.sku ?? null),
    productName: product,
    hits,
    outreachDraft: `${outreachDraft}${hits.length ? `\n\n(${uniqueClients.size} patient${uniqueClients.size === 1 ? "" : "s"}, ${hits.length} dispense${hits.length === 1 ? "" : "s"}.)` : ""}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Board summary                                                                */
/* -------------------------------------------------------------------------- */

export interface ControlledSummary {
  controlledCount: number;
  blockedCount: number;
  pdmpMissing: number;
  refillCapReached: number;
  credentialIssues: { staffId: string; name: string; issue: string; date: string }[];
}

export function controlledSummary(): ControlledSummary {
  const pdmpMissing = dispenseGates.filter((g) => g.blockers.some((b) => b.kind === "pdmp-missing" || b.kind === "pdmp-stale")).length;
  const refillCapReached = dispenseGates.filter((g) => g.blockers.some((b) => b.kind === "refills-exhausted")).length;
  const blockedCount = dispenseGates.filter((g) => !g.canDispense).length;

  const credentialIssues: ControlledSummary["credentialIssues"] = [];
  const seen = new Set<string>();
  for (const s of staff) {
    const cred = credentialFor(s.id);
    if (!cred || seen.has(s.id)) continue;
    const licDays = -daysBetween(cred.licenseExpires, NOW_MS); // days until expiry
    const deaDays = -daysBetween(cred.deaExpires, NOW_MS);
    if (licDays <= 0) credentialIssues.push({ staffId: s.id, name: s.name, issue: `${cred.licenseState} licence expired`, date: cred.licenseExpires });
    else if (licDays <= CREDENTIAL_WARN_DAYS) credentialIssues.push({ staffId: s.id, name: s.name, issue: `${cred.licenseState} licence expires in ${licDays}d`, date: cred.licenseExpires });
    if (deaDays <= 0) credentialIssues.push({ staffId: s.id, name: s.name, issue: `DEA expired`, date: cred.deaExpires });
    else if (deaDays <= CREDENTIAL_WARN_DAYS) credentialIssues.push({ staffId: s.id, name: s.name, issue: `DEA expires in ${deaDays}d`, date: cred.deaExpires });
    seen.add(s.id);
  }

  return {
    controlledCount: controlledPrescriptions.length,
    blockedCount,
    pdmpMissing,
    refillCapReached,
    credentialIssues,
  };
}
