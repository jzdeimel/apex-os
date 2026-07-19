import { seededRandom, clamp } from "@/lib/utils";
import { adapterFail, adapterOk, type AdapterResult } from "@/lib/azure/types";

/**
 * AZURE AI DOCUMENT INTELLIGENCE — lab PDF extraction.
 *
 * WHAT THE REAL SERVICE DOES
 *   Analyzes a document and returns structured fields with, for each one, a
 *   confidence score and a `boundingRegions` array giving the page number and a
 *   polygon in inches on that page. Prebuilt models cover common forms
 *   (prebuilt-healthInsuranceCard, prebuilt-layout); a custom model trained on a
 *   specific lab vendor's report layout is what Alpha Health would actually use,
 *   because Quest, Labcorp and a local draw site produce three different PDFs.
 *
 * WHAT THIS FILE DOES INSTEAD
 *   Returns deterministic fixture markers in the same response shape — every
 *   field carries page, boundingBox and confidence. No file is read, uploaded or
 *   stored; `analyzeLabReport` takes a file *name* only, and derives its output
 *   from a seeded PRNG over that name. Two different real PDFs with the same
 *   name return identical results, which is exactly the kind of thing that is
 *   fine in a demo and catastrophic in production.
 *
 * WHAT WOULD HAVE TO CHANGE TO MAKE IT REAL
 *   1. Train a custom extraction model per lab vendor layout (~5 labelled PDFs
 *      each) in Document Intelligence Studio.
 *   2. Upload the PDF to Blob Storage, then call `beginAnalyzeDocument` with the
 *      model id and poll the operation.
 *   3. Map `analyzeResult.documents[0].fields` onto `ExtractedMarker`, carrying
 *      `boundingRegions[0].pageNumber` and `.polygon` through unchanged.
 *   4. Keep the `CHART_CONFIDENCE_FLOOR` gate below, and keep it server-side.
 *
 * WHAT THIS REPLACES
 *   The current lab-upload flow is a five-step animation that parses nothing.
 *   It looks like extraction and performs none — the markers it "finds" are the
 *   fixtures it already had. That is acceptable as a visual placeholder and
 *   indefensible as a shipped feature, which is why this adapter exists as a
 *   typed seam rather than as more animation.
 *
 * WHY EVERY VALUE KEEPS ITS PAGE AND BOUNDING BOX
 *   An extracted lab value with no provenance is not safe to chart. The clinician
 *   reviewing a testosterone of 210 ng/dL has exactly one question — "is that
 *   what the report says?" — and the only acceptable answer is to put the number
 *   on screen next to the pixels it came from. Without a box, the reviewer must
 *   either open the PDF and hunt manually (in which case extraction saved
 *   nothing) or trust the machine (in which case a decimal-point OCR error
 *   becomes a dose change). Provenance is not a nice-to-have on this feature; it
 *   is the feature. The confidence score alone is not a substitute: a confidently
 *   wrong read is the failure mode that matters.
 */

/**
 * Below this, a marker is never auto-charted — it goes to human review.
 *
 * Chosen conservatively. The asymmetry is the argument: an unnecessary review is
 * thirty seconds of a nurse's time; a mis-charted biomarker can change a
 * controlled-substance dose.
 */
export const CHART_CONFIDENCE_FLOOR = 0.9;

/**
 * Polygon in inches on the page, clockwise from top-left — the service's own
 * convention. Kept as the raw shape rather than normalized to a rect, because
 * scanned pages are skewed and the quadrilateral is the honest representation.
 */
export interface BoundingBox {
  page: number;
  polygon: Array<{ x: number; y: number }>;
}

export interface ExtractedMarker {
  name: string;
  value: number;
  unit: string;
  refLow: number;
  refHigh: number;
  /** 0..1, straight from the model. Never rounded up for display. */
  confidence: number;
  page: number;
  boundingBox: BoundingBox;
  /** Verbatim text the value was parsed from — the OCR read, before coercion. */
  rawText: string;
}

export interface LabExtraction {
  /** Echoes the input. No file content is retained by this module. */
  fileName: string;
  panelName: string;
  collectedOn: string;
  pageCount: number;
  markers: ExtractedMarker[];
  /** Model id that produced this. Stamped so a result can be reproduced. */
  modelId: string;
  /** Markers below the floor, split out so the UI cannot accidentally chart them. */
  needsReview: ExtractedMarker[];
}

/**
 * The marker vocabulary this fixture model "knows", matching the Alpha Base
 * Panel definitions in lib/mock/labs.ts so extracted output lines up with the
 * charting layer rather than inventing a parallel set of names.
 */
const KNOWN_MARKERS: Array<{
  name: string;
  unit: string;
  ref: [number, number];
  typical: number;
  decimals: number;
}> = [
  { name: "Total Testosterone", unit: "ng/dL", ref: [300, 1000], typical: 610, decimals: 0 },
  { name: "Free Testosterone", unit: "pg/mL", ref: [50, 200], typical: 118, decimals: 1 },
  { name: "Estradiol (E2)", unit: "pg/mL", ref: [10, 40], typical: 26, decimals: 0 },
  { name: "SHBG", unit: "nmol/L", ref: [16, 55], typical: 34, decimals: 0 },
  { name: "TSH", unit: "mIU/L", ref: [0.4, 4.5], typical: 1.9, decimals: 2 },
  { name: "Free T3", unit: "pg/mL", ref: [2.3, 4.2], typical: 3.2, decimals: 1 },
  { name: "Free T4", unit: "ng/dL", ref: [0.8, 1.8], typical: 1.2, decimals: 2 },
  { name: "Hemoglobin A1C", unit: "%", ref: [4, 5.6], typical: 5.4, decimals: 1 },
  { name: "Fasting Glucose", unit: "mg/dL", ref: [70, 99], typical: 93, decimals: 0 },
  { name: "Fasting Insulin", unit: "µIU/mL", ref: [2, 19], typical: 7.4, decimals: 1 },
  { name: "LDL Cholesterol", unit: "mg/dL", ref: [0, 99], typical: 104, decimals: 0 },
  { name: "HDL Cholesterol", unit: "mg/dL", ref: [40, 90], typical: 52, decimals: 0 },
  { name: "Triglycerides", unit: "mg/dL", ref: [0, 149], typical: 131, decimals: 0 },
  { name: "ApoB", unit: "mg/dL", ref: [40, 100], typical: 92, decimals: 0 },
  { name: "Vitamin D, 25-OH", unit: "ng/mL", ref: [30, 100], typical: 44, decimals: 0 },
  { name: "Ferritin", unit: "ng/mL", ref: [30, 400], typical: 142, decimals: 0 },
  { name: "hs-CRP", unit: "mg/L", ref: [0, 3], typical: 1.4, decimals: 1 },
  { name: "ALT", unit: "U/L", ref: [7, 56], typical: 28, decimals: 0 },
  { name: "Hematocrit", unit: "%", ref: [38.3, 48.6], typical: 44.1, decimals: 1 },
  { name: "PSA", unit: "ng/mL", ref: [0, 4], typical: 1.1, decimals: 1 },
];

/** Lab reports lay markers out in a single results column; boxes follow suit. */
const PAGE_MARGIN_IN = 0.9;
const ROW_HEIGHT_IN = 0.34;
const ROWS_PER_PAGE = 18;
const VALUE_COLUMN_X_IN = 3.6;
const VALUE_WIDTH_IN = 0.72;

function boxFor(index: number): BoundingBox {
  const page = Math.floor(index / ROWS_PER_PAGE) + 1;
  const row = index % ROWS_PER_PAGE;
  const top = PAGE_MARGIN_IN + 1.5 + row * ROW_HEIGHT_IN;
  const bottom = top + 0.18;
  return {
    page,
    polygon: [
      { x: VALUE_COLUMN_X_IN, y: top },
      { x: VALUE_COLUMN_X_IN + VALUE_WIDTH_IN, y: top },
      { x: VALUE_COLUMN_X_IN + VALUE_WIDTH_IN, y: bottom },
      { x: VALUE_COLUMN_X_IN, y: bottom },
    ],
  };
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

/**
 * Analyze a lab report.
 *
 * DEMO ONLY. Reads nothing. The `fileName` is the PRNG seed, so the same name
 * always yields the same extraction — required by the determinism rule and
 * useful for screenshots, but it also means this function is blind to the actual
 * document. Do not let it near a real chart.
 */
export function analyzeLabReport(
  fileName: string,
  opts: { collectedOn?: string; panelName?: string } = {},
): AdapterResult<LabExtraction> {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return adapterFail("No file name supplied.");
  }
  if (!/\.(pdf|png|jpe?g|tiff?)$/i.test(trimmed)) {
    // The real service rejects unsupported content types too; failing here keeps
    // the demo's error path honest rather than universally successful.
    return adapterFail(
      `Unsupported document type "${trimmed}". Document Intelligence accepts PDF, PNG, JPEG and TIFF.`,
    );
  }

  const rand = seededRandom(`apex-docintel:${trimmed}`);
  const markers: ExtractedMarker[] = [];

  KNOWN_MARKERS.forEach((def, i) => {
    // Deviate around the typical value within the reference span so the panel
    // reads like one person's blood rather than twenty random numbers.
    const span = def.ref[1] - def.ref[0];
    const drift = (rand() - 0.5) * span * 0.28;
    const value = round(clamp(def.typical + drift, def.ref[0] * 0.55, def.ref[1] * 1.35), def.decimals);

    // Confidence is lower for markers a scanner genuinely struggles with:
    // superscript units, decimals, and anything low in the value column where a
    // fold or staple commonly lands.
    const decimalPenalty = def.decimals > 0 ? 0.03 : 0;
    const positionPenalty = (i % ROWS_PER_PAGE) > 14 ? 0.05 : 0;
    const confidence = round(
      clamp(0.99 - decimalPenalty - positionPenalty - rand() * 0.12, 0.55, 0.995),
      3,
    );

    markers.push({
      name: def.name,
      value,
      unit: def.unit,
      refLow: def.ref[0],
      refHigh: def.ref[1],
      confidence,
      page: Math.floor(i / ROWS_PER_PAGE) + 1,
      boundingBox: boxFor(i),
      rawText: `${value.toFixed(def.decimals)} ${def.unit}`,
    });
  });

  return adapterOk({
    fileName: trimmed,
    panelName: opts.panelName ?? "Alpha Base Panel",
    collectedOn: opts.collectedOn ?? "2026-06-04",
    pageCount: Math.ceil(KNOWN_MARKERS.length / ROWS_PER_PAGE),
    modelId: "apex-lab-panel-v1 (DEMO FIXTURE — no model was invoked)",
    markers,
    needsReview: markers.filter((m) => m.confidence < CHART_CONFIDENCE_FLOOR),
  });
}

/**
 * Markers safe to chart without a human touching them.
 *
 * Separated from `needsReview` at the adapter boundary rather than in the UI: a
 * confidence gate enforced by a component is a gate that the next component
 * forgets. Same reasoning as the consent guard living inside sendMessage.
 */
export function autoChartable(extraction: LabExtraction): ExtractedMarker[] {
  return extraction.markers.filter((m) => m.confidence >= CHART_CONFIDENCE_FLOOR);
}

/** Whether a marker fell outside its reference range — drives the review order. */
export function isOutOfRange(m: ExtractedMarker): boolean {
  return m.value < m.refLow || m.value > m.refHigh;
}

/**
 * A citation string a clinician can act on: page plus position. Rendered next to
 * every extracted number so the provenance is visible without a click, and the
 * click deep-links to the box.
 */
export function citation(m: ExtractedMarker): string {
  const y = m.boundingBox.polygon[0]?.y ?? 0;
  return `p.${m.page} · ${y.toFixed(2)}in`;
}
