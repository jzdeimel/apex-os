"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FlaskConical, AlertTriangle, Info, Droplet } from "lucide-react";
import { prescriptionsForClient, type Prescription } from "@/lib/dosing/prescriptions";
import {
  computeDraw,
  formatUnits,
  isBetweenGraduations,
  formatMl,
  UNITS_PER_ML,
  BARREL_ML,
  type MassUnit,
} from "@/lib/dosing/reconstitution";

/**
 * The reconstitution & draw calculator, with a syringe you can read.
 *
 * WHY THIS IS THE HIGHEST-VALUE SAFETY TOOL IN THE APP
 * ----------------------------------------------------
 * A peptide arrives as a dry powder. The strength on the vial (say 5mg) is not a
 * dose — it becomes a concentration only once the member adds bacteriostatic
 * water, and how much they add is THEIR choice at the kitchen counter. Add 2mL
 * and the same 250mcg dose is 10 units on the barrel; add 1mL and it is 5. Get
 * the mental arithmetic wrong by a factor and you have a ten-fold dosing error
 * with a needle already drawn up. This is the single most common way a
 * self-administered peptide goes wrong, and it is pure arithmetic — exactly what
 * a computer should be doing instead of a person at 6am.
 *
 * WHAT MAKES IT SAFE RATHER THAN JUST CLEVER
 * ------------------------------------------
 *  - It reuses the audited engine (lib/dosing/reconstitution.ts), which returns
 *    `ok: false` with a reason rather than a confident wrong number whenever an
 *    input is missing or the unit conversion is undefined (IU has no general mass
 *    equivalent, so it refuses).
 *  - It shows the working, every line, so the member can check the machine.
 *  - It says out loud when the true draw falls BETWEEN graduations, instead of
 *    rounding silently and letting them believe they hit it exactly.
 *  - It flags when the dose needs more than one barrel.
 *  - The dose itself is the provider-signed number from the prescription and is
 *    read-only. The member tunes the DILUENT — the thing they actually control —
 *    not the dose.
 *
 * The syringe drawing is the point. A number is easy to misread; a plunger
 * sitting at a mark on a barrel is what the member is about to physically do.
 */

const DEFAULT_DILUENTS = [1, 2, 3];

export function ReconstitutionCalculator({ clientId }: { clientId: string }) {
  // Only powders get reconstituted. An oil at strength (testosterone cypionate)
  // has no mixing step, so it is honestly excluded rather than shown an
  // irrelevant "add water" control.
  const lyoRxs = useMemo(
    () => prescriptionsForClient(clientId).filter((rx) => rx.supply.kind === "lyophilised"),
    [clientId],
  );

  const [rxId, setRxId] = useState<string | null>(lyoRxs[0]?.id ?? null);
  const rx = lyoRxs.find((r) => r.id === rxId) ?? lyoRxs[0] ?? null;

  if (!rx || rx.supply.kind !== "lyophilised") return null;

  return (
    <section className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex items-center gap-2 border-b border-ink-800/70 px-5 py-4">
        <FlaskConical className="h-4 w-4 text-gold-400" aria-hidden />
        <h2 className="text-heading text-ink-50">Mixing &amp; draw calculator</h2>
      </header>

      <div className="px-5 py-5">
        {lyoRxs.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {lyoRxs.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRxId(r.id)}
                className={
                  "rounded-control border px-3 py-1.5 text-detail transition-colors " +
                  (r.id === rx.id
                    ? "border-gold-400/50 bg-gold-400/10 text-gold-200"
                    : "border-ink-700 text-ink-400 hover:text-ink-100")
                }
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
        <Calculator rx={rx} />
      </div>
    </section>
  );
}

function Calculator({ rx }: { rx: Prescription }) {
  const supply = rx.supply as Extract<Prescription["supply"], { kind: "lyophilised" }>;
  // Start from what was recorded, or a sensible 2mL if nothing was.
  const [diluentMl, setDiluentMl] = useState<number>(supply.diluentMl ?? 2);

  const result = useMemo(
    () =>
      computeDraw(
        { vialAmount: supply.vialAmount, vialUnit: supply.vialUnit, diluentMl, syringe: rx.syringe },
        { amount: rx.doseAmount, unit: rx.doseUnit },
      ),
    [supply.vialAmount, supply.vialUnit, diluentMl, rx.syringe, rx.doseAmount, rx.doseUnit],
  );

  const barrelUnits = UNITS_PER_ML[rx.syringe] * BARREL_ML[rx.syringe];
  const between = result.ok && result.units != null && isBetweenGraduations(result.units);

  return (
    <div className="space-y-5">
      {/* The two fixed facts, then the one dial the member controls. */}
      <div className="grid grid-cols-2 gap-3 text-detail">
        <Fact label="Vial strength" value={`${supply.vialAmount}${supply.vialUnit}`} />
        <Fact label="Prescribed dose" value={`${rx.doseAmount}${rx.doseUnit}`} sub="signed by your provider" />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-detail text-ink-300">
            <Droplet className="h-3.5 w-3.5 text-sky-400" aria-hidden />
            Bacteriostatic water you add
          </label>
          <span className="stat-mono text-body text-ink-50">{formatMl(diluentMl)}</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={5}
          step={0.5}
          value={diluentMl}
          onChange={(e) => setDiluentMl(Number(e.target.value))}
          className="mt-2 w-full accent-gold-400"
          aria-label="Bacteriostatic water in millilitres"
        />
        <div className="mt-1 flex gap-2">
          {DEFAULT_DILUENTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setDiluentMl(v)}
              className={
                "rounded-full border px-2.5 py-0.5 text-micro transition-colors " +
                (diluentMl === v ? "border-gold-400/50 text-gold-200" : "border-ink-700 text-ink-500 hover:text-ink-200")
              }
            >
              {v}mL
            </button>
          ))}
        </div>
      </div>

      {!result.ok ? (
        <div className="flex items-start gap-2 rounded-control border border-watch/30 bg-watch/5 px-3 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-watch" aria-hidden />
          <p className="text-detail leading-relaxed text-ink-200">{result.reason}</p>
        </div>
      ) : (
        <>
          {/* The answer, big, and the syringe under it. */}
          <div className="rounded-control border border-ink-800 bg-ink-900/40 p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-micro uppercase tracking-[0.14em] text-ink-500">Draw to</p>
                <p className="stat-mono text-display leading-none text-gold-300">
                  {formatUnits(result.units!).replace(" units", "")}
                  <span className="ml-1.5 text-heading text-ink-400">units</span>
                </p>
                <p className="mt-1 text-detail text-ink-500">
                  {formatMl(result.volumeMl!)} · on a {rx.syringe} pin
                </p>
              </div>
              <div className="text-right text-detail text-ink-500">
                <p>
                  <span className="stat-mono text-ink-200">
                    {result.concentrationMcgPerMl! >= 1000
                      ? `${(result.concentrationMcgPerMl! / 1000).toFixed(2)}mg`
                      : `${Math.round(result.concentrationMcgPerMl!)}mcg`}
                  </span>{" "}
                  / mL
                </p>
                <p className="mt-0.5">
                  <span className="stat-mono text-ink-200">{result.dosesPerVial}</span> doses / vial
                </p>
              </div>
            </div>

            <Syringe
              units={result.units!}
              barrelUnits={barrelUnits}
              exceeds={!!result.exceedsBarrel}
              between={!!between}
            />
          </div>

          {between && (
            <p className="flex items-start gap-1.5 text-detail leading-relaxed text-watch">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              This lands between the marks. Pull to the nearest half-unit ({formatUnits(result.units!)})
              and ask your provider if you want it exact — a little more diluent makes it land clean.
            </p>
          )}
          {result.exceedsBarrel && (
            <p className="flex items-start gap-1.5 text-detail leading-relaxed text-high">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              This dose is more than one {rx.syringe} barrel holds. Use less water, or split it — don&apos;t
              overfill.
            </p>
          )}

          {/* The working, so the member can check the machine. */}
          <details className="group">
            <summary className="flex cursor-pointer items-center gap-1.5 text-detail text-ink-500 hover:text-ink-300">
              <Info className="h-3.5 w-3.5" aria-hidden /> Show the math
            </summary>
            <ol className="mt-2 space-y-1 border-l border-ink-800 pl-3 text-micro leading-relaxed text-ink-500">
              {result.steps!.map((s, i) => (
                <li key={i} className="stat-mono">
                  {s}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}

      <p className="flex items-start gap-1.5 border-t border-ink-800/70 pt-3 text-micro leading-relaxed text-ink-600">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          The dose is your provider&apos;s and can&apos;t be changed here — you&apos;re only choosing how much
          water to mix it with. Never dose from a vial someone else reconstituted without re-checking
          the concentration.
        </span>
      </p>
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-control border border-ink-800 bg-ink-900/40 px-3 py-2">
      <p className="text-micro uppercase tracking-[0.14em] text-ink-500">{label}</p>
      <p className="stat-mono text-body text-ink-50">{value}</p>
      {sub && <p className="text-micro text-ink-600">{sub}</p>}
    </div>
  );
}

/**
 * A syringe barrel the member can read the draw off.
 *
 * Horizontal U-100 insulin barrel: graduation ticks every 10 units, the liquid
 * against the NEEDLE, the plunger tip at the draw mark, and a labelled pointer
 * at the exact pull. It animates so a change in diluent visibly moves the
 * plunger — the whole reason to show it rather than print a number.
 *
 * THE NEEDLE IS ON THE LEFT, and that is not arbitrary. Liquid in a syringe sits
 * between the plunger tip and the needle, so it must be drawn against the
 * needle end; an earlier version filled from the plunger side, which is the
 * mirror image of what the member is holding. Putting the needle on the left
 * makes the fill physically correct AND keeps the graduations ascending
 * left-to-right, which is how they are read. Flipping the numbers instead would
 * have been correct and unreadable.
 */
function Syringe({
  units,
  barrelUnits,
  exceeds,
  between,
}: {
  units: number;
  barrelUnits: number;
  exceeds: boolean;
  between: boolean;
}) {
  // Geometry. Needle occupies the left gutter; the plunger rod and flange the
  // right, so the barrel sits between them exactly as it does in the hand.
  const W = 320;
  const bx = 46; // barrel left (after the needle + hub)
  const bw = 234; // barrel width
  const by = 26;
  const bh = 26;
  const clamped = Math.min(Math.max(units, 0), barrelUnits);
  const fillW = (clamped / barrelUnits) * bw;
  const markX = bx + fillW;
  const fill = exceeds ? "var(--c-high)" : between ? "var(--c-watch)" : "var(--c-watch)";

  // Ticks every 10 units.
  const ticks: number[] = [];
  for (let u = 0; u <= barrelUnits; u += 10) ticks.push(u);

  return (
    <svg viewBox={`0 0 ${W} 74`} width="100%" className="mt-4 text-ink-600" role="img" aria-label={`Syringe drawn to ${formatUnits(units)}`}>
      {/* needle + hub, at the LEFT — the end the liquid sits against */}
      <line x1="2" y1={by + bh / 2} x2={bx - 12} y2={by + bh / 2} stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
      <rect x={bx - 12} y={by + bh / 2 - 1.5} width="12" height="3" fill="currentColor" opacity="0.5" />

      {/* barrel */}
      <rect x={bx} y={by} width={bw} height={bh} rx="4" fill="#0f141b" stroke="currentColor" strokeWidth="1" opacity="0.9" />

      {/* liquid fill */}
      <motion.rect
        x={bx}
        y={by + 1}
        height={bh - 2}
        rx="3"
        fill={fill}
        fillOpacity="0.28"
        initial={false}
        animate={{ width: Math.max(0, fillW) }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
      />

      {/* graduations */}
      {ticks.map((u) => {
        const tx = bx + (u / barrelUnits) * bw;
        return (
          <g key={u}>
            <line x1={tx} y1={by} x2={tx} y2={by + 7} stroke="currentColor" strokeWidth="0.75" opacity="0.5" />
            <text x={tx} y={by - 3} textAnchor="middle" fontSize="7" fill="currentColor" opacity="0.6">
              {u}
            </text>
          </g>
        );
      })}

      {/* plunger — its TIP sits at the draw mark, rod and flange trailing right.
          It moves when the dose or the diluent changes, which is the point. */}
      <motion.g initial={false} animate={{ x: markX }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
        <rect x={0} y={by + 1} width="4" height={bh - 2} rx="1" fill="currentColor" opacity="0.75" />
        <rect x={4} y={by + bh / 2 - 3} width={W - 12 - bx} height="6" fill="currentColor" opacity="0.35" />
      </motion.g>
      <rect x={W - 8} y={by - 6} width="6" height={bh + 12} rx="2" fill="currentColor" opacity="0.6" />

      {/* draw pointer */}
      {!exceeds && (
        <motion.g initial={false} animate={{ x: markX }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
          <line x1={0} y1={by - 2} x2={0} y2={by + bh + 2} stroke={fill} strokeWidth="1.5" />
          <text x={0} y={by + bh + 12} textAnchor="middle" fontSize="8" fill={fill} className="font-medium">
            {formatUnits(units)}
          </text>
        </motion.g>
      )}
    </svg>
  );
}
