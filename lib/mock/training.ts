import type {
  Certification,
  CertificationState,
  CoachTrainingStatus,
  QuizAttempt,
  QuizId,
} from "@/lib/training/types";
import {
  CERT_VALID_DAYS,
  EXPIRING_SOON_DAYS,
  PASS_THRESHOLD,
} from "@/lib/training/types";
import { quizzes, quizMap } from "@/lib/training/quizzes";
import { coaches } from "@/lib/mock/staff";
import { seededRandom, absolute } from "@/lib/utils";

/**
 * Training history for the coaching team.
 *
 * Deterministic, seeded per coach and quiz, pinned to NOW = 2026-06-12. The
 * distribution is deliberately imperfect: some coaches are fully certified,
 * several have a lapsed badge, and at least one has an expiring required
 * certification. A training dashboard where everyone is green teaches an
 * operator nothing about how the surface behaves on the day it matters.
 */

export const NOW = "2026-06-12T09:00:00";
const NOW_DATE = "2026-06-12";
const DAY_MS = 1000 * 60 * 60 * 24;

function addDays(iso: string, days: number): string {
  const d = absolute(absolute(iso).getTime() + days * DAY_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (absolute(toIso).getTime() - absolute(fromIso).getTime()) / DAY_MS,
  );
}

/**
 * Generate one coach's history with one quiz.
 *
 * Returns null when the coach has never sat it — a real training record has
 * holes, and "not started" is a distinct and actionable state from "failed."
 */
function attemptFor(coachId: string, quizId: QuizId): QuizAttempt | null {
  const quiz = quizMap[quizId];
  const rand = seededRandom(`training:${coachId}:${quizId}`);
  const roll = rand();

  // Required quizzes get sat far more reliably — that is what "required" means
  // in a functioning clinic, and the gaps that remain are the interesting ones.
  const takenChance = quiz.required ? 0.93 : 0.72;
  if (roll > takenChance) return null;

  const total = quiz.questions.length;
  const scoreRoll = rand();
  // Most people who sit it pass. A meaningful minority land at 3/5 — one below
  // the 80% bar — which is the score that produces the most useful screen.
  const correct =
    scoreRoll < 0.46 ? total : scoreRoll < 0.82 ? total - 1 : total - 2;

  // Taken somewhere in the last ~14 months, so a share of passes have already
  // aged past the annual expiry.
  const daysAgo = 20 + Math.floor(rand() * 400);
  const takenOn = addDays(NOW_DATE, -daysAgo);

  return {
    quizId,
    coachId,
    correct,
    total,
    takenOn,
    passed: correct / total >= PASS_THRESHOLD,
  };
}

export const attempts: QuizAttempt[] = coaches.flatMap((c) =>
  quizzes
    .map((q) => attemptFor(c.id, q.id))
    .filter((a): a is QuizAttempt => a !== null),
);

/**
 * Turn an attempt into a certification.
 *
 * The state machine is small and the ordering is the point: expiry is checked
 * before pass/fail is reported, because a certification that lapsed eleven
 * months after a perfect score is exactly as invalid as one never earned —
 * and a dashboard that shows it green because the score was 100% is worse
 * than no dashboard.
 */
export function certificationFor(
  coachId: string,
  quizId: QuizId,
  attempt: QuizAttempt | null | undefined,
  nowIso: string = NOW,
): Certification {
  if (!attempt) {
    return { quizId, coachId, state: "not-started" };
  }
  if (!attempt.passed) {
    return {
      quizId,
      coachId,
      state: "failed",
      score: attempt.correct / attempt.total,
      lastAttempt: attempt,
    };
  }

  const expiresOn = addDays(attempt.takenOn, CERT_VALID_DAYS);
  const daysUntilExpiry = daysBetween(nowIso.slice(0, 10), expiresOn);

  let state: CertificationState;
  if (daysUntilExpiry < 0) state = "expired";
  else if (daysUntilExpiry <= EXPIRING_SOON_DAYS) state = "expiring";
  else state = "certified";

  return {
    quizId,
    coachId,
    state,
    score: attempt.correct / attempt.total,
    earnedOn: attempt.takenOn,
    expiresOn,
    daysUntilExpiry,
    lastAttempt: attempt,
  };
}

function bestAttempt(
  coachId: string,
  quizId: QuizId,
  extra: QuizAttempt[],
): QuizAttempt | null {
  const pool = [
    ...attempts.filter((a) => a.coachId === coachId && a.quizId === quizId),
    ...extra.filter((a) => a.coachId === coachId && a.quizId === quizId),
  ];
  if (pool.length === 0) return null;
  // Most recent wins, not best-ever. A certification asserts current
  // competence; letting a two-year-old perfect score outrank a recent 3/5
  // would make the badge a trophy instead of a control.
  return pool.reduce((a, b) => (b.takenOn >= a.takenOn ? b : a));
}

/**
 * A coach's full training status.
 *
 * `sessionAttempts` carries quizzes completed live in this session. The demo
 * has no database, so a completion has to be threaded in from component state
 * rather than persisted — in production this reads from the attempts table and
 * the parameter disappears.
 */
export function trainingStatusFor(
  coachId: string,
  sessionAttempts: QuizAttempt[] = [],
  nowIso: string = NOW,
): CoachTrainingStatus {
  const certifications = quizzes.map((q) =>
    certificationFor(coachId, q.id, bestAttempt(coachId, q.id, sessionAttempts), nowIso),
  );

  const certifiedCount = certifications.filter(
    (c) => c.state === "certified" || c.state === "expiring",
  ).length;

  const expiringSoon = certifications
    .filter((c) => c.state === "expiring")
    .sort((a, b) => (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0));

  const outstanding = certifications
    .filter(
      (c) =>
        c.state === "expired" || c.state === "failed" || c.state === "not-started",
    )
    .sort((a, b) => {
      const req = (id: QuizId) => (quizMap[id].required ? 0 : 1);
      return req(a.quizId) - req(b.quizId) || a.quizId.localeCompare(b.quizId);
    });

  const compliant = quizzes
    .filter((q) => q.required)
    .every((q) => {
      const cert = certifications.find((c) => c.quizId === q.id);
      return cert?.state === "certified" || cert?.state === "expiring";
    });

  return {
    coachId,
    certifications,
    certifiedCount,
    totalQuizzes: quizzes.length,
    completionPercent: Math.round((certifiedCount / quizzes.length) * 100),
    expiringSoon,
    outstanding,
    compliant,
  };
}

/** Team roll-up — what a training lead looks at first. */
export interface TeamTrainingRow {
  coachId: string;
  coachName: string;
  status: CoachTrainingStatus;
}

export function teamTrainingStatus(nowIso: string = NOW): TeamTrainingRow[] {
  return coaches
    .map((c) => ({
      coachId: c.id,
      coachName: c.name,
      status: trainingStatusFor(c.id, [], nowIso),
    }))
    .sort(
      (a, b) =>
        Number(a.status.compliant) - Number(b.status.compliant) ||
        a.status.completionPercent - b.status.completionPercent ||
        a.coachName.localeCompare(b.coachName),
    );
}

/** Build the attempt record for a quiz just completed in the UI. */
export function makeAttempt(
  coachId: string,
  quizId: QuizId,
  correct: number,
  total: number,
  takenOn: string = NOW_DATE,
): QuizAttempt {
  return {
    coachId,
    quizId,
    correct,
    total,
    takenOn,
    passed: correct / total >= PASS_THRESHOLD,
  };
}
