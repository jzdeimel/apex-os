"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Droplets, TrendingUp, TrendingDown, Minus, Plus, CalendarClock } from "lucide-react";
import {
  hematocritView,
  nextEligible,
  ZONE_COPY,
  CAUTION_HCT,
  HOLD_HCT,
  DROP_PER_DONATION,
  type HctZone,
} from "@/lib/clinical/hematocrit";
import { useDonations, logDonation, KIND_LABEL, type DonationKind } from "@/lib/clinical/donationStore";
import { VIEWER } from "@/lib/viewer";
import { formatDate } from "@/lib/utils";

/**
 * Haematocrit trend + blood-donation log, on the clinical surface.
 *
 * Kept beside the titration assistant because HCT is the gate the whole dosing
 * decision turns on. The threshold lines (52% caution, 54% hold) are drawn on
 * the trend so the trajectory toward them is visible, not just the current
 * value. Donations are logged as clinical events and annotate the trend.
 */

const NOW = "2026-06-12T09:00:00";

const ZONE_RING: Record<HctZone, string> = {
  "in-range": "text-emerald border-emerald/30 bg-emerald/5",
  watch: "text-low border-low/30 bg-low/5",
  caution: "text-gold-300 border-gold-400/30 bg-gold-400/5",
  hold: "text-high border-high/40 bg-high/10",
};

export function HematocritTracker({ clientId }: { clientId: string }) {
  const view = useMemo(() => hematocritView(clientId), [clientId]);
  const { donations, hydrated } = useDonations(clientId);

  if (!view.hasData) {
    return (
      <div className="rounded-panel border border-ink-800 bg-ink-900/40 px-5 py-6 text-center text-detail text-ink-500">
        No haematocrit on file to trend yet.
      </div>
    );
  }

  const lastDonation = donations[donations.length - 1];
  const eligibility = lastDonation ? nextEligible(lastDonation.date, NOW) : null;
  const TrendIcon = view.trend === "rising" ? TrendingUp : view.trend === "falling" ? TrendingDown : Minus;

  return (
    <div className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex items-center gap-2 border-b border-ink-800/70 px-5 py-4">
        <Droplets className="h-4 w-4 text-high" aria-hidden />
        <h3 className="text-heading text-ink-50">Haematocrit &amp; blood donation</h3>
      </header>

      <div className="space-y-4 px-5 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="stat-mono text-display leading-none text-ink-50">
              {view.value}
              <span className="ml-1 text-heading text-ink-400">{view.unit}</span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-detail text-ink-500">
              <TrendIcon className="h-3.5 w-3.5" aria-hidden />
              {view.delta === null ? "single draw on file" : `${view.delta > 0 ? "+" : ""}${view.delta}${view.unit} across draws`}
            </p>
          </div>
          <span className={"rounded-full border px-3 py-1 text-micro font-medium " + ZONE_RING[view.zone]}>
            {ZONE_COPY[view.zone].label}
          </span>
        </div>

        <HctChart view={view} donations={donations.map((d) => d.date)} />

        <p className={"rounded-control border px-3 py-2.5 text-detail leading-relaxed " + ZONE_RING[view.zone]}>
          {ZONE_COPY[view.zone].clinical}
        </p>

        {/* Donation log + eligibility */}
        <div className="rounded-control border border-ink-800 bg-ink-900/40 p-4">
          <div className="flex items-center justify-between">
            <p className="text-detail font-medium text-ink-100">Donation history</p>
            {eligibility && (
              <span className="flex items-center gap-1.5 text-micro text-ink-500">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                {eligibility.eligible ? "Eligible to donate now" : `Eligible in ${eligibility.days}d`}
              </span>
            )}
          </div>

          {!hydrated ? (
            <div className="mt-3 h-5 animate-pulse rounded bg-ink-800/40" />
          ) : donations.length === 0 ? (
            <p className="mt-2 text-detail text-ink-500">No donations recorded. Log one when it happens — it explains a drop on the next panel.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {donations
                .slice()
                .reverse()
                .map((d) => (
                  <li key={d.id} className="flex items-center justify-between text-detail">
                    <span className="text-ink-200">{KIND_LABEL[d.kind]}</span>
                    <span className="text-ink-500">{formatDate(d.date)}</span>
                  </li>
                ))}
            </ul>
          )}

          <DonationForm clientId={clientId} />
          <p className="mt-2 text-micro leading-relaxed text-ink-600">
            A donation typically drops haematocrit by ~{DROP_PER_DONATION} points. Apex records that it
            happened; the actual value comes from the next panel, not an estimate.
          </p>
        </div>
      </div>
    </div>
  );
}

function DonationForm({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("2026-06-12");
  const [kind, setKind] = useState<DonationKind>("red-cross");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-control border border-ink-700 px-3 py-1.5 text-detail text-ink-300 transition-colors hover:text-ink-50"
      >
        <Plus className="h-3.5 w-3.5" /> Log a donation
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-control border border-ink-700 bg-ink-900/60 p-3">
      <div className="flex flex-wrap gap-2">
        {(["red-cross", "therapeutic-phlebotomy"] as DonationKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={
              "rounded-control border px-2.5 py-1 text-micro transition-colors " +
              (kind === k ? "border-high/40 bg-high/5 text-high" : "border-ink-700 text-ink-400 hover:text-ink-100")
            }
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full rounded-control border border-ink-700 bg-ink-900/70 px-2.5 py-1.5 text-detail text-ink-100 focus-ring"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            logDonation({
              clientId,
              date,
              kind,
              actorId: VIEWER.id,
              actorName: VIEWER.name,
              actorRole: VIEWER.role,
            });
            setOpen(false);
          }}
          className="focus-ring flex-1 rounded-control bg-high px-3 py-1.5 text-detail font-medium text-white transition-colors hover:bg-high/90"
        >
          Record — writes to the ledger
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="focus-ring rounded-control border border-ink-700 px-3 py-1.5 text-detail text-ink-400 hover:text-ink-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** HCT trend with reference, caution (52) and hold (54) lines, plus donation ticks. */
function HctChart({ view, donations }: { view: ReturnType<typeof hematocritView>; donations: string[] }) {
  const W = 320;
  const H = 120;
  const pad = { l: 4, r: 26, t: 10, b: 16 };
  const vals = view.series.map((s) => s.value);
  const lo = Math.min(...vals, view.refHigh) - 2;
  const hi = Math.max(...vals, HOLD_HCT + 1);
  const span = Math.max(hi - lo, 0.001);
  const x = (i: number) => pad.l + (i / Math.max(view.series.length - 1, 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - ((v - lo) / span) * (H - pad.t - pad.b);
  const path = view.series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(s.value).toFixed(1)}`).join(" ");
  const last = view.series.length - 1;

  const lineAt = (v: number, color: string, label: string) => (
    <g>
      <line x1={pad.l} y1={y(v)} x2={W - pad.r} y2={y(v)} stroke={color} strokeWidth="0.75" strokeDasharray="3 3" opacity="0.7" />
      <text x={W - pad.r + 2} y={y(v) + 3} fontSize="7" fill={color} opacity="0.9">
        {label}
      </text>
    </g>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="text-ink-600" role="img" aria-label="Haematocrit trend">
      {/* hold zone shading above 54 */}
      <rect x={pad.l} y={y(hi)} width={W - pad.l - pad.r} height={Math.max(0, y(HOLD_HCT) - y(hi))} fill="var(--c-high)" opacity="0.08" />
      {lineAt(view.refHigh, "var(--chart-axis)", `ref ${view.refHigh}`)}
      {lineAt(CAUTION_HCT, "var(--c-watch)", `${CAUTION_HCT}`)}
      {lineAt(HOLD_HCT, "var(--c-high)", `${HOLD_HCT}`)}

      <motion.path
        d={path}
        fill="none"
        stroke="var(--c-watch)"
        strokeWidth="1.8"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
      {view.series.map((s, i) => (
        <circle key={i} cx={x(i)} cy={y(s.value)} r={i === last ? 3 : 1.8} fill="var(--c-watch)" />
      ))}
    </svg>
  );
}
