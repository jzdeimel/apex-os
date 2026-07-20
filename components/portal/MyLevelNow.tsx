"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Activity, Info } from "lucide-react";
import { prescriptionsForClient, type Prescription } from "@/lib/dosing/prescriptions";
import { pkFor } from "@/lib/peptides/pharmacokinetics";
import {
  personalCurve,
  concentrationCurve,
  humanDuration,
  type CurvePoint,
} from "@/lib/peptides/pharmacokinetics";
import { useMemberLog } from "@/lib/member/logStore";
import { absolute } from "@/lib/utils";

/**
 * "Your level right now" — personalised pharmacokinetics from REAL logged doses.
 *
 * The PK curve elsewhere in the app draws an idealised schedule. This one draws
 * the member's own: it reads the exact times they logged each dose and sums a
 * decay term for every one, so the line dips where they missed a day and climbs
 * where they caught up. The marker on it is NOW — their predicted blood level at
 * this moment, from their own behaviour.
 *
 * This is only possible because three things now exist together: the PK engine,
 * real dose logging (lib/member/logStore.tsx), and a history to read them from.
 * No consumer health app draws a personalised concentration curve from a
 * patient's actual adherence, and it is the clearest possible answer to "why
 * should I log every dose" — because the log is the thing that makes this real.
 *
 * HONESTY, THE SAME DISCIPLINE AS EVERYWHERE
 *  - A compound with no characterised human half-life gets NO curve. BPC-157 is
 *    not going to have a fabricated line drawn through it.
 *  - Fewer than two logged doses is not a curve. One point cannot show
 *    accumulation, so the component shows the schedule reference and invites the
 *    member to log, rather than inventing a personal trend over a single dose.
 *  - The y-axis is relative (a single first dose = 1.0). It deliberately does
 *    NOT claim a concentration in ng/mL, which would be a number nobody has
 *    measured. It shows the SHAPE of accumulation, which is the true and useful
 *    part.
 */

const W = 320;
const H = 132;
const PAD = { l: 8, r: 8, t: 14, b: 20 };

export function MyLevelNow({ clientId, iso }: { clientId: string; iso: string }) {
  const { history, today, hydrated } = useMemberLog();

  // Only compounds the member is actually on, that have a characterised
  // half-life. Everything else is honestly excluded rather than faked.
  const rxs = prescriptionsForClient(clientId).filter((rx) => {
    const pk = rx.libraryKey ? pkFor(rx.libraryKey) : undefined;
    return pk?.characterised && pk.halfLifeHours !== null;
  });

  if (rxs.length === 0) return null;

  return (
    <section className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex items-center gap-2 border-b border-ink-800/70 px-5 py-4">
        <Activity className="h-4 w-4 text-gold-400" aria-hidden />
        <h2 className="text-heading text-ink-50">Where your levels are now</h2>
      </header>
      <div className="space-y-6 px-5 py-5">
        {rxs.map((rx) => (
          <LevelCard key={rx.id} rx={rx} history={history} today={today} iso={iso} hydrated={hydrated} />
        ))}
        <p className="flex items-start gap-1.5 border-t border-ink-800/70 pt-3 text-micro leading-relaxed text-ink-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Drawn from the doses you logged, using each compound&apos;s published half-life. The
            shape is real; the scale is relative, not a blood concentration — that comes from a
            panel, not a model.
          </span>
        </p>
      </div>
    </section>
  );
}

function LevelCard({
  rx,
  history,
  today,
  iso,
  hydrated,
}: {
  rx: Prescription;
  history: { date: string; doses: { rxId: string; takenAt: string; skipped?: boolean }[] }[];
  today: { doses: { rxId: string; takenAt: string; skipped?: boolean }[] };
  iso: string;
  hydrated: boolean;
}) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const pk = pkFor(rx.libraryKey ?? "")!;
  const half = pk.halfLifeHours!;
  const interval = pk.typicalIntervalHours;

  // Every actual, non-skipped administration of THIS prescription, across the
  // member's logged history and today.
  const allDays = [...history, today];
  const takenIso = allDays
    .flatMap((d) => d.doses)
    .filter((d) => d.rxId === rx.id && !d.skipped)
    .map((d) => d.takenAt);

  const nowMs = absolute(iso).getTime();

  // Window start is the first logged dose (or, absent any, a look-back so the
  // schedule reference has somewhere to live).
  const takenMs = takenIso.map((t) => absolute(t).getTime()).sort((a, b) => a - b);
  const windowStart = takenMs.length ? takenMs[0] : nowMs - half * 3 * 3_600_000;
  const toHours = (ms: number) => (ms - windowStart) / 3_600_000;
  const doseHours = takenMs.map(toHours);
  const nowHour = toHours(nowMs);

  const personal = personalCurve({
    halfLifeHours: half,
    doseHours,
    nowHour,
    intervalHours: interval,
  });

  // The schedule reference — what perfectly regular dosing would look like —
  // drawn faintly behind the personal line so the member sees their own against
  // the ideal without it reading as a target they are failing to hit.
  const reference =
    interval != null
      ? concentrationCurve({
          halfLifeHours: half,
          intervalHours: interval,
          doses: Math.max(4, doseHours.length + 1),
          resolution: 24,
          tailIntervals: 1,
        })
      : null;

  // Shared vertical scale so personal and reference overlay truthfully.
  const maxLevel =
    Math.max(
      1,
      ...personal.points.map((p) => p.level),
      ...(reference?.map((p) => p.level) ?? []),
    ) * 1.08;

  const drawn = personal.hasEnough;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-body font-medium text-ink-50">{rx.name}</p>
          <p className="text-detail text-ink-500">
            {takenMs.length} dose{takenMs.length === 1 ? "" : "s"} logged · half-life {pk.display}
          </p>
        </div>
        {/* Clamped to 100%. A relative level can briefly exceed the nominal
            steady-state peak right after a dose, and "115% of steady state"
            reads to a patient as an overdose warning rather than the reassurance
            it is. You cannot be more than fully built up in any way worth
            alarming someone over, so the ceiling is 100. */}
        {drawn && personal.pctOfSteadyState != null && (
          <div className="text-right">
            <p className="stat-mono text-title leading-none text-gold-300">
              {Math.round(Math.min(personal.pctOfSteadyState, 1) * 100)}
              <span className="text-heading text-ink-400">%</span>
            </p>
            <p className="text-micro uppercase text-ink-500">of steady state</p>
          </div>
        )}
      </div>

      {!hydrated ? (
        <div className="mt-3 h-[132px] animate-pulse rounded-control bg-ink-800/40" />
      ) : !drawn ? (
        <div className="mt-3 rounded-control border border-ink-800 bg-ink-900/40 px-4 py-3">
          <p className="text-detail leading-relaxed text-ink-300">
            Log a couple of doses and your own curve appears here — the real one, from when you
            actually took them, not an average.
          </p>
        </div>
      ) : (
        <MiniChart
          uid={uid}
          personal={personal.points}
          reference={reference}
          nowHour={personal.nowHour}
          maxLevel={maxLevel}
          reduce={!!reduce}
          accent="#e0bd6e"
        />
      )}

      {drawn && (
        <p className="mt-2 text-micro leading-relaxed text-ink-500">
          {personal.pctOfSteadyState != null && personal.pctOfSteadyState >= 0.9 ? (
            <>You&apos;re at the level consistent dosing holds. Staying on schedule keeps it here.</>
          ) : personal.pctOfSteadyState != null && personal.pctOfSteadyState >= 0.6 ? (
            <>Still building. Each on-time dose moves you toward a steady level.</>
          ) : (
            <>Your level dipped — a gap in logged doses shows here. It recovers as you resume.</>
          )}{" "}
          {interval != null && <>Next dose brings it back up in ~{humanDuration(half)}.</>}
        </p>
      )}
    </div>
  );
}

function MiniChart({
  uid,
  personal,
  reference,
  nowHour,
  maxLevel,
  reduce,
  accent,
}: {
  uid: string;
  personal: CurvePoint[];
  reference: CurvePoint[] | null;
  nowHour: number;
  maxLevel: number;
  reduce: boolean;
  accent: string;
}) {
  const hours = personal.map((p) => p.hour);
  const minH = Math.min(...hours);
  const maxH = Math.max(...hours);
  const span = Math.max(maxH - minH, 1);

  const x = (h: number) => PAD.l + ((h - minH) / span) * (W - PAD.l - PAD.r);
  const y = (lvl: number) => H - PAD.b - (lvl / maxLevel) * (H - PAD.t - PAD.b);
  const path = (pts: CurvePoint[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.hour).toFixed(1)} ${y(p.level).toFixed(1)}`).join(" ");

  const nowX = x(nowHour);
  const nowLevel = personal.reduce((closest, p) =>
    Math.abs(p.hour - nowHour) < Math.abs(closest.hour - nowHour) ? p : closest,
  ).level;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="mt-3 text-ink-400" role="img" aria-label="Your concentration over time">
      <defs>
        <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="currentColor" opacity="0.14" />

      {/* Schedule reference: what perfect regularity looks like, faint. */}
      {reference && (
        <path d={path(reference)} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.28" />
      )}

      {/* Personal curve — filled, then the line, then it draws itself in. */}
      <path d={`${path(personal)} L${x(maxH).toFixed(1)} ${H - PAD.b} L${x(minH).toFixed(1)} ${H - PAD.b} Z`} fill={`url(#fill-${uid})`} />
      <motion.path
        d={path(personal)}
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 0.7, ease: "easeOut" }}
      />

      {/* NOW — the whole point. A line, a dot on the curve, a label. */}
      <line x1={nowX} y1={PAD.t} x2={nowX} y2={H - PAD.b} stroke={accent} strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
      <motion.circle
        cx={nowX}
        cy={y(nowLevel)}
        r="4"
        fill={accent}
        initial={reduce ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: reduce ? 0 : 0.7, type: "spring", stiffness: 400, damping: 18 }}
      />
      <text x={nowX} y={PAD.t - 3} textAnchor="middle" fontSize="8" fill={accent} className="font-medium">
        now
      </text>
    </svg>
  );
}
