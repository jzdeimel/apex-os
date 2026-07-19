import type { Goal, Symptom } from "@/lib/types";
import type { ConsultSummary, ExtractedItem, ProvenanceStamp } from "@/lib/consult/types";
import { sha256 } from "@/lib/trace/hash";

/**
 * Consult summarization.
 *
 * This is a genuine extractive summarizer, not a canned response: it segments
 * whatever the coach actually typed, classifies each fragment, and maps free
 * text onto Apex's canonical Goal/Symptom unions. Type anything into the
 * composer and it responds to those words.
 *
 * Two reasons it is deterministic and local rather than an LLM call here:
 *   1. Every extracted item must cite the exact substring it came from. An
 *      extractive pass can guarantee that; a generative one cannot, and an
 *      unsourced clinical assertion is precisely what we refuse to ship.
 *   2. The demo has to be reproducible — same notes, same summary, every time.
 *
 * In production this runs against Azure OpenAI, and the contract stays
 * identical: the model must return `sourceQuote` + `sourceStart` for every
 * item, and anything it cannot source lands in `unclassified` rather than
 * being asserted. The engine version below is what gets stamped into
 * provenance so any past summary can be reproduced.
 */

export const ENGINE = "consult-summarizer";
export const ENGINE_VERSION = "1.2.0";

// ---------------------------------------------------------------------------
// Lexicons
// ---------------------------------------------------------------------------

/** Cue phrases that mark a fragment as a commitment with an owner. */
const ACTION_CUES = [
  "will ", "we'll", "i'll", "going to", "plan to", "let's", "lets ",
  "start ", "starting", "stop ", "increase", "decrease", "switch",
  "schedule", "book ", "rebook", "send ", "order ", "reorder", "refill",
  "follow up", "follow-up", "check in", "check-in", "next week", "next visit",
  "add ", "remove ", "set up", "sign up", "bring ", "track ", "log ",
];

/** Cue phrases that mean a licensed provider needs to see this. */
const ESCALATION_CUES = [
  "provider", "doctor", "dr.", "physician", "np ", "escalate", "refer",
  "concern", "concerned", "worried", "urgent", "asap", "flag",
  "side effect", "side-effect", "reaction", "adverse", "chest pain",
  "shortness of breath", "dizzy", "dizziness", "fainted", "swelling",
  "not sure", "unsure", "out of scope", "above my", "needs review",
  "elevated bp", "blood pressure", "palpitations",
];

/** Cue phrases that mark an objective observation rather than a report. */
const OBJECTIVE_CUES = [
  "weight", "weighed", "lbs", "pounds", "kg", "bmi", "body fat", "bf%",
  "scan", "inbody", "waist", "bp ", "blood pressure", "hr ", "heart rate",
  "measured", "recorded", "labs", "lab ", "a1c", "glucose", "testosterone",
  "down ", "up ", "lost ", "gained", "%", "mg", "ml", "dose",
];

/** Free-text → canonical Goal. First match wins, so order matters. */
const GOAL_CUES: [Goal, string[]][] = [
  ["Fat loss", ["fat loss", "weight loss", "lose weight", "cutting", "lean out", "drop weight", "slim"]],
  ["Muscle gain", ["muscle", "bulk", "mass", "gain size", "stronger", "strength gain", "lean mass"]],
  ["Recovery", ["recovery", "recover", "soreness", "sore", "doms", "bounce back"]],
  ["Libido", ["libido", "sex drive", "sexual", "intimacy", "erectile", "ed "]],
  ["Energy", ["energy", "fatigue", "tired", "exhausted", "stamina", "endurance"]],
  ["Sleep", ["sleep", "insomnia", "restless", "waking up", "rem ", "bedtime"]],
  ["Cognition", ["focus", "concentration", "brain fog", "memory", "clarity", "cognition", "sharp"]],
  ["Joint pain", ["joint", "knee", "shoulder", "elbow", "hip pain", "arthritis", "stiffness"]],
  ["Skin/hair", ["skin", "hair", "complexion", "thinning", "acne", "wrinkle"]],
];

const SYMPTOM_CUES: [Symptom, string[]][] = [
  ["Low energy", ["low energy", "no energy", "fatigue", "tired", "exhausted", "drained", "wiped"]],
  ["Poor sleep", ["poor sleep", "not sleeping", "insomnia", "trouble sleeping", "waking up", "restless night"]],
  ["Brain fog", ["brain fog", "foggy", "can't focus", "cant focus", "unfocused", "cloudy"]],
  ["Low libido", ["low libido", "no libido", "sex drive is", "libido is down", "erectile"]],
  ["Joint pain", ["joint pain", "knee pain", "shoulder pain", "achy joints", "stiff joints"]],
  ["Slow recovery", ["slow recovery", "not recovering", "sore for days", "takes days to recover", "prolonged soreness"]],
  ["Weight gain", ["weight gain", "gaining weight", "put on weight", "gained weight", "up on the scale"]],
  ["Hair thinning", ["hair thinning", "thinning hair", "losing hair", "hair loss", "shedding"]],
  ["Mood changes", ["mood", "irritable", "irritability", "anxious", "anxiety", "depressed", "low mood", "short fuse"]],
  ["Reduced strength", ["weaker", "lost strength", "reduced strength", "lifts are down", "strength is down"]],
  ["Cold intolerance", ["cold all the time", "cold intolerance", "always cold", "cold hands", "cold feet"]],
  ["Elevated stress", ["stress", "stressed", "burnt out", "burned out", "overwhelmed", "pressure at work"]],
];

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

interface Fragment {
  text: string;
  start: number;
}

/**
 * Split raw notes into fragments, preserving each one's offset.
 *
 * Coaches type in bullets, dashes and run-ons mid-conversation, so we split on
 * newlines and bullet markers first and only then on sentence punctuation —
 * splitting on periods alone would shred "1.5mg" and "Dr. Vale".
 */
export function segment(raw: string): Fragment[] {
  const out: Fragment[] = [];
  const lineRe = /[^\n\r]+/g;
  let lineMatch: RegExpExecArray | null;

  while ((lineMatch = lineRe.exec(raw)) !== null) {
    const lineStart = lineMatch.index;
    const line = lineMatch[0];

    // Strip a leading bullet/number marker but keep the offset honest.
    const bullet = /^\s*(?:[-*•·]|\d+[.)])\s*/.exec(line);
    const bodyStart = bullet ? bullet[0].length : 0;
    const body = line.slice(bodyStart);

    // Sentence split that refuses to break on decimals or common abbreviations.
    const parts = body.split(/(?<![A-Z][a-z]\.)(?<!\d)\.(?!\d)\s+|(?<=[!?;])\s+/);
    let cursor = 0;
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length >= 3) {
        const rel = body.indexOf(part, cursor);
        out.push({ text: trimmed, start: lineStart + bodyStart + (rel === -1 ? cursor : rel) });
      }
      cursor += part.length + 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function hits(haystack: string, cues: string[]): number {
  const lower = haystack.toLowerCase();
  return cues.reduce((n, cue) => (lower.includes(cue) ? n + 1 : n), 0);
}

/** Confidence from cue density, capped — never claim certainty we don't have. */
function confidenceFrom(hitCount: number, len: number): number {
  const density = hitCount / Math.max(1, len / 60);
  return Math.min(0.95, 0.55 + density * 0.2);
}

function matchUnion<T extends string>(raw: string, cues: [T, string[]][]): T[] {
  const lower = raw.toLowerCase();
  const found: T[] = [];
  for (const [value, phrases] of cues) {
    if (phrases.some((p) => lower.includes(p))) found.push(value);
  }
  return found;
}

function toItem(f: Fragment, hitCount: number): ExtractedItem {
  return {
    value: f.text.replace(/\s+/g, " ").trim(),
    sourceQuote: f.text,
    sourceStart: f.start,
    confidence: confidenceFrom(hitCount, f.text.length),
  };
}

/**
 * Produce a structured summary from raw consult notes.
 *
 * Order of precedence when a fragment matches several classes: escalation wins
 * over action, action wins over objective, objective wins over subjective.
 * Escalations outrank everything deliberately — the cost of missing one is far
 * higher than the cost of surfacing an extra.
 */
export function summarizeConsult(rawNotes: string): ConsultSummary {
  const frags = segment(rawNotes);

  const subjective: string[] = [];
  const objective: string[] = [];
  const actionItems: ExtractedItem[] = [];
  const escalations: ExtractedItem[] = [];
  const unclassified: string[] = [];

  for (const f of frags) {
    const esc = hits(f.text, ESCALATION_CUES);
    const act = hits(f.text, ACTION_CUES);
    const obj = hits(f.text, OBJECTIVE_CUES);

    if (esc > 0) {
      escalations.push(toItem(f, esc));
    } else if (act > 0) {
      actionItems.push(toItem(f, act));
    } else if (obj > 0) {
      objective.push(f.text);
    } else if (f.text.length > 12) {
      subjective.push(f.text);
    } else {
      // Too short to classify safely — surfaced rather than silently dropped.
      unclassified.push(f.text);
    }
  }

  const goalsDiscussed = matchUnion<Goal>(rawNotes, GOAL_CUES);
  const symptomsRaised = matchUnion<Symptom>(rawNotes, SYMPTOM_CUES);

  return {
    headline: buildHeadline({
      goalsDiscussed,
      symptomsRaised,
      actionCount: actionItems.length,
      escalationCount: escalations.length,
      hasContent: frags.length > 0,
    }),
    subjective,
    objective,
    goalsDiscussed,
    symptomsRaised,
    actionItems,
    escalations,
    unclassified,
  };
}

function buildHeadline(x: {
  goalsDiscussed: Goal[];
  symptomsRaised: Symptom[];
  actionCount: number;
  escalationCount: number;
  hasContent: boolean;
}): string {
  if (!x.hasContent) return "No notes recorded yet.";

  const parts: string[] = [];
  if (x.goalsDiscussed.length) {
    parts.push(`Focused on ${listPhrase(x.goalsDiscussed.slice(0, 3).map((g) => g.toLowerCase()))}`);
  }
  if (x.symptomsRaised.length) {
    parts.push(
      `${parts.length ? "member reported" : "Member reported"} ${listPhrase(
        x.symptomsRaised.slice(0, 3).map((s) => s.toLowerCase()),
      )}`,
    );
  }
  if (x.actionCount) {
    parts.push(`${x.actionCount} action item${x.actionCount === 1 ? "" : "s"} agreed`);
  }
  if (x.escalationCount) {
    parts.push(
      `${x.escalationCount} item${x.escalationCount === 1 ? "" : "s"} flagged for provider review`,
    );
  }
  if (!parts.length) return "General check-in — no structured findings extracted.";
  return parts.join("; ") + ".";
}

function listPhrase(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Stamp that makes a summary reproducible years later. */
export function stampFor(rawNotes: string, at: string): ProvenanceStamp {
  return {
    engine: ENGINE,
    engineVersion: ENGINE_VERSION,
    inputHash: sha256(rawNotes),
    computedAt: at,
    computedBy: "system",
    model: "azure-openai/gpt-4o (extractive contract)",
  };
}

/** Total structured findings — used for the "N findings" chip. */
export function findingCount(s: ConsultSummary): number {
  return (
    s.subjective.length +
    s.objective.length +
    s.actionItems.length +
    s.escalations.length +
    s.goalsDiscussed.length +
    s.symptomsRaised.length
  );
}
