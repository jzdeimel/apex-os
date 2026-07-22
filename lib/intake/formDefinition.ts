import { sha256 } from "@/lib/trace/hash";

/**
 * THE INTAKE FORM, AS VERSIONED DATA.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The intake questions were hardcoded in `components/intake/IntakeWizard.tsx` —
 * a `history` object with seven fixed fields and JSX per field. Two things were
 * about to collide with that:
 *
 *   1. Paul Kennard is running the male and female medical-history forms through
 *      a de-duplication pass and producing a multi-tab document; Matt Chilson is
 *      confirming the required set with Nathalie Callahan; both land within days
 *      (2026-07-21 sync). Against hardcoded JSX every revision is a code change.
 *   2. `consent` already stores `documentVersion` + `textSha256` so a signature
 *      can prove WHAT was agreed to. A submitted medical history had no such
 *      anchor — the answers were stored, the questions were not, so "what was
 *      this person actually asked in July" is unanswerable the moment the form
 *      changes. For a medical history that is the whole evidentiary value.
 *
 * So the form is DATA, versioned, hashed, and every submission records the
 * version and hash it answered.
 *
 * ── THE FIVE MUST-KNOWS ────────────────────────────────────────────────────
 * Paul, on the same call, naming what medical actually needs:
 *
 *   "There's five questions that are the overarching things we need to know.
 *    One is are there allergies. The second is are there missing organs. The
 *    third is surgical history. Are there any major diseases or illnesses. And
 *    the fifth is cancer — we ask about it independently and also want to know
 *    about immediate family."
 *
 * The reason it is coach-guided is a failure he described directly: "it is not
 * uncommon that somebody shows up and they go 'oh yeah, I had liver cancer, I
 * didn't think you wanted to know about that.'"
 *
 * Three of those five did not exist on the form at all — missing organs,
 * surgical history, and cancer including family history. They are marked
 * `mustKnow` below, they are required, and `validateSubmission` refuses a
 * submission without them. A must-know that can be skipped is a field, not a
 * requirement.
 *
 * ── WHAT A NEW VERSION MEANS ───────────────────────────────────────────────
 * Add a version, never edit a published one. Old submissions point at the
 * version they answered; editing that version in place rewrites history and
 * makes the hash a lie. `CURRENT_FORM_VERSION` is the only thing that moves.
 */

export type QuestionKind =
  | "short-text"
  | "long-text"
  | "yes-no"
  | "single-select"
  | "multi-select"
  | "date"
  /** A repeating group — medications, surgeries. Answers are arrays of objects. */
  | "repeating";

export interface QuestionOption {
  value: string;
  label: string;
}

export interface RepeatingField {
  id: string;
  label: string;
  kind: "short-text" | "long-text" | "date";
  required?: boolean;
}

export interface IntakeQuestion {
  id: string;
  /** The question as the patient reads it. Second person, plain language. */
  prompt: string;
  /** Optional clarifier. Where "I didn't think you wanted to know that" gets pre-empted. */
  help?: string;
  kind: QuestionKind;
  required: boolean;
  /**
   * One of Paul's five. These are surfaced at the top of the nurse and provider
   * views and are the coach's confirmation checklist during a guided intake.
   */
  mustKnow?: boolean;
  options?: QuestionOption[];
  fields?: RepeatingField[];
  /**
   * Show only when this predicate holds. Kept as data — a question hidden by a
   * hand-written condition in JSX is a question nobody can audit later.
   */
  showWhen?: { questionId: string; equals: string | boolean };
  /** Restrict to one track where the question genuinely only applies to one. */
  appliesTo?: "male" | "female";
}

export interface IntakeSection {
  id: string;
  title: string;
  /** One line explaining why this section is being asked. */
  blurb: string;
  questions: IntakeQuestion[];
}

export interface IntakeFormDefinition {
  /** Stable identity across versions. */
  formId: string;
  /** Monotonic. Published versions are immutable. */
  version: string;
  publishedOn: string;
  /** Who signed off clinically. Empty until someone actually has. */
  approvedBy: string | null;
  sections: IntakeSection[];
}

/* -------------------------------------------------------------------------- */
/* v1 — the current published form                                             */
/* -------------------------------------------------------------------------- */

const MUST_KNOW_SECTION: IntakeSection = {
  id: "must-knows",
  title: "The five things we always ask",
  blurb:
    "Every patient answers these, every time. They are the questions that change what is safe to prescribe.",
  questions: [
    {
      id: "allergies",
      prompt: "Do you have any allergies?",
      help: "Medications, foods, latex, anything. Include what the reaction was.",
      kind: "long-text",
      required: true,
      mustKnow: true,
    },
    {
      id: "missing-organs",
      prompt: "Have you had any organs removed?",
      help:
        "Gallbladder, appendix, thyroid, spleen, kidney, uterus, ovaries, testicle — anything, however long ago.",
      kind: "long-text",
      required: true,
      mustKnow: true,
    },
    {
      id: "surgical-history",
      prompt: "What surgeries have you had?",
      help: "Include the approximate year. Minor procedures count.",
      kind: "repeating",
      required: true,
      mustKnow: true,
      fields: [
        { id: "procedure", label: "Procedure", kind: "short-text", required: true },
        { id: "year", label: "Year", kind: "short-text" },
        { id: "notes", label: "Anything we should know", kind: "long-text" },
      ],
    },
    {
      id: "major-diseases",
      prompt: "Have you been diagnosed with any major disease or illness?",
      help:
        "Heart disease, diabetes, stroke, liver or kidney disease, autoimmune conditions, blood clots, seizures.",
      kind: "long-text",
      required: true,
      mustKnow: true,
    },
    {
      id: "cancer-history",
      prompt: "Have you ever been diagnosed with cancer?",
      // Asked separately from major diseases on purpose — see the file docblock.
      help: "Any type, at any age, including cancers treated and resolved.",
      kind: "yes-no",
      required: true,
      mustKnow: true,
    },
    {
      id: "cancer-detail",
      prompt: "Tell us about it.",
      help: "Type, roughly when, and how it was treated.",
      kind: "long-text",
      required: true,
      showWhen: { questionId: "cancer-history", equals: true },
    },
    {
      id: "family-cancer-history",
      prompt: "Has anyone in your immediate family been diagnosed with cancer?",
      help:
        "Parents, siblings, children. Type and roughly what age they were, if you know it.",
      kind: "long-text",
      required: true,
      mustKnow: true,
    },
  ],
};

const MEDICATIONS_SECTION: IntakeSection = {
  id: "medications",
  title: "What you take",
  blurb:
    "Everything, including things prescribed elsewhere. We screen for interactions and we cannot screen for what we cannot see.",
  questions: [
    {
      id: "medications",
      prompt: "Medications and supplements you take",
      help: "Prescription, over the counter, peptides, TRT, supplements.",
      kind: "repeating",
      required: false,
      fields: [
        { id: "name", label: "Name", kind: "short-text", required: true },
        { id: "dose", label: "Dose", kind: "short-text" },
        { id: "prescriber", label: "Who prescribes it", kind: "short-text" },
      ],
    },
    {
      id: "prior-hormone-therapy",
      prompt: "Have you been on hormone therapy before?",
      kind: "yes-no",
      required: true,
    },
    {
      id: "tobacco",
      prompt: "Do you use tobacco or nicotine?",
      kind: "yes-no",
      required: true,
    },
  ],
};

const CURRENT_HEALTH_SECTION: IntakeSection = {
  id: "current-health",
  title: "Where you are now",
  blurb: "So your coach and provider start from the right place.",
  questions: [
    {
      id: "family-cardiac-history",
      prompt: "Any family history of heart disease or early cardiac death?",
      kind: "long-text",
      required: true,
    },
    {
      id: "pregnant-or-trying",
      prompt: "Are you pregnant, breastfeeding, or trying to conceive?",
      kind: "yes-no",
      required: true,
      appliesTo: "female",
    },
  ],
};

export const INTAKE_FORM_V1: IntakeFormDefinition = {
  formId: "alpha-medical-history",
  version: "v1",
  publishedOn: "2026-07-21",
  // Honest null. Nathalie Callahan's review and Stephanie Butler's sign-off are
  // both outstanding as of publication; claiming approval that has not happened
  // is the exact class of untrue assertion this codebase is being cleaned of.
  approvedBy: null,
  sections: [MUST_KNOW_SECTION, MEDICATIONS_SECTION, CURRENT_HEALTH_SECTION],
};

/** The version new intakes are served. The only thing that moves on a revision. */
export const CURRENT_FORM_VERSION = INTAKE_FORM_V1;

const REGISTRY: Record<string, IntakeFormDefinition> = {
  [INTAKE_FORM_V1.version]: INTAKE_FORM_V1,
};

/**
 * Look up the version a submission answered.
 *
 * Returns null for an unknown version rather than falling back to current — a
 * submission that answered a form we can no longer produce must be readable as
 * exactly that, not silently reinterpreted against today's questions.
 */
export function formVersion(version: string): IntakeFormDefinition | null {
  return REGISTRY[version] ?? null;
}

/**
 * SHA-256 over the questions actually asked.
 *
 * Same argument as `consent.textSha256`: a version STRING proves nothing if the
 * document behind that string can be edited. The hash makes an edit detectable.
 * Computed over a canonical projection — ids, prompts, kinds, requiredness —
 * so cosmetic help-text edits and substantive question changes are
 * distinguishable from each other.
 */
export function formSha256(def: IntakeFormDefinition): string {
  const canonical = JSON.stringify({
    formId: def.formId,
    version: def.version,
    sections: def.sections.map((s) => ({
      id: s.id,
      questions: s.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        kind: q.kind,
        required: q.required,
        mustKnow: q.mustKnow ?? false,
        fields: q.fields?.map((f) => f.id) ?? null,
      })),
    })),
  });
  return sha256(canonical);
}

/** Every question, flattened, in presentation order. */
export function allQuestions(def: IntakeFormDefinition): IntakeQuestion[] {
  return def.sections.flatMap((s) => s.questions);
}

/** The five. Surfaced at the top of the nurse and provider views. */
export function mustKnowQuestions(def: IntakeFormDefinition): IntakeQuestion[] {
  return allQuestions(def).filter((q) => q.mustKnow);
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export interface ValidationProblem {
  questionId: string;
  prompt: string;
  message: string;
  mustKnow: boolean;
}

/**
 * Validate answers against the definition they claim to answer.
 *
 * SERVER-SIDE, AND THE REASON IS THE SAME EVERY TIME. The wizard can and should
 * check as it goes, but a browser check is a courtesy — the submission endpoint
 * is public (it is the one part of Apex reachable without authentication), so
 * anything that must be true has to be enforced here.
 *
 * A blank string is not an answer. "None" is. That distinction matters
 * clinically: for allergies, `noKnownAllergies` is a positive statement a
 * clinician relies on, and an empty box is the absence of a conversation.
 */
export function validateSubmission(
  def: IntakeFormDefinition,
  answers: Record<string, unknown>,
  track?: "male" | "female",
): ValidationProblem[] {
  const problems: ValidationProblem[] = [];

  for (const q of allQuestions(def)) {
    if (q.appliesTo && track && q.appliesTo !== track) continue;

    if (q.showWhen) {
      const gate = answers[q.showWhen.questionId];
      if (gate !== q.showWhen.equals) continue;
    }

    if (!q.required) continue;

    const value = answers[q.id];
    let missing = false;

    switch (q.kind) {
      case "yes-no":
        missing = typeof value !== "boolean";
        break;
      case "repeating":
        // An empty list IS a valid answer to "what surgeries have you had" —
        // "none" is information. What is not valid is never reaching the
        // question, which is the `undefined` case.
        missing = !Array.isArray(value);
        if (!missing && q.fields?.some((field) => field.required)) {
          const rows = value as unknown[];
          missing = rows.some((row) => {
            if (!row || typeof row !== "object") return true;
            const record = row as Record<string, unknown>;
            return q.fields!.some((field) => {
              const fieldValue = record[field.id];
              return field.required && (typeof fieldValue !== "string" || !fieldValue.trim());
            });
          });
        }
        break;
      case "multi-select":
        missing = !Array.isArray(value);
        break;
      default:
        missing = typeof value !== "string" || value.trim().length === 0;
    }

    if (missing) {
      problems.push({
        questionId: q.id,
        prompt: q.prompt,
        message: q.mustKnow
          ? "This is one of the five we ask every patient. It cannot be left blank — if the answer is none, say none."
          : "This question is required.",
        mustKnow: q.mustKnow ?? false,
      });
    }
  }

  return problems;
}
