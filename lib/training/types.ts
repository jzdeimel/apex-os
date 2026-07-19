/**
 * COACH TRAINING & CERTIFICATION — types.
 *
 * Alpha Health coaches sit next to prescription therapy every day. They field
 * questions about GLP-1 side effects, testosterone dosing, peptide cycles and
 * lab numbers, from members who assume anyone in a clinic polo can answer.
 * Most of those questions a coach should answer. A few they must not — and the
 * difference is not intuition, it is training.
 *
 * That makes this module a compliance artifact as much as an education one.
 * Hence: a fixed pass mark, an expiry, and a ledger row on completion. If a
 * regulator, a malpractice carrier or a plaintiff ever asks "what did you
 * train this coach on, and when," the answer is a hash-chained record, not
 * somebody's memory of a Tuesday meeting.
 */

export type QuizId =
  | "peptide-basics"
  | "glp1"
  | "trt-fundamentals"
  | "womens-hormone-health"
  | "lab-literacy"
  | "scope-of-practice";

export type QuizCategory =
  | "Pharmacology"
  | "Clinical literacy"
  | "Compliance";

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  /** Exactly one. Multi-select would let a coach half-know and still pass. */
  correctOptionId: string;
  /**
   * Shown after answering, right or wrong.
   *
   * This is the actual teaching surface — the questions are only the delivery
   * mechanism. It explains why the right answer is right AND why the tempting
   * wrong answer is tempting, because "wrong, try again" teaches nothing and a
   * coach who guessed correctly learned nothing either.
   */
  explanation: string;
}

export interface Quiz {
  id: QuizId;
  title: string;
  category: QuizCategory;
  /** One line: what a coach can do after passing that they couldn't before. */
  summary: string;
  /** Why this material is on the list at all. */
  whyItMatters: string;
  estimatedMinutes: number;
  questions: QuizQuestion[];
  /**
   * Required for every coach vs. recommended. Scope of practice is required
   * and non-negotiable — it is the only quiz whose failure is a supervision
   * issue rather than a training gap.
   */
  required: boolean;
}

/** 80%+ — 4 of 5. Fixed in one place so no surface can disagree about it. */
export const PASS_THRESHOLD = 0.8;

/** Certifications expire annually. Knowledge decays; the drugs change faster. */
export const CERT_VALID_DAYS = 365;

/** Inside this window the badge is still valid but the coach must re-sit. */
export const EXPIRING_SOON_DAYS = 45;

export type CertificationState =
  | "certified"
  | "expiring"
  | "expired"
  | "failed"
  | "not-started";

export interface QuizAttempt {
  quizId: QuizId;
  coachId: string;
  /** Correct answers out of `total`. */
  correct: number;
  total: number;
  takenOn: string;
  passed: boolean;
}

export interface Certification {
  quizId: QuizId;
  coachId: string;
  state: CertificationState;
  /** Best passing attempt score as a 0–1 fraction. Undefined if never passed. */
  score?: number;
  earnedOn?: string;
  expiresOn?: string;
  /** Negative once expired — the sign is the whole message. */
  daysUntilExpiry?: number;
  lastAttempt?: QuizAttempt;
}

export interface CoachTrainingStatus {
  coachId: string;
  certifications: Certification[];
  /** Passed and unexpired, out of all quizzes. */
  certifiedCount: number;
  totalQuizzes: number;
  /** 0–100, for the progress ring. */
  completionPercent: number;
  /** Certified-but-expiring, soonest first. */
  expiringSoon: Certification[];
  /** Expired or never passed, required ones first. */
  outstanding: Certification[];
  /** True only when every REQUIRED quiz is currently certified. */
  compliant: boolean;
}

export function stateLabel(state: CertificationState): string {
  switch (state) {
    case "certified":
      return "Certified";
    case "expiring":
      return "Recert due";
    case "expired":
      return "Expired";
    case "failed":
      return "Did not pass";
    case "not-started":
      return "Not started";
  }
}

export function stateTone(
  state: CertificationState,
): "optimal" | "watch" | "high" | "neutral" {
  switch (state) {
    case "certified":
      return "optimal";
    case "expiring":
      return "watch";
    case "expired":
    case "failed":
      return "high";
    case "not-started":
      return "neutral";
  }
}
