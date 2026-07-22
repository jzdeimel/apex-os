import {
  analyzeLabReport,
  CHART_CONFIDENCE_FLOOR,
  type ExtractedMarker,
  type LabExtraction,
} from "@/lib/azure/documentIntelligence";
import { getLabsForClient } from "@/lib/mock/labs";
import { getClient, clientName } from "@/lib/mock/clients";
/**
 * THE ACTOR IS AN ARGUMENT, NOT A MODULE CONSTANT.
 *
 * This file used to stamp every ledger row with `VIEWER` — a hardcoded demo
 * account. A ledger row attributed to a constant is worse than no ledger row:
 * it is a false statement about who touched a clinical record, and it is
 * indistinguishable from a true one when read back. The whole point of the hash
 * chain is answering "who did this", and a fixed answer voids it.
 *
 * The module stays PURE — it takes the actor rather than resolving one, so it
 * remains testable without a request context and the caller (which has the
 * authenticated principal) cannot forget to supply it: the parameter is
 * required, so omitting it is a type error.
 */
export interface LabActor {
  id: string;
  name: string;
  role: string;
}
import { sha256, shortHash } from "@/lib/trace/hash";
import type { LedgerDraft } from "@/lib/trace/ledger";
import type { ProvenanceStamp } from "@/lib/consult/types";
import type { Biomarker, BiomarkerStatus } from "@/lib/types";

/**
 * LAB PDF INGESTION — extraction → canonical mapping → human confirmation.
 *
 * This module is the layer between `lib/azure/documentIntelligence.ts` (which
 * models what the extractor returns) and the chart (which is a clinical record).
 * It does three jobs, and the order matters:
 *
 *   1. MAP every extracted field onto the canonical Alpha Base Panel, so an
 *      imported "Total Testosterone" becomes the same `total_t` series the
 *      trend charts already plot — not a parallel marker with the same label.
 *   2. SURFACE everything it could not map. Loudly.
 *   3. GATE on confidence, so no unreviewed OCR read reaches the chart.
 *
 * WHAT IT DOES NOT DO
 *   It does not read the file. `analyzeLabReport` takes a file *name* and
 *   returns deterministic fixtures; nothing in this build parses a PDF, and the
 *   provenance stamp says so in `model`. The seam is real; the wire is not.
 *
 * WHY EVERY MARKER KEEPS page + boundingBox + sourceText
 *   An extracted lab value with no provenance is not safe to chart. A clinician
 *   looking at an imported testosterone of 210 ng/dL has exactly one question —
 *   "is that what the report actually says?" — and the only acceptable answer
 *   puts the number next to the place on the page it came from. That is what
 *   `components/labs/SourceViewer.tsx` renders, and it is what makes the import
 *   safe rather than merely fast.
 */

/**
 * Below this confidence, a marker is flagged NEEDS REVIEW and cannot be charted
 * until a human confirms it row by row.
 *
 * Single source of truth: the floor lives at the adapter boundary
 * (`CHART_CONFIDENCE_FLOOR`) and is re-exported here rather than redeclared,
 * because a threshold that exists in two files is a threshold that will
 * eventually exist at two values.
 *
 * WHY A GATE AT ALL. An OCR read is a *guess about pixels*, and a chart is a
 * *clinical fact* that a provider will later titrate against. Promoting the
 * first to the second with no human in between means a smudged decimal point —
 * 12.4 read as 124 — silently becomes the basis of a dose decision, with the
 * chart showing no sign that anything was ever uncertain. The asymmetry decides
 * it: an unnecessary confirmation costs a nurse thirty seconds; an unreviewed
 * mis-read costs a patient. Note also that the gate is necessary and not
 * sufficient — a *confidently wrong* read still exists, which is why even
 * high-confidence rows require a human click before they chart.
 */
export const REVIEW_REQUIRED_BELOW = CHART_CONFIDENCE_FLOOR;

/** US Letter, inches — the coordinate space Document Intelligence reports in. */
export const PAGE_WIDTH_IN = 8.5;
export const PAGE_HEIGHT_IN = 11;

/** Axis-aligned rect in inches on the page, derived from the extractor polygon. */
export interface IngestBoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IngestedMarker {
  /** Canonical panel key (`total_t`, `a1c`, …) — the join key to the chart. */
  key: string;
  /** Canonical display name, not the vendor's spelling. */
  name: string;
  value: number;
  unit: string;
  refLow: number;
  refHigh: number;
  optimalLow: number;
  optimalHigh: number;
  status: BiomarkerStatus;
  /** 0–1, straight from the extractor. Never rounded up for display. */
  confidence: number;
  page: number;
  boundingBox: IngestBoundingBox;
  /** Verbatim OCR text the value was parsed from, before coercion. */
  sourceText: string;

  /** The vendor's own label, kept so a mismapping is auditable after the fact. */
  extractedName: string;
  /** True when confidence fell below the floor. Blocks charting until confirmed. */
  needsReview: boolean;
  /** Set when the extractor's unit disagrees with the canonical panel's. */
  unitMismatch?: string;
}

export interface LabIngestResult {
  ok: boolean;
  /** Present iff `ok === false`. Rendered verbatim; never swallowed. */
  error?: string;

  fileName: string;
  clientId: string;
  panelName: string;
  collectedOn: string;
  pageCount: number;
  markers: IngestedMarker[];
  /**
   * Extracted text this build could not map onto the canonical panel.
   *
   * A lab value that goes silently missing from a chart is worse than one that
   * fails to import loudly. A loud failure gets re-keyed in a minute; a silent
   * drop looks exactly like "the patient never had that test" — the provider
   * reads an incomplete panel as a complete one and reasons from a gap they
   * cannot see. So nothing is ever discarded: if it does not map, it lands here
   * and the UI renders it.
   */
  unmatched: string[];
  provenance: ProvenanceStamp;
  /** Append this with `appendLedger` — the ingest itself is an auditable event. */
  ledgerDraft: LedgerDraft;
  /** Stable id for this ingest, derived from the inputs. Used as the entity id. */
  ingestId: string;
  /** Always true in this build. Mirrors the adapter contract. */
  demo: true;
}

const ENGINE = "apex-lab-ingest";
const ENGINE_VERSION = "1.0.0";

/**
 * Vendor label → canonical panel name.
 *
 * Quest, Labcorp and a hospital draw site spell the same analyte three ways.
 * Normalisation (below) handles case and punctuation; this table handles the
 * genuine reorderings and abbreviations. Anything not covered here does NOT get
 * fuzzy-matched — a wrong mapping is far more dangerous than an unmapped row,
 * because the wrong mapping is invisible and the unmapped row is on screen.
 */
const ALIASES: Record<string, string> = {
  testosteronetotal: "Total Testosterone",
  testosteronefree: "Free Testosterone",
  estradiol: "Estradiol (E2)",
  e2: "Estradiol (E2)",
  sexhormonebindingglobulin: "SHBG",
  hba1c: "Hemoglobin A1C",
  a1c: "Hemoglobin A1C",
  glucosefasting: "Fasting Glucose",
  insulinfasting: "Fasting Insulin",
  ldlc: "LDL Cholesterol",
  hdlc: "HDL Cholesterol",
  cholesterolldl: "LDL Cholesterol",
  cholesterolhdl: "HDL Cholesterol",
  apolipoproteinb: "ApoB",
  vitamind25hydroxy: "Vitamin D, 25-OH",
  "25ohvitamind": "Vitamin D, 25-OH",
  hscrp: "hs-CRP",
  crphighsensitivity: "hs-CRP",
  thyroidstimulatinghormone: "TSH",
  t3free: "Free T3",
  t4free: "Free T4",
  prostatespecificantigen: "PSA",
};

/** Pinned clock. Matches NOW in lib/trace/ledger.ts. */
const INGEST_AT = "2026-06-12T09:00:00";

/** Lowercase, strip everything that is not a letter or digit. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The optimal window, falling back to the reference window when the panel does
 * not define one.
 *
 * `optimalLow`/`optimalHigh` are optional on `Biomarker`. Falling back to the
 * reference range is the only defensible default: it says "in range, and we
 * make no narrower claim", where inventing a tighter window would put a `watch`
 * colour on a number no clinician ever flagged.
 */
function optimalWindow(b: Biomarker): [number, number] {
  return [b.optimalLow ?? b.refLow, b.optimalHigh ?? b.refHigh];
}

/** Same banding rule the canonical panel uses — derived, never invented. */
function statusFor(value: number, b: Biomarker): BiomarkerStatus {
  if (value < b.refLow) return "low";
  if (value > b.refHigh) return "high";
  const [lo, hi] = optimalWindow(b);
  if (value >= lo && value <= hi) return "optimal";
  return "watch";
}

/** Polygon (clockwise from top-left, inches) → axis-aligned rect. */
function toRect(polygon: Array<{ x: number; y: number }>): IngestBoundingBox {
  if (!polygon.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * The canonical panel to map onto.
 *
 * Read from the client's own resulted panel rather than from a global list, so
 * sex-specific reference windows come along for free — mapping a female
 * client's estradiol against a male reference range would produce a correctly
 * transcribed number with a wrong colour on it, which is its own kind of lie.
 */
function canonicalPanel(clientId: string): Biomarker[] | undefined {
  return getLabsForClient(clientId)?.biomarkers;
}

function indexPanel(panel: Biomarker[]): Map<string, Biomarker> {
  const idx = new Map<string, Biomarker>();
  for (const b of panel) {
    idx.set(normalize(b.name), b);
    idx.set(normalize(b.key), b);
  }
  return idx;
}

function mapOne(m: ExtractedMarker, idx: Map<string, Biomarker>): Biomarker | undefined {
  const direct = idx.get(normalize(m.name));
  if (direct) return direct;
  const aliased = ALIASES[normalize(m.name)];
  return aliased ? idx.get(normalize(aliased)) : undefined;
}

/**
 * Ingest one lab report for one client.
 *
 * Pure and deterministic: same file name + client id always yields the same
 * result, which is what makes the review screen screenshot-stable and the
 * provenance hash meaningful.
 */
export function ingestLabReport(
  fileName: string,
  clientId: string,
  actor: LabActor,
): LabIngestResult {
  const ingestId = `labdoc-${shortHash(sha256(`${fileName}|${clientId}`))}`;
  const client = getClient(clientId);

  const base = {
    fileName,
    clientId,
    ingestId,
    demo: true as const,
  };

  const emptyProvenance = (inputHash: string): ProvenanceStamp => ({
    engine: ENGINE,
    engineVersion: ENGINE_VERSION,
    inputHash,
    computedAt: INGEST_AT,
    computedBy: "system",
    model: "azure-document-intelligence (DEMO FIXTURE — no document was read)",
  });

  const failDraft = (reason: string): LedgerDraft => ({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: "decline",
    entity: "lab",
    entityId: ingestId,
    ...(client ? { subjectId: client.id, subjectName: clientName(client), locationId: client.locationId } : {}),
    reason,
    after: { status: "Ingest rejected", fileName },
  });

  const analysis = analyzeLabReport(fileName);
  if (!analysis.ok || !analysis.value) {
    // The adapter's own rejection (unsupported type, empty name) is surfaced
    // verbatim rather than replaced with a generic message — a user who dropped
    // a .docx needs to be told that, not "import failed".
    const error = analysis.error ?? "Document analysis failed.";
    return {
      ...base,
      ok: false,
      error,
      panelName: "—",
      collectedOn: "",
      pageCount: 0,
      markers: [],
      unmatched: [],
      provenance: emptyProvenance(sha256(fileName)),
      ledgerDraft: failDraft(error),
    };
  }

  const extraction: LabExtraction = analysis.value;
  const panel = canonicalPanel(clientId);
  if (!panel) {
    const error =
      `No canonical panel on file for ${client ? clientName(client) : clientId}. ` +
      `Extraction succeeded but there is nothing to map onto — resolve the chart first rather than charting an unmapped panel.`;
    return {
      ...base,
      ok: false,
      error,
      panelName: extraction.panelName,
      collectedOn: extraction.collectedOn,
      pageCount: extraction.pageCount,
      markers: [],
      // Every extracted field is reported, even in the failure path. Failing to
      // map is not a licence to stop showing what was found.
      unmatched: extraction.markers.map(describeUnmatched),
      provenance: emptyProvenance(sha256(`${fileName}|${clientId}`)),
      ledgerDraft: failDraft(error),
    };
  }

  const idx = indexPanel(panel);
  const markers: IngestedMarker[] = [];
  const unmatched: string[] = [];

  for (const m of extraction.markers) {
    const canonical = mapOne(m, idx);
    if (!canonical) {
      unmatched.push(describeUnmatched(m));
      continue;
    }

    const rect = toRect(m.boundingBox.polygon);
    const unitMismatch =
      normalize(m.unit) === normalize(canonical.unit)
        ? undefined
        : `Report reads "${m.unit}"; panel expects "${canonical.unit}". Value charted as-is — verify before use.`;

    markers.push({
      key: canonical.key,
      name: canonical.name,
      value: m.value,
      // The canonical unit is what the chart axis is labelled with; the vendor's
      // string survives in `unitMismatch` so a disagreement is visible instead
      // of being silently harmonised away.
      unit: canonical.unit,
      refLow: canonical.refLow,
      refHigh: canonical.refHigh,
      optimalLow: optimalWindow(canonical)[0],
      optimalHigh: optimalWindow(canonical)[1],
      status: statusFor(m.value, canonical),
      confidence: m.confidence,
      page: m.page,
      boundingBox: rect,
      sourceText: m.rawText,
      extractedName: m.name,
      needsReview: m.confidence < REVIEW_REQUIRED_BELOW,
      ...(unitMismatch ? { unitMismatch } : {}),
    });
  }

  const provenance: ProvenanceStamp = {
    engine: ENGINE,
    engineVersion: ENGINE_VERSION,
    // Hashes the extraction, not the file — this build never sees the file, and
    // a stamp that implied otherwise would be the exact dishonesty the adapter
    // layer exists to prevent.
    inputHash: sha256(`${fileName}|${clientId}|${extraction.modelId}|${extraction.markers.length}`),
    computedAt: INGEST_AT,
    computedBy: "system",
    model: extraction.modelId,
  };

  const ledgerDraft: LedgerDraft = {
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: "create",
    entity: "lab",
    entityId: ingestId,
    ...(client ? { subjectId: client.id, subjectName: clientName(client), locationId: client.locationId } : {}),
    after: {
      status: "Extracted — awaiting human confirmation",
      fileName,
      panel: extraction.panelName,
      mapped: markers.length,
      unmapped: unmatched.length,
      needsReview: markers.filter((m) => m.needsReview).length,
      model: extraction.modelId,
    },
  };

  return {
    ...base,
    ok: true,
    panelName: extraction.panelName,
    collectedOn: extraction.collectedOn,
    pageCount: extraction.pageCount,
    markers,
    unmatched,
    provenance,
    ledgerDraft,
  };
}

/**
 * Human-readable rendering of a field that did not map.
 *
 * Carries the page and the raw text, because the whole point of showing it is
 * that somebody can go find it on the report and key it in.
 */
function describeUnmatched(m: ExtractedMarker): string {
  return `${m.name} — "${m.rawText}" (p.${m.page}, ${Math.round(m.confidence * 100)}% confidence)`;
}

/** Markers a human has not yet confirmed cannot be charted. Convenience read. */
export function chartable(result: LabIngestResult, confirmed: ReadonlySet<string>): IngestedMarker[] {
  return result.markers.filter((m) => confirmed.has(m.key));
}

/** Rows the reviewer must look at individually before they can be charted. */
export function reviewQueue(result: LabIngestResult): IngestedMarker[] {
  return result.markers.filter((m) => m.needsReview);
}

/**
 * The ledger row written when a human commits confirmed results to the chart.
 *
 * Records exactly which markers were charted and how many were left behind —
 * "we imported 17 of 20" is the fact an auditor needs, and it is unrecoverable
 * later if only the successes are logged.
 */
export function chartCommitDraft(
  result: LabIngestResult,
  confirmed: ReadonlySet<string>,
  actor: LabActor,
): LedgerDraft {
  const client = getClient(result.clientId);
  const charted = chartable(result, confirmed);
  return {
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: "update",
    entity: "lab",
    entityId: result.ingestId,
    ...(client
      ? { subjectId: client.id, subjectName: clientName(client), locationId: client.locationId }
      : {}),
    reason: `Human-confirmed import of ${result.fileName}`,
    before: { status: "Extracted — awaiting human confirmation", charted: 0 },
    after: {
      status: "Charted",
      panel: result.panelName,
      collectedOn: result.collectedOn,
      charted: charted.length,
      extracted: result.markers.length,
      withheld: result.markers.length - charted.length,
      unmapped: result.unmatched.length,
      confirmedBelowFloor: charted.filter((m) => m.needsReview).length,
      markers: charted.map((m) => `${m.key}=${m.value}${m.unit}`),
    },
  };
}

/** Percentage string for display. Truncates rather than rounds up — see header. */
export function confidencePct(confidence: number): string {
  return `${Math.floor(confidence * 100)}%`;
}
