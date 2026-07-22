import type { Goal, Symptom } from "@/lib/types";

/**
 * Consults — the longitudinal record that supports the coach-led relationship.
 *
 * The design rule that everything else follows from: **the coach's raw typing
 * is never thrown away.** AI produces a summary, the coach edits it, the coach
 * signs it — and all three layers are retained separately and attributably:
 *
 *   rawNotes      what the human actually typed, verbatim, immutable
 *   aiSummary     what the model produced from it, stamped with provenance
 *   finalSummary  what the human approved, with their edits diffed against AI
 *
 * That is what makes an AI-assisted note defensible a year later. A system that
 * only keeps the polished output cannot answer "did a person actually say this,
 * or did the model invent it?" — and that is the first question anyone asks.
 */

export type ConsultKind =
  | "Coach consult"
  | "Check-in"
  | "Intake"
  | "Medical visit"
  | "Medical follow-up"
  | "Medical telehealth"
  | "Medical chart review"
  /** Historical import value. New Medical notes use the explicit Medical kinds above. */
  | "Provider visit"
  | "Follow-up"
  | "Telehealth";

export type ConsultStatus =
  /** Coach is typing. Nothing has been summarized yet. */
  | "In progress"
  /** AI has produced a summary; awaiting human review. */
  | "Awaiting review"
  /** Human reviewed and signed. Immutable from here — corrections are addenda. */
  | "Signed";

export type ConsultChannel = "In person" | "Phone" | "Video" | "Messaging" | "Chart review";

/**
 * The clinician-authored record of a Medical encounter.
 *
 * These fields are not inferred from the AI summary. They are written by the
 * clinician, autosaved with the working narrative, and locked by the same
 * signature as the rest of the consult.
 */
export interface ClinicalNoteFields {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

/** A single AI-extracted structured field, each traceable to its source text. */
export interface ExtractedItem {
  value: string;
  /** The exact substring of rawNotes this was derived from. */
  sourceQuote: string;
  /** Character offset into rawNotes — powers source highlighting in the UI. */
  sourceStart: number;
  confidence: number;
}

/**
 * The structured read of a consult.
 *
 * Every field carries its source quote, so the UI can show the coach exactly
 * which words produced each line. No unsourced assertions — if the model
 * cannot point at the text, it does not get to claim it.
 */
export interface ConsultSummary {
  /** 1–2 sentence headline a coach can scan in the roster. */
  headline: string;
  /** What the member reported, in their framing. */
  subjective: string[];
  /** Objective observations the coach recorded. */
  objective: string[];
  /** Goals discussed, mapped to the canonical Goal union where possible. */
  goalsDiscussed: Goal[];
  /** Symptoms raised, mapped to the canonical Symptom union. */
  symptomsRaised: Symptom[];
  /** Concrete commitments with an owner. This is what drives follow-up tasks. */
  actionItems: ExtractedItem[];
  /** Things the coach must escalate to a provider. */
  escalations: ExtractedItem[];
  /** Anything the model saw but could not confidently classify. */
  unclassified: string[];
}

export interface ProvenanceStamp {
  engine: string;
  engineVersion: string;
  /** Hash of the exact input the summary was derived from. */
  inputHash: string;
  computedAt: string;
  /** "system" for AI output; a staff id once a human has taken ownership. */
  computedBy: string;
  /** Model identifier, for AI-produced content. */
  model?: string;
}

export interface ConsultAddendum {
  id: string;
  at: string;
  authorId: string;
  text: string;
  reason: string;
}

export interface Consult {
  id: string;
  clientId: string;
  /** Coach who met with the member, or Medical author of a clinical encounter/review. */
  authorId: string;
  kind: ConsultKind;
  channel: ConsultChannel;
  status: ConsultStatus;
  startedAt: string;
  endedAt?: string;
  /** Minutes — shown on the client profile and used for coach capacity math. */
  durationMin?: number;

  /** Immutable. The coach's own words, exactly as typed. */
  rawNotes: string;

  /** Authored SOAP fields for Medical notes. Never synthesized by the AI. */
  clinicalNote?: ClinicalNoteFields;

  /** What the model produced. Null until summarization runs. */
  aiSummary?: ConsultSummary;
  aiProvenance?: ProvenanceStamp;

  /** What the human approved. Diverges from aiSummary wherever it was edited. */
  finalSummary?: ConsultSummary;
  signedAt?: string;
  signedBy?: string;

  /** Corrections after signing. The signed body itself is never rewritten. */
  addenda: ConsultAddendum[];

  /** Whether the member can read this consult in their portal. */
  visibleToClient: boolean;
}

/** Fields the coach edited away from the AI's version — drives the diff chips. */
export function editedFields(c: Consult): string[] {
  if (!c.aiSummary || !c.finalSummary) return [];
  const out: string[] = [];
  if (c.aiSummary.headline !== c.finalSummary.headline) out.push("headline");
  const listChanged = (a: unknown[], b: unknown[]) =>
    a.length !== b.length || JSON.stringify(a) !== JSON.stringify(b);
  if (listChanged(c.aiSummary.subjective, c.finalSummary.subjective)) out.push("subjective");
  if (listChanged(c.aiSummary.objective, c.finalSummary.objective)) out.push("objective");
  if (listChanged(c.aiSummary.actionItems, c.finalSummary.actionItems)) out.push("action items");
  if (listChanged(c.aiSummary.escalations, c.finalSummary.escalations)) out.push("escalations");
  return out;
}
