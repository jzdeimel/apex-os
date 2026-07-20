"use client";
import { DoseLoggedBurst } from "@/components/portal/DoseLoggedBurst";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Syringe,
  Sunrise,
  Moon,
  ShieldCheck,
  AlertTriangle,
  Undo2,
} from "lucide-react";
import { dosesDueOn, cadenceLabel, type DueDose } from "@/lib/dosing/prescriptions";
import { formatMl, formatUnits, isBetweenGraduations } from "@/lib/dosing/reconstitution";
import { useMemberLog, INJECTION_SITES, suggestNextSite } from "@/lib/member/logStore";
import { staffMap } from "@/lib/mock/staff";
import { formatDate, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";

/**
 * What to take today — and the place you record that you took it.
 *
 * This card used to be read-only. It told a member the mark on the syringe and
 * then offered them nothing to press, while the protocol ring above it sat at
 * 50% with no way in the entire app to move it. Logging lived on other screens
 * or nowhere at all, so a member opened the portal, read it, and left without
 * recording anything.
 *
 * Two numbers now compete for attention and the order is deliberate:
 *   - BEFORE logging, the syringe units are the hero. That is what a member
 *     standing at the counter needs.
 *   - AFTER logging, the card collapses to a quiet done-state. Finished work
 *     should stop shouting; the remaining doses are what matters.
 *
 * Skipping is a first-class action, not a failure state. A member who skipped
 * because they felt unwell has told their coach something clinically useful; a
 * member with no way to say so just leaves a silent gap that looks identical to
 * forgetting.
 */
export function TodayDoses({ clientId, iso }: { clientId: string; iso: string }) {
  const due = dosesDueOn(clientId, iso);
  const { today } = useMemberLog();

  if (due.length === 0) {
    return (
      <div className="rounded-panel border border-ink-800 bg-ink-900/40 px-4 py-5">
        <p className="text-body text-ink-200">Nothing scheduled today.</p>
        <p className="mt-1 text-detail text-ink-500">
          A rest day is part of the plan, not a missed one.
        </p>
      </div>
    );
  }

  const morning = due.filter((d) => d.timeOfDay === "Morning");
  const evening = due.filter((d) => d.timeOfDay === "Evening");
  const doneCount = today.doses.filter((d) => !d.skipped).length;

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <p className="text-detail text-ink-400">
          <span className="stat-mono text-ink-100">{doneCount}</span> of{" "}
          <span className="stat-mono text-ink-100">{due.length}</span> logged
        </p>
        {doneCount >= due.length && (
          <Badge tone="optimal">
            <Check className="h-3 w-3" />
            Done for today
          </Badge>
        )}
      </div>

      {morning.length > 0 && <DoseGroup label="Morning" icon={Sunrise} doses={morning} />}
      {evening.length > 0 && <DoseGroup label="Evening" icon={Moon} doses={evening} />}
    </div>
  );
}

function DoseGroup({
  label,
  icon: Icon,
  doses,
}: {
  label: string;
  icon: typeof Sunrise;
  doses: DueDose[];
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-ink-500" aria-hidden />
        <h3 className="text-micro uppercase text-ink-400">{label}</h3>
      </div>
      <div className="space-y-3">
        {doses.map((d) => (
          <DoseCard key={d.rx.id} due={d} />
        ))}
      </div>
    </section>
  );
}

const SKIP_REASONS = ["Felt unwell", "Ran out", "Travelling", "Forgot", "Chose to skip"];

function DoseCard({ due }: { due: DueDose }) {
  const [open, setOpen] = useState(false);
  const [choosingSite, setChoosingSite] = useState(false);
  const [skipping, setSkipping] = useState(false);
  // Fires the celebration once, on the transition into logged.
  const [burst, setBurst] = useState(false);
  const { rx, draw } = due;
  const { logDose, skipDose, undoDose, isDoseLogged, today } = useMemberLog();

  const logged = isDoseLogged(rx.id);
  const signer = staffMap[rx.signedByStaffId];

  const usedSites = today.doses.map((d) => d.site).filter(Boolean) as string[];
  const suggested = suggestNextSite(usedSites);

  // ---- Logged state: quiet, reversible ------------------------------------
  if (logged) {
    return (
      <>
      <DoseLoggedBurst
        show={burst}
        libraryKey={rx.libraryKey}
        name={rx.name}
        onDone={() => setBurst(false)}
      />
      <article
        className={cn(
          "rounded-panel border px-4 py-3",
          logged.skipped
            ? "border-watch/30 bg-watch/5"
            : "border-optimal/25 bg-optimal/5",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-full",
              logged.skipped ? "bg-watch/15 text-watch" : "bg-optimal/15 text-optimal",
            )}
          >
            {logged.skipped ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body text-ink-100">{rx.name}</p>
            <p className="text-detail text-ink-500">
              {logged.skipped ? `Not taken — ${logged.skipReason}` : "Logged"}
              {logged.site ? ` · ${logged.site}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => undoDose(rx.id)}
            className="focus-ring inline-flex items-center gap-1 rounded-control px-2 py-1 text-detail text-ink-500 transition-colors hover:text-ink-200"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </button>
        </div>
      </article>
      </>
    );
  }

  // ---- Unlogged: the units lead -------------------------------------------
  return (
    <article className="rounded-panel border border-ink-800 bg-ink-900/40">
      <div className="flex items-start gap-4 p-4">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-control bg-ink-800/80 text-ink-300">
          <Syringe className="h-4 w-4" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-heading text-ink-50">{rx.name}</p>
          <p className="mt-0.5 text-detail text-ink-500">
            {rx.doseAmount}
            {rx.doseUnit} · {cadenceLabel(rx.days)}
          </p>
        </div>

        <div className="shrink-0 text-right">
          {draw.ok && draw.units !== undefined ? (
            <>
              <p className="stat-mono text-title leading-none text-ink-50">
                {formatUnits(draw.units).replace(" units", "")}
              </p>
              <p className="mt-1 text-micro uppercase text-ink-500">units</p>
            </>
          ) : (
            <Badge tone="watch">
              <AlertTriangle className="h-3 w-3" />
              Ask your coach
            </Badge>
          )}
        </div>
      </div>

      {draw.ok && draw.units !== undefined && isBetweenGraduations(draw.units) && (
        <p className="border-t border-ink-800/70 px-4 py-2 text-detail text-watch">
          This one lands between marks on the barrel — {draw.units.toFixed(2)} exactly. Your coach
          can tell you which way to round it.
        </p>
      )}

      {/* ---- The action. The reason a member opens this screen. ------------ */}
      <div className="border-t border-ink-800/70 p-3">
        {choosingSite ? (
          <div>
            <p className="mb-2 text-detail text-ink-400">
              Where did you inject? <span className="text-ink-500">{suggested} is next in your rotation.</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {INJECTION_SITES.map((site) => (
                <button
                  key={site}
                  type="button"
                  onClick={() => {
                    logDose(rx.id, rx.name, { site });
                    setChoosingSite(false);
                    setBurst(true);
                  }}
                  className={cn(
                    "focus-ring rounded-control border px-3 py-2 text-detail transition-colors",
                    site === suggested
                      ? "border-optimal/40 bg-optimal/10 text-optimal"
                      : "border-ink-700 bg-ink-800/50 text-ink-200 hover:border-ink-500",
                  )}
                >
                  {site}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setChoosingSite(false)}
              className="focus-ring mt-2 text-detail text-ink-500 hover:text-ink-200"
            >
              Cancel
            </button>
          </div>
        ) : skipping ? (
          <div>
            <p className="mb-2 text-detail text-ink-400">What happened?</p>
            <div className="flex flex-wrap gap-2">
              {SKIP_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    skipDose(rx.id, rx.name, r);
                    setSkipping(false);
                  }}
                  className="focus-ring rounded-control border border-ink-700 bg-ink-800/50 px-3 py-1.5 text-detail text-ink-200 transition-colors hover:border-ink-500"
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSkipping(false)}
              className="focus-ring mt-2 text-detail text-ink-500 hover:text-ink-200"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (rx.rotateSites) return setChoosingSite(true);
                logDose(rx.id, rx.name);
                setBurst(true);
              }}
              className="focus-ring flex-1 rounded-control bg-gold-500 px-4 py-2.5 text-body font-medium text-white transition-colors hover:bg-gold-400"
            >
              Mark taken
            </button>
            {/* Skipping is a real answer. Without it, "unwell" and "forgot"
                look identical to everyone downstream. */}
            <button
              type="button"
              onClick={() => setSkipping(true)}
              className="focus-ring rounded-control border border-ink-700 px-3 py-2.5 text-detail text-ink-400 transition-colors hover:border-ink-500 hover:text-ink-200"
            >
              Didn&apos;t take it
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center justify-between border-t border-ink-800/70 px-4 py-2.5 text-left text-detail text-ink-400 transition-colors hover:text-ink-100"
      >
        <span>{open ? "Hide the working" : "How we got that number"}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-ink-800/70 px-4 py-3">
          {draw.ok ? (
            <>
              <ol className="space-y-1.5">
                {(draw.steps ?? []).map((s, i) => (
                  <li key={i} className="stat-mono text-detail text-ink-300">
                    {s}
                  </li>
                ))}
              </ol>
              {draw.volumeMl !== undefined && (
                <p className="text-detail text-ink-500">
                  That is {formatMl(draw.volumeMl)}
                  {draw.dosesPerVial ? ` — about ${draw.dosesPerVial} doses from this vial.` : "."}
                </p>
              )}
              {draw.exceedsBarrel && (
                <p className="text-detail text-high">
                  This is more than one syringe holds. Your coach will show you how it is split.
                </p>
              )}
            </>
          ) : (
            <p className="text-detail text-ink-300">{draw.reason}</p>
          )}

          <p className="flex items-start gap-1.5 border-t border-ink-800/70 pt-3 text-detail text-ink-500">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Prescribed by {signer ? signer.name : "your provider"} on {formatDate(rx.signedAt)}.
              Apex did the arithmetic, not the prescribing.
            </span>
          </p>
        </div>
      )}
    </article>
  );
}
