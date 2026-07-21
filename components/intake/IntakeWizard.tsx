"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ShieldCheck,
  Lock,
  FileText,
  CircleUser,
  Target,
  Activity,
  Pill,
  ClipboardCheck,
} from "lucide-react";
import type {
  IntakeAnswers,
  IntakeInvite,
  IntakeStepId,
  ConsentKind,
} from "@/lib/intake/types";
import type { Goal, Symptom } from "@/lib/types";
import {
  CONSENT_DEFINITIONS,
  GOAL_OPTIONS,
  SYMPTOM_OPTIONS,
  consentTextHash,
  makeConsentRecord,
  NOW,
} from "@/lib/mock/intake";
import { JOURNEY, BRAND } from "@/lib/brand";
import { locationMap } from "@/lib/mock/locations";
import { shortHash } from "@/lib/trace/hash";
import { Button, Input, Textarea, Badge, Progress } from "@/components/ui/primitives";
import { SwitchView, FadeIn } from "@/components/motion";
import { cn } from "@/lib/utils";

/**
 * The intake wizard.
 *
 * Three decisions worth stating, because they are the ones that get reversed by
 * whoever ships the next version:
 *
 *  1. ONE QUESTION GROUP PER STEP. The system Apex replaces asked all of this on
 *     a single scrolling page, and its abandonment was concentrated in the
 *     middle of that page. A person who is tired, foggy and slightly embarrassed
 *     — which describes most people filling this in — will not fight a wall.
 *  2. NOTHING IS REQUIRED THAT IS NOT USED. Every field here lands somewhere in
 *     `Client` or in the consult prep. There is no "how did you hear about us"
 *     on the critical path.
 *  3. CONSENTS ARE FOUR SEPARATE CHECKBOXES. Marketing has its own box, its own
 *     record, and no bearing on whether you can submit. See lib/intake/types.ts.
 *
 * Demo-shaped, not live: `onFinish` writes nothing and calls nothing. The finish
 * screen renders exactly what WOULD be created, including the ledger draft, so
 * the mechanism is legible without any of it being real.
 */

const STEPS: { id: IntakeStepId; label: string; short: string; icon: React.ElementType }[] = [
  { id: "you", label: "Who you are", short: "You", icon: CircleUser },
  { id: "goals", label: "What you want to change", short: "Goals", icon: Target },
  { id: "symptoms", label: "What you're experiencing", short: "Symptoms", icon: Activity },
  { id: "history", label: "History and medications", short: "History", icon: Pill },
  { id: "consents", label: "Consents", short: "Consents", icon: ShieldCheck },
  { id: "review", label: "Review and submit", short: "Review", icon: ClipboardCheck },
];

const REQUIRED_CONSENTS = CONSENT_DEFINITIONS.filter((c) => c.required).map((c) => c.kind);

function emptyAnswers(invite: IntakeInvite): IntakeAnswers {
  return {
    firstName: invite.prefill.firstName,
    lastName: invite.prefill.lastName,
    email: invite.prefill.email,
    phone: invite.prefill.phone,
    dateOfBirth: "",
    sex: invite.prefill.track,
    locationId: invite.prefill.locationId,
    goals: [],
    symptoms: [],
    history: {
      conditions: "",
      medications: [{ name: "", dose: "" }],
      allergies: "",
      usesTobacco: false,
      priorHormoneTherapy: false,
      familyCardiacHistory: false,
      ...(invite.prefill.track === "female" ? { pregnantOrTrying: false } : {}),
    },
    consents: [],
  };
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-body font-medium text-ink-200">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-detail text-ink-500">{hint}</span>}
    </label>
  );
}

/** Big tappable multi-select chip. Sized for a thumb, not a mouse. */
function ChoiceChip({
  selected,
  onToggle,
  title,
  plain,
}: {
  selected: boolean;
  onToggle: () => void;
  title: string;
  plain: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors focus-ring",
        selected
          ? "border-gold-400/50 bg-gold-400/10"
          : "border-ink-700 bg-ink-900/40 hover:border-ink-600",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border",
          selected ? "border-gold-400 bg-gold-500 text-white" : "border-ink-600",
        )}
      >
        {selected && <Check className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-body font-medium text-ink-100">{plain}</span>
        <span className="block text-detail text-ink-500">{title}</span>
      </span>
    </button>
  );
}

function YesNo({
  label,
  detail,
  value,
  onChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-900/40 p-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-body text-ink-100">{label}</p>
        {detail && <p className="mt-0.5 text-detail text-ink-500">{detail}</p>}
      </div>
      <div className="flex shrink-0 gap-1 rounded-lg border border-ink-700 p-1">
        {[
          { v: false, l: "No" },
          { v: true, l: "Yes" },
        ].map((o) => (
          <button
            key={o.l}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "rounded-md px-3 py-1 text-detail font-medium transition-colors focus-ring",
              value === o.v ? "bg-gold-400/15 text-gold-200" : "text-ink-400 hover:text-ink-100",
            )}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export function IntakeWizard({ invite }: { invite: IntakeInvite }) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<IntakeAnswers>(() => emptyAnswers(invite));
  const [consentState, setConsentState] = React.useState<Record<ConsentKind, boolean>>({
    treatment: false,
    telehealth: false,
    hipaaNotice: false,
    marketing: false,
  });
  const [submitted, setSubmitted] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [receipt, setReceipt] = React.useState<{ submissionId: string; ledgerId: string } | null>(
    null,
  );

  /**
   * The real submission.
   *
   * This used to be `setSubmitted(true)` — no network call at all, so a
   * completed intake (including four signed consents) existed only in React
   * state and died on refresh. Now it POSTs to the public intake endpoint,
   * which claims the single-use invite, writes the submission and one consent
   * row per decision, advances the lead, and witnesses all of it in the ledger
   * inside one transaction.
   *
   * On failure we do NOT advance to the confirmation screen: telling someone
   * their medical history was recorded when it was not is the worst lie this
   * product could tell.
   */
  const doSubmit = async () => {
    setSending(true);
    setSendError(null);
    try {
      const r = await fetch("/api/public/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: invite.token,
          dateOfBirth: answers.dateOfBirth,
          sex: answers.sex,
          goals: answers.goals,
          symptoms: answers.symptoms,
          history: answers.history,
          signatureName: `${answers.firstName ?? ""} ${answers.lastName ?? ""}`.trim() || "Patient",
          consents: CONSENT_DEFINITIONS.map((d) => ({
            scope: d.kind,
            documentVersion: d.version,
            textSha256: consentTextHash(d.kind),
            granted: consentState[d.kind],
          })),
        }),
      });
      const res = await r.json().catch(() => ({}));
      if (r.ok && res.ok) {
        setReceipt({ submissionId: res.submissionId, ledgerId: res.ledger?.id ?? "" });
        setSubmitted(true);
      } else {
        setSendError(res.error || "We could not record your intake. Please call us.");
      }
    } catch {
      setSendError("We could not reach the server. Please check your connection.");
    } finally {
      setSending(false);
    }
  };
  const [touchedNext, setTouchedNext] = React.useState(false);

  const step = STEPS[stepIndex];
  const isFemale = answers.sex === "female";

  const set = <K extends keyof IntakeAnswers>(k: K, v: IntakeAnswers[K]) =>
    setAnswers((a) => ({ ...a, [k]: v }));

  const setHistory = <K extends keyof IntakeAnswers["history"]>(
    k: K,
    v: IntakeAnswers["history"][K],
  ) => setAnswers((a) => ({ ...a, history: { ...a.history, [k]: v } }));

  const toggleGoal = (g: Goal) =>
    setAnswers((a) => ({
      ...a,
      goals: a.goals.includes(g) ? a.goals.filter((x) => x !== g) : [...a.goals, g],
    }));

  const toggleSymptom = (s: Symptom) =>
    setAnswers((a) => ({
      ...a,
      symptoms: a.symptoms.includes(s)
        ? a.symptoms.filter((x) => x !== s)
        : [...a.symptoms, s],
    }));

  /**
   * Per-step gate. Returns the reason a step is incomplete, or null.
   *
   * Symptoms is deliberately NOT gated — "none of these" is a real and clinically
   * meaningful answer, and forcing a person to claim a symptom to proceed
   * corrupts the one field a provider reads first.
   */
  const blockedBecause = React.useMemo((): string | null => {
    switch (step.id) {
      case "you":
        if (!answers.firstName.trim() || !answers.lastName.trim())
          return "We need your first and last name.";
        if (!answers.email.trim().includes("@")) return "We need a valid email address.";
        if (answers.phone.trim().length < 7) return "We need a phone number we can reach you on.";
        if (!answers.dateOfBirth) return "Date of birth is required before any lab can be ordered.";
        return null;
      case "goals":
        return answers.goals.length === 0 ? "Pick at least one — this shapes everything after." : null;
      case "consents": {
        const missing = REQUIRED_CONSENTS.filter((k) => !consentState[k]);
        return missing.length ? "Please review and accept the required items above." : null;
      }
      default:
        return null;
    }
  }, [step.id, answers, consentState]);

  const go = (delta: number) => {
    if (delta > 0 && blockedBecause) {
      setTouchedNext(true);
      return;
    }
    setTouchedNext(false);
    setStepIndex((i) => Math.min(STEPS.length - 1, Math.max(0, i + delta)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const location = locationMap[answers.locationId];

  // -------------------------------------------------------------------------
  // Finished
  // -------------------------------------------------------------------------
  if (submitted) {
    const records = CONSENT_DEFINITIONS.map((d) =>
      makeConsentRecord(d.kind, consentState[d.kind], NOW),
    );
    return (
      <SubmittedPanel
        answers={answers}
        invite={invite}
        consentRecords={records}
        receipt={receipt}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* Progress rail — vertical on desktop, a bar on a phone. A six-dot
          horizontal stepper on a 390px screen is unreadable, so below lg we
          show position as text plus a bar and drop the labels. */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="lg:hidden">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-body font-medium text-ink-100">{step.label}</p>
            <p className="stat-mono text-detail text-ink-500">
              {stepIndex + 1}/{STEPS.length}
            </p>
          </div>
          <Progress value={((stepIndex + 1) / STEPS.length) * 100} />
        </div>

        <ol className="hidden lg:block">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <li key={s.id} className="relative flex gap-3 pb-6 last:pb-0">
                {i < STEPS.length - 1 && (
                  <span
                    className={cn(
                      "absolute left-[13px] top-7 h-full w-px",
                      done ? "bg-gold-500/50" : "bg-ink-700",
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border",
                    done && "border-gold-500/60 bg-gold-500/20 text-gold-300",
                    active && "border-gold-400 bg-gold-500 text-white",
                    !done && !active && "border-ink-700 bg-ink-900 text-ink-500",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                <span
                  className={cn(
                    "pt-1 text-body",
                    active ? "font-medium text-ink-50" : done ? "text-ink-300" : "text-ink-500",
                  )}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Panel */}
      <div className="min-w-0">
        <SwitchView k={step.id}>
          <div className="card p-5 sm:p-7">
            {step.id === "you" && (
              <StepShell
                title="Let's start with you"
                blurb="This is the same information you'd give at a front desk — nothing more."
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="First name">
                    <Input
                      value={answers.firstName}
                      onChange={(e) => set("firstName", e.target.value)}
                      autoComplete="given-name"
                    />
                  </Field>
                  <Field label="Last name">
                    <Input
                      value={answers.lastName}
                      onChange={(e) => set("lastName", e.target.value)}
                      autoComplete="family-name"
                    />
                  </Field>
                  <Field label="Email">
                    <Input
                      type="email"
                      value={answers.email}
                      onChange={(e) => set("email", e.target.value)}
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="Mobile">
                    <Input
                      type="tel"
                      value={answers.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      autoComplete="tel"
                    />
                  </Field>
                  <Field
                    label="Date of birth"
                    hint="Required — a lab cannot accept an order without it."
                  >
                    <Input
                      type="date"
                      value={answers.dateOfBirth}
                      onChange={(e) => set("dateOfBirth", e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Care track"
                    hint="Determines which panels and questions apply. You can change this on your consult."
                  >
                    <div className="flex gap-2">
                      {(["male", "female"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => set("sex", t)}
                          className={cn(
                            "h-9 flex-1 rounded-lg border text-body transition-colors focus-ring",
                            answers.sex === t
                              ? "border-gold-400/50 bg-gold-400/10 text-gold-200"
                              : "border-ink-700 text-ink-300 hover:border-ink-600",
                          )}
                        >
                          {t === "male" ? "Men's health" : "Women's health"}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>

                <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-ink-700/70 bg-ink-900/40 p-3.5">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
                  <p className="text-detail leading-relaxed text-ink-400">
                    Your answers are stored by {BRAND.name} and visible to your care team
                    only. Every time a staff member opens your record it is logged, and you
                    can see that log yourself once your account is active.
                  </p>
                </div>
              </StepShell>
            )}

            {step.id === "goals" && (
              <StepShell
                title="What are you hoping to change?"
                blurb="Pick everything that applies. This is what your plan gets measured against — so be honest rather than modest."
              >
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {GOAL_OPTIONS.map((o) => (
                    <ChoiceChip
                      key={o.value}
                      title={o.value}
                      plain={o.plain}
                      selected={answers.goals.includes(o.value)}
                      onToggle={() => toggleGoal(o.value)}
                    />
                  ))}
                </div>
              </StepShell>
            )}

            {step.id === "symptoms" && (
              <StepShell
                title="What are you experiencing?"
                blurb="Only what you've actually noticed. If none of these fit, leave it blank and tell us on the call — that's a real answer."
              >
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SYMPTOM_OPTIONS.map((o) => (
                    <ChoiceChip
                      key={o.value}
                      title={o.value}
                      plain={o.plain}
                      selected={answers.symptoms.includes(o.value)}
                      onToggle={() => toggleSymptom(o.value)}
                    />
                  ))}
                </div>
              </StepShell>
            )}

            {step.id === "history" && (
              <StepShell
                title="History and medications"
                blurb="Your provider reads this before your consult, so the call is spent on you rather than on paperwork."
              >
                <div className="space-y-4">
                  <Field
                    label="Conditions you've been diagnosed with"
                    hint="Plain language is fine. Nothing here is coded or billed."
                  >
                    <Textarea
                      rows={3}
                      value={answers.history.conditions}
                      onChange={(e) => setHistory("conditions", e.target.value)}
                      placeholder="e.g. high blood pressure, sleep apnea, hypothyroidism"
                    />
                  </Field>

                  <div>
                    <span className="mb-1.5 block text-body font-medium text-ink-200">
                      Current medications and supplements
                    </span>
                    <div className="space-y-2">
                      {answers.history.medications.map((m, i) => (
                        <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                          <Input
                            value={m.name}
                            placeholder="Name"
                            onChange={(e) =>
                              setHistory(
                                "medications",
                                answers.history.medications.map((x, j) =>
                                  j === i ? { ...x, name: e.target.value } : x,
                                ),
                              )
                            }
                          />
                          <Input
                            value={m.dose}
                            placeholder="Dose / frequency"
                            onChange={(e) =>
                              setHistory(
                                "medications",
                                answers.history.medications.map((x, j) =>
                                  j === i ? { ...x, dose: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() =>
                        setHistory("medications", [
                          ...answers.history.medications,
                          { name: "", dose: "" },
                        ])
                      }
                    >
                      + Add another
                    </Button>
                  </div>

                  <Field label="Allergies">
                    <Input
                      value={answers.history.allergies}
                      onChange={(e) => setHistory("allergies", e.target.value)}
                      placeholder="Medication, food or environmental — or 'none'"
                    />
                  </Field>

                  <div className="space-y-2.5">
                    <YesNo
                      label="Do you use tobacco or nicotine?"
                      detail="Changes cardiovascular risk assessment before hormone therapy."
                      value={answers.history.usesTobacco}
                      onChange={(v) => setHistory("usesTobacco", v)}
                    />
                    <YesNo
                      label="Have you been on hormone therapy before?"
                      detail="TRT, HRT, pellets, clomiphene, or anything similar."
                      value={answers.history.priorHormoneTherapy}
                      onChange={(v) => setHistory("priorHormoneTherapy", v)}
                    />
                    <YesNo
                      label="Heart attack, stroke or clot in a close relative before 60?"
                      value={answers.history.familyCardiacHistory}
                      onChange={(v) => setHistory("familyCardiacHistory", v)}
                    />
                    {/* Asked on the women's track only. A question that cannot
                        apply should not be rendered and quietly ignored — an
                        answered-then-discarded field is worse than no field. */}
                    {isFemale && (
                      <YesNo
                        label="Are you pregnant, breastfeeding, or trying to conceive?"
                        detail="Several therapies are contraindicated, so we need this before any lab is ordered."
                        value={answers.history.pregnantOrTrying ?? false}
                        onChange={(v) => setHistory("pregnantOrTrying", v)}
                      />
                    )}
                  </div>
                </div>
              </StepShell>
            )}

            {step.id === "consents" && (
              <StepShell
                title="What you're agreeing to"
                blurb="Four separate items. Read them separately, agree to them separately — the last one is optional and has nothing to do with your care."
              >
                <div className="space-y-3">
                  {CONSENT_DEFINITIONS.map((d) => {
                    const checked = consentState[d.kind];
                    const missing = touchedNext && d.required && !checked;
                    return (
                      <div
                        key={d.kind}
                        className={cn(
                          "rounded-xl border p-4 transition-colors",
                          missing
                            ? "border-high/50 bg-high/5"
                            : checked
                              ? "border-gold-400/40 bg-gold-400/[0.06]"
                              : "border-ink-700 bg-ink-900/40",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-body font-medium text-ink-50">{d.title}</p>
                          <Badge tone={d.required ? "neutral" : "gold"}>
                            {d.required ? "Required" : "Optional"}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-micro uppercase tracking-[0.12em] text-ink-500">
                          {d.regime}
                        </p>
                        <p className="mt-2.5 text-body leading-relaxed text-ink-300">{d.body}</p>

                        <label className="mt-3.5 flex cursor-pointer items-start gap-3 rounded-lg border border-ink-700/70 bg-ink-950/40 p-3 focus-within:ring-2 focus-within:ring-gold-400/40">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0 accent-gold-500"
                            checked={checked}
                            onChange={(e) =>
                              setConsentState((s) => ({ ...s, [d.kind]: e.target.checked }))
                            }
                          />
                          <span className="text-body text-ink-200">
                            {d.kind === "hipaaNotice"
                              ? "I acknowledge I received this notice."
                              : d.kind === "marketing"
                                ? "Yes, send me marketing texts and emails. (You can say no.)"
                                : `I agree to the ${d.title.toLowerCase()}.`}
                          </span>
                        </label>

                        <p className="stat-mono mt-2 text-micro text-ink-600">
                          v{d.version} · text {shortHash(consentTextHash(d.kind))}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <p className="mt-4 text-detail leading-relaxed text-ink-500">
                  Each box you tick is recorded as its own signature, against the exact
                  wording above — which is why the version and text hash are printed on
                  each one. Rewriting this copy later creates a new version rather than
                  silently changing what you agreed to.
                </p>
              </StepShell>
            )}

            {step.id === "review" && (
              <StepShell
                title="Check this over"
                blurb="Last look before it goes to your care team. You can go back and change anything."
              >
                <div className="space-y-3">
                  <ReviewBlock label="You">
                    <p className="text-body text-ink-200">
                      {answers.firstName} {answers.lastName}
                    </p>
                    <p className="stat-mono text-detail text-ink-500">
                      {answers.email} · {answers.phone} · DOB {answers.dateOfBirth || "—"}
                    </p>
                    <p className="mt-1 text-detail text-ink-500">
                      {answers.sex === "female" ? "Women's health" : "Men's health"} ·{" "}
                      {location?.name ?? answers.locationId}
                    </p>
                  </ReviewBlock>

                  <ReviewBlock label="Goals">
                    <TagList items={answers.goals} empty="None selected" />
                  </ReviewBlock>

                  <ReviewBlock label="Symptoms">
                    <TagList items={answers.symptoms} empty="None reported" />
                  </ReviewBlock>

                  <ReviewBlock label="History">
                    <p className="text-body text-ink-300">
                      {answers.history.conditions.trim() || "No conditions listed"}
                    </p>
                    <p className="mt-1 text-detail text-ink-500">
                      Medications:{" "}
                      {answers.history.medications.filter((m) => m.name.trim()).length
                        ? answers.history.medications
                            .filter((m) => m.name.trim())
                            .map((m) => `${m.name}${m.dose ? ` (${m.dose})` : ""}`)
                            .join(", ")
                        : "none listed"}
                    </p>
                    <p className="mt-1 text-detail text-ink-500">
                      Allergies: {answers.history.allergies.trim() || "none listed"}
                    </p>
                  </ReviewBlock>

                  <ReviewBlock label="Consents">
                    <ul className="space-y-1">
                      {CONSENT_DEFINITIONS.map((d) => (
                        <li key={d.kind} className="flex items-center gap-2 text-body">
                          <span
                            className={cn(
                              "grid h-4 w-4 shrink-0 place-items-center rounded-full",
                              consentState[d.kind]
                                ? "bg-optimal/20 text-optimal"
                                : "bg-ink-700 text-ink-500",
                            )}
                          >
                            {consentState[d.kind] ? (
                              <Check className="h-2.5 w-2.5" />
                            ) : (
                              <span className="block h-1 w-1 rounded-full bg-current" />
                            )}
                          </span>
                          <span className="text-ink-300">{d.title}</span>
                          <span className="text-detail text-ink-500">
                            {consentState[d.kind] ? "granted" : "declined"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </ReviewBlock>
                </div>

                <Button
                  variant="primary"
                  className="mt-5 h-11 w-full text-body"
                  disabled={sending}
                  onClick={() => void doSubmit()}
                >
                  {sending ? "Submitting…" : "Submit intake"}
                </Button>
                {sendError ? (
                  <p className="mt-2 text-center text-detail text-high">{sendError}</p>
                ) : (
                  <p className="mt-2 text-center text-detail text-ink-600">
                    Your answers and consents are recorded to your chart when you submit.
                  </p>
                )}
              </StepShell>
            )}

            {/* Nav */}
            {step.id !== "review" && (
              <div className="mt-6 border-t border-ink-700/70 pt-4">
                {touchedNext && blockedBecause && (
                  <p className="mb-3 text-body text-high">{blockedBecause}</p>
                )}
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => go(-1)}
                    disabled={stepIndex === 0}
                    className="gap-1.5"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button variant="primary" onClick={() => go(1)} className="gap-1.5 px-5">
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            {step.id === "review" && (
              <div className="mt-4 border-t border-ink-700/70 pt-4">
                <Button variant="ghost" onClick={() => go(-1)} className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              </div>
            )}
          </div>
        </SwitchView>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step chrome
// ---------------------------------------------------------------------------

function StepShell({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-display text-heading font-semibold tracking-tight text-ink-50">{title}</h2>
      <p className="mt-1.5 max-w-prose text-body leading-relaxed text-ink-400">{blurb}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function ReviewBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-700/70 bg-ink-900/40 p-4">
      <p className="label-eyebrow mb-2">{label}</p>
      {children}
    </div>
  );
}

function TagList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-body text-ink-500">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <Badge key={i} tone="gold">
          {i}
        </Badge>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finish
// ---------------------------------------------------------------------------

/**
 * The finish screen does double duty.
 *
 * For the member it is the "what happens next" they actually need — the clinic's
 * own four-step journey, in the clinic's own words, so the language on this page
 * matches the language on the phone call they get tomorrow.
 *
 * For anyone evaluating Apex it is the receipt: the records that would be
 * created and the exact ledger row that would be appended. Showing the write
 * rather than performing it keeps the demo deterministic and keeps this page
 * honest about being a demo.
 */
function SubmittedPanel({
  answers,
  invite,
  consentRecords,
  receipt,
}: {
  answers: IntakeAnswers;
  invite: IntakeInvite;
  consentRecords: ReturnType<typeof makeConsentRecord>[];
  /** Server-issued proof of what was actually written. Null only pre-submit. */
  receipt: { submissionId: string; ledgerId: string } | null;
}) {
  const granted = consentRecords.filter((c) => c.granted).length;

  // The server's receipt. When present these are FACTS about rows that exist in
  // Postgres — not a preview of a write we chose not to perform.
  const durable = receipt !== null;

  // The draft that would go to appendLedger() in lib/trace/ledger.ts. Built, not
  // committed — a demo page that mutates the audit chain on render is a demo
  // page that produces a different chain on every reload.
  const ledgerDraft = {
    actorId: "public-intake",
    actorName: `${answers.firstName} ${answers.lastName}`,
    actorRole: "Client",
    action: "sign" as const,
    entity: "consent" as const,
    entityId: `int-${invite.id}`,
    subjectName: `${answers.firstName} ${answers.lastName}`,
    locationId: answers.locationId,
    reason: "Public intake submitted via tokenised link",
    after: {
      consentsGranted: granted,
      consentsTotal: consentRecords.length,
      marketing: consentRecords.find((c) => c.kind === "marketing")?.granted ?? false,
      goals: answers.goals.length,
      symptoms: answers.symptoms.length,
    },
  };

  return (
    <FadeIn>
      <div className="card p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-optimal/15 text-optimal">
            <Check className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-heading font-semibold tracking-tight text-ink-50">
              Thanks, {answers.firstName || "there"} — that's everything we needed.
            </h2>
            <p className="text-body text-ink-400">
              Your care team has it. Here's what happens from here.
            </p>
          </div>
        </div>

        {/* The clinic's own journey, verbatim. */}
        <ol className="mt-6 space-y-3">
          {JOURNEY.map((j, i) => (
            <li
              key={j.step}
              className={cn(
                "flex gap-3.5 rounded-xl border p-4",
                i === 0 ? "border-gold-400/40 bg-gold-400/[0.06]" : "border-ink-700/70 bg-ink-900/40",
              )}
            >
              <span
                className={cn(
                  "stat-mono grid h-7 w-7 shrink-0 place-items-center rounded-full text-detail font-semibold",
                  i === 0 ? "bg-gold-500 text-white" : "bg-ink-800 text-ink-400",
                )}
              >
                {j.step}
              </span>
              <div className="min-w-0">
                <p className="text-body font-medium text-ink-100">
                  {j.title}
                  {i === 0 && (
                    <span className="ml-2 text-detail font-normal text-gold-300">you're here</span>
                  )}
                </p>
                <p className="mt-0.5 text-body leading-relaxed text-ink-400">{j.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-4 text-body text-ink-400">
          Someone from the team calls within one business day to book your free
          consultation. If you'd rather not wait, call{" "}
          <a href={`tel:${BRAND.telehealthPhone}`} className="text-gold-300 hover:underline">
            {BRAND.telehealthPhone}
          </a>
          .
        </p>

        {/* The receipt. Real ids when the server accepted the submission. */}
        {durable && (
          <div className="mt-5 rounded-xl border border-optimal/40 bg-optimal/10 p-4">
            <p className="text-body font-medium text-optimal">Recorded to your chart</p>
            <p className="stat-mono mt-1 text-detail text-ink-300">
              Submission {receipt!.submissionId}
              {receipt!.ledgerId ? ` · ledger ${receipt!.ledgerId}` : ""}
            </p>
            <p className="mt-1 text-micro text-ink-500">
              Your consents were stored with the exact wording you were shown, the time, and
              your IP — this link is now spent and cannot be reused.
            </p>
          </div>
        )}

        <div className="mt-7 rounded-xl border border-dashed border-ink-700 bg-ink-900/40 p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-gold-300" />
            <p className="text-body font-medium text-ink-100">
              What was recorded
            </p>
          </div>

          <ul className="mt-3 space-y-1.5 text-body text-ink-300">
            <li>
              · One <span className="text-ink-100">Client</span> record at status{" "}
              <span className="text-ink-100">Consult Booked</span>, with{" "}
              {answers.goals.length} goal{answers.goals.length === 1 ? "" : "s"} and{" "}
              {answers.symptoms.length} symptom{answers.symptoms.length === 1 ? "" : "s"}{" "}
              already populated — no re-keying.
            </li>
            <li>
              · {consentRecords.length} separate{" "}
              <span className="text-ink-100">ConsentRecord</span> rows ({granted} granted),
              each pinned to its own text version and hash.
            </li>
            <li>
              · One <span className="text-ink-100">Task</span> for the location's coach:
              call to schedule the free consultation.
            </li>
            <li>
              · Intake link <span className="stat-mono text-ink-100">{invite.shortCode}</span>{" "}
              marked used. Single-use — the link is now dead.
            </li>
          </ul>

          <p className="label-eyebrow mt-4 mb-2">Ledger row appended</p>
          <pre className="stat-mono overflow-x-auto rounded-lg border border-ink-700/70 bg-ink-950/70 p-3 text-micro leading-relaxed text-ink-300">
{JSON.stringify(ledgerDraft, null, 2)}
          </pre>
          <p className="mt-2 text-detail leading-relaxed text-ink-500">
            Note the action is <span className="text-ink-300">sign</span> and the entity is{" "}
            <span className="text-ink-300">consent</span>. A signature that leaves no
            hash-chained trace is a signature you cannot defend two years later.
          </p>
        </div>
      </div>
    </FadeIn>
  );
}
