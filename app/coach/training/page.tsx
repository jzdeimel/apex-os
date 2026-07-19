"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
  Select,
} from "@/components/ui/primitives";
import { FadeIn, Stagger, StaggerItem, SwitchView } from "@/components/motion";
import { useToast } from "@/components/ui/Toast";
import { coaches, staffName } from "@/lib/mock/staff";
import { appendLedger } from "@/lib/trace/ledger";
import { quizzes, quizMap } from "@/lib/training/quizzes";
import {
  PASS_THRESHOLD,
  stateLabel,
  stateTone,
  type Certification,
  type Quiz,
  type QuizAttempt,
  type QuizId,
} from "@/lib/training/types";
import { makeAttempt, trainingStatusFor } from "@/lib/mock/training";
import { cn, formatDate } from "@/lib/utils";

/**
 * COACH TRAINING & CERTIFICATION.
 *
 * Two jobs on one page. The first is a compliance surface: what is certified,
 * what expires when, what is outstanding. The second is the actual teaching —
 * and the teaching lives in the explanation shown after every answer, not in
 * the score.
 *
 * That is why the quiz never advances silently on a correct answer. Right or
 * wrong, the explanation appears and the coach has to read past it, because a
 * coach who guessed correctly has learned exactly as much as one who guessed
 * wrong: nothing.
 */

/** Which coach this page is rendered as. Switchable for the demo. */
const DEFAULT_COACH_ID = "st-005";

type Mode =
  | { kind: "overview" }
  | { kind: "quiz"; quizId: QuizId }
  | { kind: "result"; quizId: QuizId; attempt: QuizAttempt };

export default function CoachTrainingPage() {
  const { toast } = useToast();
  const [coachId, setCoachId] = useState(DEFAULT_COACH_ID);
  const [mode, setMode] = useState<Mode>({ kind: "overview" });
  // Attempts completed live in this session. No database in the demo — in
  // production these are rows and this state does not exist.
  const [sessionAttempts, setSessionAttempts] = useState<QuizAttempt[]>([]);

  const status = useMemo(
    () => trainingStatusFor(coachId, sessionAttempts),
    [coachId, sessionAttempts],
  );

  function completeQuiz(quiz: Quiz, correct: number) {
    const attempt = makeAttempt(coachId, quiz.id, correct, quiz.questions.length);
    setSessionAttempts((prev) => [...prev, attempt]);

    // A completed certification is an assertion the clinic may later have to
    // defend, so it gets a hash-chained row like anything else. Entity is
    // `session` rather than a new value — the ledger's entity vocabulary is
    // closed and owned elsewhere, and inventing a string no view filters on is
    // precisely the mistake that hides records.
    appendLedger({
      actorId: coachId,
      actorName: staffName(coachId),
      actorRole: "Coach",
      action: "create",
      entity: "session",
      entityId: `training:${quiz.id}`,
      reason: `Completed "${quiz.title}"`,
      after: {
        quiz: quiz.title,
        score: `${correct}/${quiz.questions.length}`,
        passed: attempt.passed,
        threshold: `${Math.round(PASS_THRESHOLD * 100)}%`,
      },
    });

    setMode({ kind: "result", quizId: quiz.id, attempt });
    toast(attempt.passed ? "Certification earned" : "Not a pass this time", {
      desc: `${quiz.title} — ${correct}/${quiz.questions.length}`,
      tone: attempt.passed ? "success" : "warn",
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <FadeIn>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="label-eyebrow">COACH DEVELOPMENT</p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-50">
              Training &amp; certification
            </h1>
            <p className="mt-1 text-sm text-ink-400">
              What an Alpha Health coach has to know — and the line, tested honestly, between
              coaching and practising medicine.
            </p>
          </div>
          <div className="w-full sm:w-56">
            <label className="label-eyebrow mb-1.5 block">Viewing as</label>
            <Select
              value={coachId}
              onChange={(e) => {
                setCoachId(e.target.value);
                setMode({ kind: "overview" });
              }}
            >
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </FadeIn>

      <SwitchView k={mode.kind + ("quizId" in mode ? mode.quizId : "")} className="mt-6">
        {mode.kind === "overview" && (
          <Overview
            status={status}
            onOpen={(quizId) => setMode({ kind: "quiz", quizId })}
          />
        )}

        {mode.kind === "quiz" && (
          <QuizRunner
            quiz={quizMap[mode.quizId]}
            onExit={() => setMode({ kind: "overview" })}
            onComplete={completeQuiz}
          />
        )}

        {mode.kind === "result" && (
          <ResultPanel
            quiz={quizMap[mode.quizId]}
            attempt={mode.attempt}
            onRetake={() => setMode({ kind: "quiz", quizId: mode.quizId })}
            onDone={() => setMode({ kind: "overview" })}
          />
        )}
      </SwitchView>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function Overview({
  status,
  onOpen,
}: {
  status: ReturnType<typeof trainingStatusFor>;
  onOpen: (id: QuizId) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Standing --------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-5 p-5">
            <CertRing percent={status.completionPercent} compliant={status.compliant} />
            <div className="min-w-0">
              <p className="label-eyebrow">Certifications</p>
              <p className="stat-mono mt-1 text-lg font-semibold text-ink-50">
                {status.certifiedCount} / {status.totalQuizzes}
              </p>
              <Badge tone={status.compliant ? "optimal" : "high"} className="mt-1.5">
                {status.compliant ? "Compliant" : "Required cert missing"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center gap-2">
            <CalendarClock className="h-4 w-4 shrink-0 text-watch" />
            <CardTitle>What&apos;s expiring</CardTitle>
          </CardHeader>
          <CardContent>
            {status.expiringSoon.length === 0 ? (
              <p className="text-sm text-ink-400">
                Nothing lapses in the next 45 days. Certifications run for a year — the field
                moves faster than that, which is why they expire at all.
              </p>
            ) : (
              <ul className="space-y-2">
                {status.expiringSoon.map((c) => (
                  <li
                    key={c.quizId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-watch/25 bg-watch/5 px-3 py-2"
                  >
                    <span className="text-sm text-ink-100">{quizMap[c.quizId].title}</span>
                    <span className="stat-mono text-xs text-watch">
                      {c.daysUntilExpiry}d · expires {formatDate(c.expiresOn)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {status.outstanding.length > 0 && (
              <div className="mt-4 border-t border-ink-700/60 pt-3">
                <p className="label-eyebrow">Outstanding</p>
                <ul className="mt-2 space-y-1.5">
                  {status.outstanding.map((c) => (
                    <li key={c.quizId} className="flex flex-wrap items-center gap-2 text-sm">
                      <CircleAlert className="h-3.5 w-3.5 shrink-0 text-high" />
                      <span className="text-ink-200">{quizMap[c.quizId].title}</span>
                      <Badge tone={stateTone(c.state)}>{stateLabel(c.state)}</Badge>
                      {quizMap[c.quizId].required && <Badge tone="high">Required</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modules ---------------------------------------------------------- */}
      <div>
        <h2 className="font-display text-lg font-semibold text-ink-50">Modules</h2>
        <Stagger className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {quizzes.map((q) => {
            const cert = status.certifications.find((c) => c.quizId === q.id)!;
            return (
              <StaggerItem key={q.id}>
                <ModuleCard quiz={q} cert={cert} onOpen={() => onOpen(q.id)} />
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </div>
  );
}

function ModuleCard({
  quiz,
  cert,
  onOpen,
}: {
  quiz: Quiz;
  cert: Certification;
  onOpen: () => void;
}) {
  const earned = cert.state === "certified" || cert.state === "expiring";
  return (
    <Card className="card-hover flex h-full flex-col">
      <CardHeader className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {earned ? (
            <BadgeCheck
              className={cn(
                "h-4 w-4 shrink-0",
                cert.state === "certified" ? "text-optimal" : "text-watch",
              )}
            />
          ) : (
            <BookOpen className="h-4 w-4 shrink-0 text-ink-500" />
          )}
          <CardTitle>{quiz.title}</CardTitle>
          {quiz.required && <Badge tone="high">Required</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={stateTone(cert.state)}>{stateLabel(cert.state)}</Badge>
          <span className="text-[11px] text-ink-500">{quiz.category}</span>
          <span className="stat-mono text-[11px] text-ink-500">
            {quiz.questions.length} questions · ~{quiz.estimatedMinutes} min
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        <p className="text-sm text-ink-300">{quiz.summary}</p>
        <p className="mt-2 text-xs text-ink-500">
          <span className="text-ink-400">Why it matters. </span>
          {quiz.whyItMatters}
        </p>

        {cert.score !== undefined && (
          <p className="stat-mono mt-3 text-xs text-ink-400">
            Last score {Math.round(cert.score * 100)}%
            {cert.expiresOn && ` · valid to ${formatDate(cert.expiresOn)}`}
          </p>
        )}

        <div className="mt-4 pt-1">
          <Button variant={earned ? "outline" : "primary"} size="sm" onClick={onOpen}>
            {earned ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                Recertify
              </>
            ) : (
              <>
                Start module
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Quiz runner
// ---------------------------------------------------------------------------

function QuizRunner({
  quiz,
  onExit,
  onComplete,
}: {
  quiz: Quiz;
  onExit: () => void;
  onComplete: (quiz: Quiz, correct: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const question = quiz.questions[index];
  const answered = chosen !== null;
  const isCorrect = chosen === question.correctOptionId;
  const isLast = index === quiz.questions.length - 1;

  function choose(optionId: string) {
    if (answered) return;
    setChosen(optionId);
    if (optionId === question.correctOptionId) setCorrectCount((c) => c + 1);
  }

  function next() {
    if (isLast) {
      onComplete(quiz, correctCount);
      return;
    }
    setIndex((i) => i + 1);
    setChosen(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onExit}>
          <ArrowLeft className="h-3.5 w-3.5" />
          All modules
        </Button>
        <span className="stat-mono text-xs text-ink-500">
          {index + 1} / {quiz.questions.length}
        </span>
      </div>

      <Progress value={((index + (answered ? 1 : 0)) / quiz.questions.length) * 100} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{quiz.title}</CardTitle>
            {quiz.required && <Badge tone="high">Required</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-base text-ink-100">{question.prompt}</p>

          <div className="mt-4 space-y-2">
            {question.options.map((o) => {
              const isChosen = chosen === o.id;
              const isAnswer = o.id === question.correctOptionId;
              return (
                <button
                  key={o.id}
                  onClick={() => choose(o.id)}
                  disabled={answered}
                  className={cn(
                    "focus-ring flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
                    !answered && "border-ink-700 bg-ink-900/40 hover:border-ink-600",
                    answered && isAnswer && "border-optimal/50 bg-optimal/10",
                    answered && isChosen && !isAnswer && "border-high/50 bg-high/10",
                    answered && !isChosen && !isAnswer && "border-ink-800 bg-ink-900/20 opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "stat-mono mt-0.5 shrink-0 text-xs",
                      answered && isAnswer
                        ? "text-optimal"
                        : answered && isChosen
                          ? "text-high"
                          : "text-ink-500",
                    )}
                  >
                    {o.id.toUpperCase()}
                  </span>
                  <span className="min-w-0 text-ink-200">{o.text}</span>
                  {answered && isAnswer && (
                    <CheckCircle2 className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-optimal" />
                  )}
                  {answered && isChosen && !isAnswer && (
                    <XCircle className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-high" />
                  )}
                </button>
              );
            })}
          </div>

          {/* The teaching. Shown on right AND wrong — see the file header. */}
          {answered && (
            <div
              className={cn(
                "mt-4 rounded-xl border p-4",
                isCorrect ? "border-optimal/30 bg-optimal/5" : "border-watch/30 bg-watch/5",
              )}
            >
              <p
                className={cn(
                  "text-xs font-medium uppercase tracking-wide",
                  isCorrect ? "text-optimal" : "text-watch",
                )}
              >
                {isCorrect ? "Correct" : "Not quite"}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-200">
                {question.explanation}
              </p>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Button variant="primary" size="md" onClick={next} disabled={!answered}>
              {isLast ? "Finish module" : "Next question"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

function ResultPanel({
  quiz,
  attempt,
  onRetake,
  onDone,
}: {
  quiz: Quiz;
  attempt: QuizAttempt;
  onRetake: () => void;
  onDone: () => void;
}) {
  const pct = Math.round((attempt.correct / attempt.total) * 100);
  return (
    <Card className={attempt.passed ? "border-optimal/30" : "border-high/30"}>
      <CardContent className="p-6">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <CertRing percent={pct} compliant={attempt.passed} />
          <div className="min-w-0">
            <p className="label-eyebrow">{quiz.title}</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-ink-50">
              {attempt.passed ? "Certified" : "Below the pass mark"}
            </h2>
            <p className="stat-mono mt-1 text-sm text-ink-300">
              {attempt.correct} / {attempt.total} · {pct}% · pass mark{" "}
              {Math.round(PASS_THRESHOLD * 100)}%
            </p>
            <p className="mt-2 max-w-xl text-sm text-ink-400">
              {attempt.passed ? (
                <>
                  Valid for one year. A ledger row was written recording what you completed and
                  when — that record is what the clinic produces if anyone ever asks what this
                  coach was trained on.
                </>
              ) : (
                <>
                  Nothing is held against you for retaking this. The explanations are the point,
                  and the material below the pass mark is exactly the material worth re-reading
                  before you sit it again.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={onDone}>
            <ShieldCheck className="h-3.5 w-3.5" />
            Back to my certifications
          </Button>
          <Button variant="outline" size="sm" onClick={onRetake}>
            <RotateCcw className="h-3.5 w-3.5" />
            Retake module
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Ring
// ---------------------------------------------------------------------------

function CertRing({ percent, compliant }: { percent: number; compliant: boolean }) {
  const size = 84;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, percent)) / 100) * circ;
  const color = compliant ? "#34d399" : percent >= 50 ? "#e0bd6e" : "#e93d3d";

  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#23272d" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
        />
      </svg>
      <span className="stat-mono absolute text-lg font-bold text-ink-50">{percent}%</span>
    </div>
  );
}
