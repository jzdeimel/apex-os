"use client";

import { useState } from "react";
import { ChevronDown, Syringe, Sunrise, Moon, ShieldCheck, AlertTriangle } from "lucide-react";
import { dosesDueOn, cadenceLabel, type DueDose } from "@/lib/dosing/prescriptions";
import { formatMl, formatUnits, isBetweenGraduations } from "@/lib/dosing/reconstitution";
import { staffMap } from "@/lib/mock/staff";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * What to take today, and exactly how far up the syringe to pull.
 *
 * The number a member needs is not the prescribed milligrams — it is the mark on
 * the barrel. Everything else on this card is supporting evidence for that one
 * figure, so the units are the largest thing here and the prescription is
 * secondary. Getting that hierarchy backwards is how a member ends up doing
 * arithmetic on a vial at 6am.
 *
 * The working is one tap away rather than hidden, because a member who wants to
 * check us should be able to, and a member who does not should not have to read
 * three lines of division to find their dose.
 */
export function TodayDoses({ clientId, iso }: { clientId: string; iso: string }) {
  const due = dosesDueOn(clientId, iso);

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

  return (
    <div className="space-y-6">
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

function DoseCard({ due }: { due: DueDose }) {
  const [open, setOpen] = useState(false);
  const { rx, draw } = due;
  const signer = staffMap[rx.signedByStaffId];

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

        {/* THE NUMBER. Largest thing on the card, because it is the only thing
            a member is actually looking for while holding a syringe. */}
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

      {/* A draw that falls between graduations is stated, not silently rounded.
          "10.4 units" on a barrel marked in halves is not a thing a person can
          actually pull, and pretending otherwise is how a member believes they
          hit a dose they missed. */}
      {draw.ok && draw.units !== undefined && isBetweenGraduations(draw.units) && (
        <p className="border-t border-ink-800/70 px-4 py-2 text-detail text-watch">
          This one lands between marks on the barrel — {draw.units.toFixed(2)} exactly. Your coach
          can tell you which way to round it.
        </p>
      )}

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

          {/* Attribution. A dose is only legitimate because a clinician signed
              it, so the signature travels with the number rather than living on
              some other screen. */}
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
