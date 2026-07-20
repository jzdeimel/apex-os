import type { QuizId } from "@/lib/training/types";
import { quizMap, quizzes } from "@/lib/training/quizzes";
import { trainingStatusFor } from "@/lib/mock/training";
import { coaches, staffMap, staffName } from "@/lib/mock/staff";
import { appendLedger } from "@/lib/trace/ledger";
import { VIEWER } from "@/lib/viewer";
import { seededRandom, absolute } from "@/lib/utils";

/**
 * NEW COACH ONBOARDING — the checklist, and who is actually through it.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CERTIFICATION STEPS ARE NOT SELF-ATTESTED
 * ---------------------------------------------------------------------------
 * Most onboarding checklists are a list of boxes a manager ticks. That is fine
 * for "issued a badge" and useless for "understands scope of practice", because
 * the tick records that somebody believed the coach was ready, not that the
 * coach demonstrated anything.
 *
 * So this checklist has two kinds of step and they behave differently:
 *
 *   ATTESTED — a person confirms it happened (laptop issued, shadowed a
 *              consult). Completion is a claim, recorded with who claimed it.
 *   EVIDENCED — completion is derived from `lib/mock/training.ts`, which
 *              derives it from a passed, unexpired quiz attempt. Nobody can
 *              tick it. A manager who wants it green has to send the coach to
 *              sit the quiz.
 *
 * An evidenced step can also go BACKWARDS — an annual certification lapses and
 * the step reopens on its own. A checklist where completion is permanent will
 * show a fully-onboarded coach whose scope-of-practice certification expired
 * eight months ago, which is the state that costs a clinic a license.
 *
 * ---------------------------------------------------------------------------
 * WHY SCOPE OF PRACTICE IS A BLOCKER AND THE REST ARE NOT
 * ---------------------------------------------------------------------------
 * Coaches sit next to prescription therapy all day and members assume anyone in
 * a clinic polo can answer a dosing question. A coach who has not demonstrated
 * where their scope ends is not a training gap, they are a liability with a
 * caseload. `blocksCaseload` marks the steps that must be complete before a
 * coach is assigned members, and `readyForCaseload` is the only status this
 * module lets a page render as a go/no-go.
 */

/** Pinned clock. */
const NOW_DATE = "2026-06-12";
const DAY_MS = 86_400_000;

export type StepKind = "attested" | "evidenced";

export type StepCategory =
  | "Access & equipment"
  | "Compliance"
  | "Clinical literacy"
  | "Shadowing"
  | "Caseload";

export interface OnboardingStep {
  id: string;
  title: string;
  /** What "done" means, concretely enough that two managers agree. */
  definitionOfDone: string;
  category: StepCategory;
  kind: StepKind;
  /** Evidenced steps only — the certification that satisfies this step. */
  quizId?: QuizId;
  /** Target days from start date. Overdue is measured against this. */
  dueByDay: number;
  /** No members may be assigned until every blocker is complete. */
  blocksCaseload: boolean;
  owner: "Coach" | "Manager" | "Ops";
}

/**
 * The checklist.
 *
 * Ordered by when it has to happen, not by importance — a manager works this
 * top to bottom on a Monday morning and reordering by severity would put "sit
 * the scope-of-practice quiz" above "has a login", which is not a sequence a
 * human can execute.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "ob-account",
    title: "Apex account provisioned",
    definitionOfDone: "Entra account created, role set to Coach, location scope assigned.",
    category: "Access & equipment",
    kind: "attested",
    dueByDay: 1,
    blocksCaseload: true,
    owner: "Ops",
  },
  {
    id: "ob-hipaa",
    title: "HIPAA & privacy acknowledgement signed",
    definitionOfDone: "Signed acknowledgement on file, countersigned, dated.",
    category: "Compliance",
    kind: "attested",
    dueByDay: 2,
    blocksCaseload: true,
    owner: "Manager",
  },
  {
    id: "ob-scope",
    title: "Scope of practice certification",
    definitionOfDone: `Passed "${quizMap["scope-of-practice"].title}" at 80% or above, unexpired.`,
    category: "Compliance",
    kind: "evidenced",
    quizId: "scope-of-practice",
    dueByDay: 5,
    blocksCaseload: true,
    owner: "Coach",
  },
  {
    id: "ob-shadow-consult",
    title: "Shadow three provider consults",
    definitionOfDone: "Three consults observed end to end, with the provider's sign-off on each.",
    category: "Shadowing",
    kind: "attested",
    dueByDay: 10,
    blocksCaseload: false,
    owner: "Manager",
  },
  {
    id: "ob-lab-literacy",
    title: "Lab literacy certification",
    definitionOfDone: `Passed "${quizMap["lab-literacy"].title}" at 80% or above, unexpired.`,
    category: "Clinical literacy",
    kind: "evidenced",
    quizId: "lab-literacy",
    dueByDay: 14,
    blocksCaseload: true,
    owner: "Coach",
  },
  {
    id: "ob-peptides",
    title: "Peptide fundamentals certification",
    definitionOfDone: `Passed "${quizMap["peptide-basics"].title}" at 80% or above, unexpired.`,
    category: "Clinical literacy",
    kind: "evidenced",
    quizId: "peptide-basics",
    dueByDay: 21,
    blocksCaseload: false,
    owner: "Coach",
  },
  {
    id: "ob-glp1",
    title: "GLP-1 certification",
    definitionOfDone: `Passed "${quizMap["glp1"].title}" at 80% or above, unexpired.`,
    category: "Clinical literacy",
    kind: "evidenced",
    quizId: "glp1",
    dueByDay: 21,
    blocksCaseload: false,
    owner: "Coach",
  },
  {
    id: "ob-trt",
    title: "TRT fundamentals certification",
    definitionOfDone: `Passed "${quizMap["trt-fundamentals"].title}" at 80% or above, unexpired.`,
    category: "Clinical literacy",
    kind: "evidenced",
    quizId: "trt-fundamentals",
    dueByDay: 30,
    blocksCaseload: false,
    owner: "Coach",
  },
  {
    id: "ob-womens",
    title: "Women's hormone health certification",
    definitionOfDone: `Passed "${quizMap["womens-hormone-health"].title}" at 80% or above, unexpired.`,
    category: "Clinical literacy",
    kind: "evidenced",
    quizId: "womens-hormone-health",
    dueByDay: 30,
    blocksCaseload: false,
    owner: "Coach",
  },
  {
    id: "ob-first-plan",
    title: "First plan review observed",
    definitionOfDone: "Coach runs a plan review with a manager present; manager signs off.",
    category: "Shadowing",
    kind: "attested",
    dueByDay: 30,
    blocksCaseload: false,
    owner: "Manager",
  },
  {
    id: "ob-caseload",
    title: "Caseload assigned",
    definitionOfDone: "Members transferred onto the coach in Apex, with the outgoing coach's handoff notes.",
    category: "Caseload",
    kind: "attested",
    dueByDay: 35,
    blocksCaseload: false,
    owner: "Manager",
  },
];

export const STEP_BY_ID: Record<string, OnboardingStep> = Object.fromEntries(
  ONBOARDING_STEPS.map((s) => [s.id, s]),
);

/** Steps that gate a caseload, exported so a page cannot invent its own list. */
export const BLOCKING_STEP_IDS: string[] = ONBOARDING_STEPS.filter(
  (s) => s.blocksCaseload,
).map((s) => s.id);

export type StepState = "complete" | "in-progress" | "not-started" | "lapsed" | "overdue";

export interface StepStatus {
  step: OnboardingStep;
  state: StepState;
  /** Attested steps: who ticked it. Evidenced steps: the certification date. */
  evidence?: string;
  completedOn?: string;
  /** Days past `dueByDay`. Zero or negative means on time. */
  daysOverdue: number;
}

export interface CoachOnboarding {
  coachId: string;
  coachName: string;
  /** Day the coach started. Everything is measured from here. */
  startedOn: string;
  daysSinceStart: number;
  steps: StepStatus[];
  completeCount: number;
  totalCount: number;
  percent: number;
  /** Every blocking step complete. The only go/no-go this module exposes. */
  readyForCaseload: boolean;
  blockingOutstanding: StepStatus[];
  overdue: StepStatus[];
}

/**
 * Start dates.
 *
 * Deterministic per coach — a tenured coach and a coach in week two produce
 * completely different-looking checklists, and a roster where everyone started
 * on the same day teaches an operator nothing about how the screen behaves.
 */
function startDateFor(coachId: string): string {
  const rand = seededRandom(`apex-onboarding-start:${coachId}`);
  // A spread from a few days ago to a couple of years. Most staff are tenured.
  const daysAgo = rand() < 0.25 ? 3 + Math.floor(rand() * 40) : 120 + Math.floor(rand() * 620);
  const d = absolute(absolute(`${NOW_DATE}T00:00:00`).getTime() - daysAgo * DAY_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Attested completion.
 *
 * Seeded, but weighted by how far past the due date the coach is: a step that
 * came due eighteen months ago is almost certainly done, and one due yesterday
 * probably is not. Flat probability produces a checklist where a two-year coach
 * is missing their laptop, which reads as broken data rather than as a finding.
 */
function attestedComplete(coachId: string, stepId: string, daysSinceStart: number, dueByDay: number): boolean {
  const rand = seededRandom(`apex-onboarding:${coachId}:${stepId}`);
  if (daysSinceStart < dueByDay * 0.5) return false;
  const overdueRatio = daysSinceStart / Math.max(1, dueByDay);
  const p = Math.min(0.97, 0.35 + overdueRatio * 0.28);
  return rand() < p;
}

function attestorFor(coachId: string, stepId: string): string {
  const rand = seededRandom(`apex-onboarding-attestor:${coachId}:${stepId}`);
  const managers = ["st-009", "st-010", "st-012"];
  return managers[Math.floor(rand() * managers.length)];
}

function completionDate(startedOn: string, dueByDay: number, coachId: string, stepId: string): string {
  const rand = seededRandom(`apex-onboarding-date:${coachId}:${stepId}`);
  // Completed somewhere between half the target window and 1.6x it.
  const day = Math.round(dueByDay * (0.5 + rand() * 1.1));
  const d = absolute(absolute(`${startedOn}T00:00:00`).getTime() + day * DAY_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * One coach's onboarding.
 *
 * `sessionCompleted` carries steps ticked live in this session, and
 * `sessionAttempts` is threaded straight through to `trainingStatusFor` so a
 * quiz passed in the training surface turns its onboarding step green without a
 * reload. The demo has no database; in production both parameters disappear and
 * this reads from the onboarding and attempts tables.
 */
export function onboardingFor(
  coachId: string,
  sessionCompleted: Set<string> = new Set(),
  nowIso: string = `${NOW_DATE}T09:00:00`,
): CoachOnboarding {
  const startedOn = startDateFor(coachId);
  const daysSinceStart = Math.round(
    (absolute(nowIso).getTime() - absolute(`${startedOn}T00:00:00`).getTime()) / DAY_MS,
  );
  const training = trainingStatusFor(coachId, [], nowIso);

  const steps: StepStatus[] = ONBOARDING_STEPS.map((step) => {
    const daysOverdue = Math.max(0, daysSinceStart - step.dueByDay);

    if (step.kind === "evidenced" && step.quizId) {
      const cert = training.certifications.find((c) => c.quizId === step.quizId);
      const state: StepState =
        cert?.state === "certified" || cert?.state === "expiring"
          ? "complete"
          : cert?.state === "expired"
            ? "lapsed"
            : cert?.state === "failed"
              ? "in-progress"
              : daysOverdue > 0
                ? "overdue"
                : "not-started";

      return {
        step,
        state,
        completedOn: cert?.earnedOn,
        evidence:
          state === "complete"
            ? `Certified ${cert?.earnedOn} · expires ${cert?.expiresOn} · score ${Math.round((cert?.score ?? 0) * 100)}%`
            : state === "lapsed"
              ? `Certification expired ${cert?.expiresOn}. Reopened automatically — this step is not permanent.`
              : state === "in-progress"
                ? `Last attempt ${cert?.lastAttempt?.correct}/${cert?.lastAttempt?.total} on ${cert?.lastAttempt?.takenOn} — below the 80% bar.`
                : "Never sat.",
        daysOverdue: state === "complete" ? 0 : daysOverdue,
      };
    }

    const done =
      sessionCompleted.has(step.id) ||
      attestedComplete(coachId, step.id, daysSinceStart, step.dueByDay);

    if (!done) {
      return {
        step,
        state: daysOverdue > 0 ? "overdue" : "not-started",
        daysOverdue,
      };
    }

    const completedOn = sessionCompleted.has(step.id)
      ? NOW_DATE
      : completionDate(startedOn, step.dueByDay, coachId, step.id);

    return {
      step,
      state: "complete",
      completedOn,
      evidence: sessionCompleted.has(step.id)
        ? `Attested by ${VIEWER.name} on ${NOW_DATE}`
        : `Attested by ${staffName(attestorFor(coachId, step.id))} on ${completedOn}`,
      daysOverdue: 0,
    };
  });

  const completeCount = steps.filter((s) => s.state === "complete").length;
  const blockingOutstanding = steps.filter(
    (s) => s.step.blocksCaseload && s.state !== "complete",
  );

  return {
    coachId,
    coachName: staffName(coachId),
    startedOn,
    daysSinceStart,
    steps,
    completeCount,
    totalCount: steps.length,
    percent: Math.round((completeCount / steps.length) * 100),
    readyForCaseload: blockingOutstanding.length === 0,
    blockingOutstanding,
    overdue: steps
      .filter((s) => s.state !== "complete" && s.daysOverdue > 0)
      .sort((a, b) => b.daysOverdue - a.daysOverdue),
  };
}

/**
 * Team view.
 *
 * Sorted so the coaches who cannot hold a caseload are first, then by how far
 * behind they are. A training lead opens this to find who needs chasing, and a
 * list sorted alphabetically makes them read all twenty rows to find the two.
 */
export function teamOnboarding(
  sessionCompleted: Record<string, Set<string>> = {},
): CoachOnboarding[] {
  return coaches
    .map((c) => onboardingFor(c.id, sessionCompleted[c.id] ?? new Set()))
    .sort(
      (a, b) =>
        Number(a.readyForCaseload) - Number(b.readyForCaseload) ||
        b.blockingOutstanding.length - a.blockingOutstanding.length ||
        a.percent - b.percent ||
        a.coachName.localeCompare(b.coachName),
    );
}

/**
 * Record an attestation.
 *
 * Attested steps produce a ledger row because an attestation is a claim by a
 * named person that something happened, and the whole reason to prefer evidence
 * over attestation is that attestations need to be attributable. Evidenced
 * steps do not call this — their ledger row is written when the quiz is passed.
 */
export function attestStep(coachId: string, stepId: string) {
  const step = STEP_BY_ID[stepId];
  if (!step) throw new Error(`Unknown onboarding step: ${stepId}`);
  if (step.kind === "evidenced") {
    throw new Error(
      `${step.title} is evidenced by certification and cannot be attested. Send the coach to sit the quiz.`,
    );
  }
  return appendLedger({
    actorId: VIEWER.id,
    actorName: VIEWER.name,
    actorRole: VIEWER.role,
    action: "sign",
    entity: "note",
    entityId: `${coachId}:${stepId}`,
    reason: `Onboarding attestation — ${step.title}`,
    after: {
      coachId,
      coachName: staffName(coachId),
      stepId,
      step: step.title,
      definitionOfDone: step.definitionOfDone,
      blocksCaseload: step.blocksCaseload,
    },
  });
}

/** Roll-up for the header strip. */
export function onboardingSummary(rows: CoachOnboarding[]) {
  return {
    coaches: rows.length,
    ready: rows.filter((r) => r.readyForCaseload).length,
    blocked: rows.filter((r) => !r.readyForCaseload).length,
    overdueSteps: rows.reduce((n, r) => n + r.overdue.length, 0),
    lapsedCerts: rows.reduce(
      (n, r) => n + r.steps.filter((s) => s.state === "lapsed").length,
      0,
    ),
    totalQuizzes: quizzes.length,
  };
}

export { staffMap };
