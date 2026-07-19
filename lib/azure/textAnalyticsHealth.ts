import type { ExtractedItem } from "@/lib/consult/types";
import { adapterOk, type AdapterResult } from "@/lib/azure/types";

/**
 * AZURE AI LANGUAGE — TEXT ANALYTICS FOR HEALTH.
 *
 * WHAT THE REAL SERVICE DOES
 *   Submits clinical free text to `/language/analyze-text/jobs` with the
 *   `Healthcare` task and returns typed entities — Diagnosis, SymptomOrSign,
 *   MedicationName, Dosage, Frequency, BodyStructure and ~25 more — each with a
 *   character offset and length into the source, a confidence score, assertion
 *   detection (certainty, conditionality, and crucially *negation*), relations
 *   between entities (a Dosage bound to its MedicationName), and links to UMLS
 *   concept ids from which SNOMED CT and RxNorm codes resolve.
 *
 * WHAT THIS FILE DOES INSTEAD
 *   A local, deterministic recognizer over a small clinical lexicon. It runs a
 *   real scan of real text and returns real offsets — every entity below can be
 *   sliced back out of the input string and will match. What it does not have is
 *   the model's vocabulary breadth or its relation extraction. It will miss
 *   things the service would catch. It does not call anything.
 *
 * WHAT WOULD HAVE TO CHANGE TO MAKE IT REAL
 *   1. Provision a Language resource (BAA-covered) in the tenant.
 *   2. POST the note text, poll the job, and map `results.documents[0].entities`
 *      onto `ClinicalEntity` — `offset`/`length`/`confidenceScore` map 1:1, and
 *      `assertion.negated === true` maps onto `negated`.
 *   3. Carry `links[]` through unchanged for coding and analytics.
 *   Nothing downstream changes shape.
 *
 * WHY THIS UPGRADES summarize.ts WITHOUT CHANGING ITS CONTRACT
 *   lib/consult/summarize.ts is honest keyword matching: it segments what the
 *   coach typed, classifies fragments by cue phrases, and — the part that
 *   matters — records `sourceQuote` and `sourceStart` for every item it emits.
 *   Swapping the recognizer for real clinical NLP changes recall dramatically
 *   and changes the contract not at all, because the contract is offsets.
 *
 *   That is deliberate architecture, not a happy accident. The rule that nothing
 *   may be asserted which cannot be pointed at is the product, not an
 *   implementation detail. It is what lets a provider a year later ask "did a
 *   person actually say this, or did the model invent it?" and get an answer by
 *   highlighting the sentence. Any component that can satisfy that rule can be
 *   dropped in; any component that cannot is disqualified regardless of how good
 *   its output looks. `toExtractedItems` below exists precisely to prove the
 *   substitution is mechanical.
 *
 * WHY NEGATION DETECTION MATTERS ENORMOUSLY
 *   "Patient denies chest pain" and "patient reports chest pain" share every
 *   clinically salient token. A keyword extractor scores them identically and
 *   writes a chest-pain finding into the chart in both cases. That single class
 *   of error is how a review-of-systems note that documented the *absence* of a
 *   symptom becomes a problem-list entry asserting its presence — and once it is
 *   on the problem list it propagates into risk flags, referrals and, in this
 *   clinic, an escalation queue that pulls a provider away from someone who
 *   actually needs them. `negated` entities are returned, never suppressed:
 *   "no chest pain" is real clinical information and belongs in the record. It
 *   simply must never be read as a positive finding. `positiveFindings()` is the
 *   only accessor callers should use when deciding to assert something.
 */

export type ClinicalEntityCategory =
  | "Diagnosis"
  | "SymptomOrSign"
  | "MedicationName"
  | "Dosage"
  | "Frequency"
  | "BodyStructure"
  | "ExaminationName"
  | "TreatmentName"
  | "MeasurementValue"
  | "Direction";

export interface EntityLink {
  /** "UMLS", "SNOMEDCT_US", "RXNORM", "LNC". */
  dataSource: string;
  id: string;
}

export interface ClinicalEntity {
  /** The exact substring. `text === source.slice(offset, offset + length)`. */
  text: string;
  category: ClinicalEntityCategory;
  /** Character offset into the input. The whole contract rests on this. */
  offset: number;
  length: number;
  confidence: number;
  /**
   * True when the surrounding text negates the entity. See the header — this
   * flag is the difference between a record and a liability.
   */
  negated: boolean;
  /**
   * True when the text attributes the finding to someone other than the member
   * ("father had a heart attack"). Family history is not member history, and a
   * summarizer that conflates them produces a chart that is wrong about who is
   * sick.
   */
  subjectIsOther: boolean;
  links?: EntityLink[];
}

export interface HealthAnalysisResult {
  entities: ClinicalEntity[];
  /** Echo of what was analyzed, so offsets are resolvable by the caller. */
  sourceLength: number;
  modelVersion: string;
}

// ---------------------------------------------------------------------------
// Lexicon
// ---------------------------------------------------------------------------

interface Term {
  surface: string;
  category: ClinicalEntityCategory;
  links?: EntityLink[];
}

/**
 * Longest-surface-first at match time, so "chest pain" wins over "pain" and
 * "low testosterone" wins over "testosterone". Sorted once, below.
 */
const LEXICON: Term[] = ([
  // Symptoms and signs
  { surface: "chest pain", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0008031" }, { dataSource: "SNOMEDCT_US", id: "29857009" }] },
  { surface: "shortness of breath", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0013404" }] },
  { surface: "palpitations", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0030252" }] },
  { surface: "brain fog", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0338656" }] },
  { surface: "low libido", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0011124" }] },
  { surface: "night sweats", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0028081" }] },
  { surface: "hot flashes", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0600142" }] },
  { surface: "joint pain", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0003862" }] },
  { surface: "hair thinning", category: "SymptomOrSign" },
  { surface: "weight gain", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0043094" }] },
  { surface: "insomnia", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0917801" }] },
  { surface: "irritability", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0022107" }] },
  { surface: "swelling", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0013604" }] },
  { surface: "dizziness", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0012833" }] },
  { surface: "fatigue", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0015672" }] },
  { surface: "acne", category: "SymptomOrSign", links: [{ dataSource: "UMLS", id: "C0001144" }] },

  // Diagnoses
  { surface: "hypogonadism", category: "Diagnosis", links: [{ dataSource: "SNOMEDCT_US", id: "72322001" }] },
  { surface: "hypothyroidism", category: "Diagnosis", links: [{ dataSource: "SNOMEDCT_US", id: "40930008" }] },
  { surface: "prediabetes", category: "Diagnosis", links: [{ dataSource: "SNOMEDCT_US", id: "714628002" }] },
  { surface: "erectile dysfunction", category: "Diagnosis", links: [{ dataSource: "SNOMEDCT_US", id: "860914002" }] },
  { surface: "perimenopause", category: "Diagnosis", links: [{ dataSource: "SNOMEDCT_US", id: "58715001" }] },
  { surface: "menopause", category: "Diagnosis", links: [{ dataSource: "SNOMEDCT_US", id: "161712005" }] },
  { surface: "sleep apnea", category: "Diagnosis", links: [{ dataSource: "SNOMEDCT_US", id: "73430006" }] },
  { surface: "erythrocytosis", category: "Diagnosis", links: [{ dataSource: "SNOMEDCT_US", id: "35631005" }] },
  // Present because family cardiac history is the single most common
  // third-party finding in an intake note, and the case `subjectIsOther` exists
  // to catch: "father had a heart attack" is history, not the member's chart.
  { surface: "heart attack", category: "Diagnosis", links: [{ dataSource: "SNOMEDCT_US", id: "22298006" }] },
  { surface: "myocardial infarction", category: "Diagnosis", links: [{ dataSource: "SNOMEDCT_US", id: "22298006" }] },

  // Medications and protocol agents
  { surface: "testosterone cypionate", category: "MedicationName", links: [{ dataSource: "RXNORM", id: "1647574" }] },
  { surface: "testosterone", category: "MedicationName", links: [{ dataSource: "RXNORM", id: "10379" }] },
  { surface: "semaglutide", category: "MedicationName", links: [{ dataSource: "RXNORM", id: "1991302" }] },
  { surface: "tirzepatide", category: "MedicationName", links: [{ dataSource: "RXNORM", id: "2601723" }] },
  { surface: "anastrozole", category: "MedicationName", links: [{ dataSource: "RXNORM", id: "84857" }] },
  { surface: "estradiol", category: "MedicationName", links: [{ dataSource: "RXNORM", id: "4083" }] },
  { surface: "progesterone", category: "MedicationName", links: [{ dataSource: "RXNORM", id: "8727" }] },
  { surface: "levothyroxine", category: "MedicationName", links: [{ dataSource: "RXNORM", id: "10582" }] },
  { surface: "sermorelin", category: "MedicationName" },
  { surface: "bpc-157", category: "MedicationName" },
  { surface: "tadalafil", category: "MedicationName", links: [{ dataSource: "RXNORM", id: "38454" }] },

  // Exams / labs
  { surface: "total testosterone", category: "ExaminationName", links: [{ dataSource: "LNC", id: "2986-8" }] },
  { surface: "free testosterone", category: "ExaminationName", links: [{ dataSource: "LNC", id: "2991-8" }] },
  { surface: "hematocrit", category: "ExaminationName", links: [{ dataSource: "LNC", id: "4544-3" }] },
  { surface: "blood pressure", category: "ExaminationName", links: [{ dataSource: "LNC", id: "85354-9" }] },
  { surface: "a1c", category: "ExaminationName", links: [{ dataSource: "LNC", id: "4548-4" }] },
  { surface: "psa", category: "ExaminationName", links: [{ dataSource: "LNC", id: "2857-1" }] },

  // Treatments / services
  { surface: "iv therapy", category: "TreatmentName" },
  { surface: "body scan", category: "ExaminationName" },
  { surface: "nutrition coaching", category: "TreatmentName" },

  // Body structures
  { surface: "thyroid", category: "BodyStructure", links: [{ dataSource: "SNOMEDCT_US", id: "69748006" }] },
  { surface: "shoulder", category: "BodyStructure", links: [{ dataSource: "SNOMEDCT_US", id: "16982005" }] },
  { surface: "knee", category: "BodyStructure", links: [{ dataSource: "SNOMEDCT_US", id: "72696002" }] },
  { surface: "prostate", category: "BodyStructure", links: [{ dataSource: "SNOMEDCT_US", id: "41216001" }] },
] as Term[]).sort((a, b) => b.surface.length - a.surface.length);

/** Dosage: a number plus a mass/volume unit. */
const DOSAGE_RE = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|ml|iu|units?|cc)\b/gi;

/** Frequency: cadence phrases a coach actually types. */
const FREQUENCY_RE =
  /\b(?:once|twice|three times|3x|2x|4x|5x)\s?(?:a|per|\/)?\s?(?:day|week|month)\b|\b(?:daily|nightly|weekly|biweekly|monthly|every other day|q\d+h|prn)\b/gi;

/** Measurement values with clinical units — the numbers a chart cares about. */
const MEASUREMENT_RE =
  /\b\d+(?:\.\d+)?\s?(?:ng\/dl|pg\/ml|nmol\/l|miu\/l|mg\/dl|mmol\/l|u\/l|%|lbs|kg|bpm)\b/gi;

/**
 * Negation cues that scope FORWARD over the following clause.
 *
 * Scope ends at the next clause boundary, not at the next N tokens. A fixed
 * token window is the classic NegEx shortcut and it breaks on exactly the
 * sentences clinicians write: "denies chest pain, shortness of breath, or
 * palpitations" negates all three, while "no chest pain, but reports fatigue"
 * must negate only the first. Punctuation and coordinating conjunctions carry
 * that information; a window does not.
 */
const NEGATION_CUES = [
  "no ", "not ", "denies ", "denied ", "without ", "negative for ",
  "absence of ", "ruled out ", "free of ", "resolved ",
];

/** Tokens that end a negation's scope. "but"/"however" reverse polarity. */
const SCOPE_TERMINATORS = [". ", "; ", ", but ", " but ", " however ", " though ", " although ", "\n"];

/** Cues that the finding belongs to someone other than the member. */
const OTHER_SUBJECT_CUES = [
  "family history", "father", "mother", "brother", "sister", "parents",
  "his dad", "her mom", "grandfather", "grandmother", "sibling",
];

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * The span of text a negation cue governs, starting at the cue.
 * Returns [cueStart, scopeEnd).
 */
function negationScopes(lower: string): Array<[number, number]> {
  const scopes: Array<[number, number]> = [];
  for (const cue of NEGATION_CUES) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(cue, from);
      if (at === -1) break;
      // Must start at a word boundary — "not" inside "nothing" is not a cue.
      const prev = at === 0 ? " " : lower[at - 1];
      if (/[a-z0-9]/.test(prev)) {
        from = at + 1;
        continue;
      }
      let end = lower.length;
      for (const term of SCOPE_TERMINATORS) {
        const t = lower.indexOf(term, at + cue.length);
        if (t !== -1 && t < end) end = t;
      }
      scopes.push([at, end]);
      from = at + cue.length;
    }
  }
  return scopes;
}

function inAnyScope(offset: number, scopes: Array<[number, number]>): boolean {
  return scopes.some(([s, e]) => offset >= s && offset < e);
}

function otherSubjectScopes(lower: string): Array<[number, number]> {
  const scopes: Array<[number, number]> = [];
  for (const cue of OTHER_SUBJECT_CUES) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(cue, from);
      if (at === -1) break;
      let end = lower.length;
      for (const term of [". ", "; ", "\n"]) {
        const t = lower.indexOf(term, at + cue.length);
        if (t !== -1 && t < end) end = t;
      }
      scopes.push([at, end]);
      from = at + cue.length;
    }
  }
  return scopes;
}

/** Reject a match that lands inside a longer, already-claimed span. */
function overlaps(offset: number, length: number, taken: Array<[number, number]>): boolean {
  return taken.some(([s, e]) => offset < e && s < offset + length);
}

/**
 * Extract clinical entities from free text.
 *
 * Deterministic and local. Confidence values are derived from match specificity,
 * not sampled — a longer, unambiguous surface form scores higher, which is the
 * same direction the real model moves without pretending to be it.
 */
export function extractEntities(text: string): AdapterResult<HealthAnalysisResult> {
  const lower = text.toLowerCase();
  const negScopes = negationScopes(lower);
  const otherScopes = otherSubjectScopes(lower);

  const entities: ClinicalEntity[] = [];
  const taken: Array<[number, number]> = [];

  const push = (
    offset: number,
    length: number,
    category: ClinicalEntityCategory,
    confidence: number,
    links?: EntityLink[],
  ) => {
    if (overlaps(offset, length, taken)) return;
    taken.push([offset, offset + length]);
    entities.push({
      text: text.slice(offset, offset + length),
      category,
      offset,
      length,
      confidence,
      negated: inAnyScope(offset, negScopes),
      subjectIsOther: inAnyScope(offset, otherScopes),
      links,
    });
  };

  // Lexicon pass — longest surfaces first, so specific terms claim their span
  // before a shorter substring can.
  for (const term of LEXICON) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(term.surface, from);
      if (at === -1) break;
      const before = at === 0 ? " " : lower[at - 1];
      const afterIdx = at + term.surface.length;
      const after = afterIdx >= lower.length ? " " : lower[afterIdx];
      const isWord = !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
      if (isWord) {
        // Multi-word surfaces are far less likely to be incidental.
        const words = term.surface.split(" ").length;
        push(at, term.surface.length, term.category, Math.min(0.98, 0.82 + words * 0.05), term.links);
      }
      from = at + term.surface.length;
    }
  }

  // Pattern passes.
  const patterns: Array<[RegExp, ClinicalEntityCategory, number]> = [
    [DOSAGE_RE, "Dosage", 0.95],
    [FREQUENCY_RE, "Frequency", 0.93],
    [MEASUREMENT_RE, "MeasurementValue", 0.94],
  ];
  for (const [re, category, confidence] of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      push(m.index, m[0].length, category, confidence);
    }
  }

  entities.sort((a, b) => a.offset - b.offset);

  return adapterOk({
    entities,
    sourceLength: text.length,
    modelVersion: "apex-local-recognizer-1.0 (DEMO — Text Analytics for Health was not called)",
  });
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Entities safe to assert about this member.
 *
 * The ONLY accessor a caller should use when writing something into a chart,
 * a problem list, or an escalation. Negated and third-party entities are
 * excluded here rather than at each call site, for the same reason the consent
 * check lives inside sendMessage: a rule enforced by remembering is a rule that
 * eventually is not enforced.
 */
export function positiveFindings(result: HealthAnalysisResult): ClinicalEntity[] {
  return result.entities.filter((e) => !e.negated && !e.subjectIsOther);
}

/** Documented absences — real clinical information, never a positive finding. */
export function documentedAbsences(result: HealthAnalysisResult): ClinicalEntity[] {
  return result.entities.filter((e) => e.negated);
}

export function entitiesOfCategory(
  result: HealthAnalysisResult,
  category: ClinicalEntityCategory,
): ClinicalEntity[] {
  return result.entities.filter((e) => e.category === category);
}

/**
 * Project entities onto the shape lib/consult/summarize.ts already emits.
 *
 * This function is the proof that the upgrade is a substitution and not a
 * rewrite: `ExtractedItem` needs `value`, `sourceQuote`, `sourceStart` and
 * `confidence`, and a clinical entity carries all four natively. If a future
 * NLP option cannot fill this signature, it does not qualify — the check is
 * mechanical, which is exactly what you want a safety rule to be.
 */
export function toExtractedItems(entities: ClinicalEntity[]): ExtractedItem[] {
  return entities.map((e) => ({
    value: e.text,
    sourceQuote: e.text,
    sourceStart: e.offset,
    confidence: e.confidence,
  }));
}

/**
 * Assert that every entity's offset really does resolve in the source.
 *
 * Cheap, and worth keeping: an off-by-one in offset arithmetic makes the
 * highlight land on the wrong words, which is a provenance feature that
 * confidently lies. Callable from a page or a test.
 */
export function offsetsResolve(text: string, result: HealthAnalysisResult): boolean {
  return result.entities.every((e) => text.slice(e.offset, e.offset + e.length) === e.text);
}
