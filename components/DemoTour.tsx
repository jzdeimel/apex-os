"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { Sparkles, X, ArrowRight, ArrowLeft, Wand2 } from "lucide-react";

interface Step {
  title: string;
  body: string;
  href: string;
}

const STEPS: Step[] = [
  { title: "Welcome to Apex", body: "The operating system for Alpha Health — CRM, labs, AI recommendations, supply chain, scheduling and a client app, across all 4 locations. Let's take a 60-second tour.", href: "/" },
  { title: "Today", body: "The daily view: what is waiting on you, today's schedule, and where the clinic stands. Filter any screen by location from the top bar.", href: "/" },
  { title: "Client 360", body: "Every client has an Alpha Score, labs, body composition, AI recommendations, a dose-free protocol schedule, timeline, tasks and notes — plus an AI drafting studio.", href: "/clients/c-001" },
  { title: "What we're seeing", body: "Triage scoring, Next-Best-Action per client, churn risk, and cohort analytics — the brain that tells you who to act on and why.", href: "/insights" },
  { title: "Awaiting sign-off", body: "Rule-based, category-level suggestions — never dosing. Every one shows why, triggers, contraindications, confidence, and requires provider approval.", href: "/recommendations" },
  { title: "Analytics & Revenue", body: "MRR, revenue by service line, conversion funnel, retention cohorts and LTV by membership tier — the business view for stakeholders.", href: "/analytics" },
  { title: "Stock & vendors", body: "Third-party peptide inventory with AI demand forecasting, vendor comparison and auto-drafted reorder POs.", href: "/supply-chain" },
  { title: "Background agents", body: "A fleet of 10 specialized AI agents runs multi-step clinic workflows in real time — intake, labs, recommendations, outreach, supply chain — handing tasks off to each other. Operational gates auto-approve; clinical decisions always escalate to a human.", href: "/swarm" },
  { title: "Client app preview", body: "See exactly what the client sees — their Alpha Score, results, plan, reminders and secure messaging. Press ⌘K anywhere to search or ask the copilot.", href: "/portal" },
];

const KEY = "alphaos_tour_seen";

export function DemoTour() {
  const router = useRouter();
  const [step, setStep] = useState(-1);

  const start = () => {
    setStep(0);
    router.push(STEPS[0].href);
  };
  const goto = (i: number) => {
    setStep(i);
    router.push(STEPS[i].href);
  };
  const end = () => {
    setStep(-1);
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {}
  };

  // Floating launcher
  if (step < 0) {
    return (
      <button
        onClick={start}
        /*
          Hidden below `sm`. A fixed launcher always floats over whatever is
          scrolling beneath it, and on a 390px screen this one sat directly on
          top of escalation text — the reader lost a line of real clinical
          content to a demo affordance. There is no safe corner on a phone: the
          bottom bar owns the bottom, and the sides are only ~16px of gutter.
          Desktop has the room, so the tour stays there; the tour is a
          nice-to-have and legible content is not.
        */
        /*
          Bottom-RIGHT, not left. At `left-4` this sat on top of the sidebar's
          demo notice and support link on any screen wide enough to show the
          sidebar — a floating control covering the very block that tells you
          how to report the problem. The right edge is the only region no fixed
          chrome owns.

          Still hidden below `sm`: a fixed launcher always floats over whatever
          is scrolling beneath it, and on a 390px screen this one landed on
          escalation text. There is no safe corner on a phone, and legible
          clinical content outranks a demo affordance.
        */
        className="fixed bottom-6 right-6 z-[90] hidden items-center gap-2 rounded-full border border-gold-400/30 bg-ink-850/95 px-3.5 py-2 text-detail font-medium text-gold-200 shadow-glow backdrop-blur transition-colors hover:bg-ink-800 sm:inline-flex"
      >
        <Wand2 className="h-3.5 w-3.5" /> Take the tour
      </button>
    );
  }

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center px-4 pb-24 sm:items-center sm:pb-4">
      <div className="absolute inset-0 bg-black/50" onClick={end} />
      <div className="relative w-full max-w-md rounded-2xl border border-gold-400/30 bg-ink-850 p-5 shadow-glow animate-fade-up">
        <div className="mb-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-micro font-semibold uppercase tracking-wide text-gold-300">
            <Sparkles className="h-3.5 w-3.5" /> Guided tour · {step + 1}/{STEPS.length}
          </span>
          <button onClick={end} className="text-ink-500 hover:text-ink-200"><X className="h-4 w-4" /></button>
        </div>
        <h3 className="font-display text-heading font-semibold text-ink-50">{s.title}</h3>
        <p className="mt-1.5 text-body leading-relaxed text-ink-300">{s.body}</p>

        <div className="mt-4 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => goto(i)}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-gold-400" : "w-1.5 bg-ink-700"}`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => (step === 0 ? end() : goto(step - 1))}>
            {step === 0 ? "Skip" : (<><ArrowLeft className="h-3.5 w-3.5" /> Back</>)}
          </Button>
          <Button variant="primary" size="sm" onClick={() => (last ? end() : goto(step + 1))}>
            {last ? "Finish" : (<>Next <ArrowRight className="h-3.5 w-3.5" /></>)}
          </Button>
        </div>
      </div>
    </div>
  );
}
