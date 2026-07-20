"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Syringe, RotateCcw, Info } from "lucide-react";
import { useMemberLog, INJECTION_SITES, suggestNextSite } from "@/lib/member/logStore";
import { prescriptionsForClient } from "@/lib/dosing/prescriptions";
import { absolute } from "@/lib/utils";

/**
 * The injection-site rotation map.
 *
 * WHY THIS EARNS ITS PLACE
 * ------------------------
 * Repeatedly injecting the same spot is the most common self-inflicted reason an
 * otherwise-correct protocol underperforms: the tissue fibroses, absorption
 * drops, and a member who is dosing exactly as prescribed still reads low. The
 * fix is rotation, and rotation is a memory problem — nobody recalls which side
 * of which thigh they used nine days ago. So the app remembers, and it shows the
 * body the way the member experiences it: as a map, not a list.
 *
 * WHAT IT IS, HONESTLY
 * --------------------
 * Drawn entirely from real logged doses (lib/member/logStore.tsx already records
 * `site` on every injection and `suggestNextSite` already picks the next one).
 * This component adds no new data — it reads what the member has been logging and
 * makes the pattern visible. A site the member has never used is shown neutral,
 * not invented as "healthy". The rotation call is a nudge, never a lock: the
 * member can inject wherever they need to, because they know what is bruised and
 * the app does not.
 *
 * It draws nothing for a member with no rotating injectables — an oral or a
 * once-weekly oil with no site rotation gets no map, rather than an empty body.
 */

/* Where each logged site sits on the two silhouettes. `view` decides which
   figure it lands on; x/y are percentages within that figure's viewBox. */
const SITE_GEO: Record<string, { view: "front" | "back"; x: number; y: number; label: string }> = {
  "Abdomen — left": { view: "front", x: 58, y: 44, label: "Abdomen L" },
  "Abdomen — right": { view: "front", x: 42, y: 44, label: "Abdomen R" },
  "Thigh — left": { view: "front", x: 60, y: 68, label: "Thigh L" },
  "Thigh — right": { view: "front", x: 40, y: 68, label: "Thigh R" },
  "Glute — left": { view: "back", x: 59, y: 52, label: "Glute L" },
  "Glute — right": { view: "back", x: 41, y: 52, label: "Glute R" },
};

const DAY_MS = 86_400_000;
/** A site is "resting" once this many days have passed since it was last used. */
const REST_DAYS = 6;
/** This many uses inside the window reads as overuse worth flagging. */
const OVERUSE_IN_WINDOW = 3;
const WINDOW_DAYS = 14;

interface SiteStat {
  site: string;
  uses: number; // within the window
  lastMs: number | null; // most recent use, ms
  daysSince: number | null;
}

type SiteState = "overused" | "recent" | "rested" | "unused";

function stateOf(s: SiteStat): SiteState {
  if (s.lastMs === null) return "unused";
  if (s.uses >= OVERUSE_IN_WINDOW) return "overused";
  if (s.daysSince !== null && s.daysSince < REST_DAYS) return "recent";
  return "rested";
}

const STATE_STYLE: Record<SiteState, { fill: string; ring: string; label: string }> = {
  overused: { fill: "#f87171", ring: "rgba(248,113,113,0.35)", label: "Overused" },
  recent: { fill: "#e0bd6e", ring: "rgba(224,189,110,0.30)", label: "Recovering" },
  rested: { fill: "#34d399", ring: "rgba(52,211,153,0.30)", label: "Rested — good to use" },
  unused: { fill: "#4b5563", ring: "rgba(75,85,99,0.25)", label: "Not used recently" },
};

export function InjectionSiteMap({ clientId, iso }: { clientId: string; iso: string }) {
  const { history, today, hydrated } = useMemberLog();

  // Only render for a member who actually rotates sites on something.
  const rotates = prescriptionsForClient(clientId).some((rx) => rx.rotateSites);
  if (!rotates) return null;

  const nowMs = absolute(iso).getTime();

  const { stats, recentOrder, suggested, everUsed } = useMemo(() => {
    const allDoses = [...history, today].flatMap((d) => d.doses).filter((d) => !d.skipped && d.site);
    const withMs = allDoses
      .map((d) => ({ site: d.site as string, ms: absolute(d.takenAt).getTime() }))
      .sort((a, b) => a.ms - b.ms);

    const stats: Record<string, SiteStat> = {};
    for (const site of INJECTION_SITES) {
      stats[site] = { site, uses: 0, lastMs: null, daysSince: null };
    }
    for (const d of withMs) {
      if (!stats[d.site]) stats[d.site] = { site: d.site, uses: 0, lastMs: null, daysSince: null };
      const withinWindow = nowMs - d.ms <= WINDOW_DAYS * DAY_MS;
      if (withinWindow) stats[d.site].uses += 1;
      if (stats[d.site].lastMs === null || d.ms > (stats[d.site].lastMs as number)) {
        stats[d.site].lastMs = d.ms;
      }
    }
    for (const site of Object.keys(stats)) {
      const last = stats[site].lastMs;
      stats[site].daysSince = last === null ? null : Math.floor((nowMs - last) / DAY_MS);
    }

    const recentOrder = withMs.map((d) => d.site);
    const everUsed = withMs.length;
    const suggested = suggestNextSite(recentOrder);
    return { stats, recentOrder, suggested, everUsed };
  }, [history, today, nowMs]);

  const overused = INJECTION_SITES.filter((s) => stateOf(stats[s]) === "overused");

  return (
    <section className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex items-center gap-2 border-b border-ink-800/70 px-5 py-4">
        <Syringe className="h-4 w-4 text-gold-400" aria-hidden />
        <h2 className="text-heading text-ink-50">Where you&apos;re injecting</h2>
      </header>

      <div className="grid gap-5 px-5 py-5 sm:grid-cols-[1fr_1fr]">
        <BodyFigure view="front" title="Front" stats={stats} suggested={suggested} hydrated={hydrated} />
        <BodyFigure view="back" title="Back" stats={stats} suggested={suggested} hydrated={hydrated} />
      </div>

      <div className="space-y-3 border-t border-ink-800/70 px-5 py-4">
        {!hydrated ? (
          <div className="h-5 animate-pulse rounded bg-ink-800/40" />
        ) : everUsed === 0 ? (
          <p className="text-detail leading-relaxed text-ink-300">
            Log an injection and pick the site — your rotation map fills in here, so you never have to
            remember which side you used last.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-control border border-emerald/25 bg-emerald/5 px-3 py-2">
              <RotateCcw className="h-4 w-4 shrink-0 text-emerald" aria-hidden />
              <p className="text-detail text-ink-200">
                Next up: <span className="font-medium text-ink-50">{SITE_GEO[suggested]?.label ?? suggested}</span>
                <span className="text-ink-500"> — the site that&apos;s rested longest.</span>
              </p>
            </div>
            {overused.length > 0 && (
              <p className="text-detail leading-relaxed text-watch">
                {overused.map((s) => SITE_GEO[s]?.label ?? s).join(" and ")}{" "}
                {overused.length === 1 ? "has" : "have"} taken{" "}
                {overused.length === 1 ? "a lot of doses" : "a lot of doses each"} in the last two
                weeks. Giving {overused.length === 1 ? "it" : "them"} a break keeps absorption even.
              </p>
            )}
            {/* Legend — the colours are meaningless without it. */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
              {(["rested", "recent", "overused", "unused"] as SiteState[]).map((st) => (
                <span key={st} className="flex items-center gap-1.5 text-micro text-ink-500">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATE_STYLE[st].fill }} />
                  {STATE_STYLE[st].label}
                </span>
              ))}
            </div>
          </>
        )}
        <p className="flex items-start gap-1.5 border-t border-ink-800/70 pt-3 text-micro leading-relaxed text-ink-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            A nudge, not a rule. Rotate away from a bruised or sore spot whenever you need to — the
            map just remembers so you don&apos;t have to.
          </span>
        </p>
      </div>
    </section>
  );
}

function BodyFigure({
  view,
  title,
  stats,
  suggested,
  hydrated,
}: {
  view: "front" | "back";
  title: string;
  stats: Record<string, SiteStat>;
  suggested: string;
  hydrated: boolean;
}) {
  const sites = INJECTION_SITES.filter((s) => SITE_GEO[s]?.view === view);
  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 text-micro uppercase tracking-[0.14em] text-ink-500">{title}</p>
      <svg viewBox="0 0 100 150" width="100%" className="max-w-[150px] text-ink-700" role="img" aria-label={`Injection sites, ${title.toLowerCase()} view`}>
        <Silhouette view={view} />
        {hydrated &&
          sites.map((site) => {
            const geo = SITE_GEO[site];
            const st = stateOf(stats[site]);
            const style = STATE_STYLE[st];
            const isNext = site === suggested;
            const days = stats[site].daysSince;
            return (
              <g key={site}>
                {isNext && (
                  <motion.circle
                    cx={geo.x}
                    cy={geo.y}
                    r="7"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="1"
                    initial={{ opacity: 0.2, scale: 0.8 }}
                    animate={{ opacity: [0.2, 0.6, 0.2], scale: [0.85, 1.15, 0.85] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
                <circle cx={geo.x} cy={geo.y} r="5.5" fill={style.ring} />
                <circle cx={geo.x} cy={geo.y} r="3.2" fill={style.fill}>
                  <title>
                    {geo.label} — {style.label}
                    {days !== null ? ` · last used ${days === 0 ? "today" : `${days}d ago`}` : ""}
                  </title>
                </circle>
              </g>
            );
          })}
      </svg>
    </div>
  );
}

/** A stylised torso-and-legs figure. Not anatomy — a place to put six dots that
    reads instantly as "front of body" / "back of body". */
function Silhouette({ view }: { view: "front" | "back" }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.55" strokeLinejoin="round" strokeLinecap="round">
      {/* head */}
      <circle cx="50" cy="14" r="8" />
      {/* torso */}
      <path d="M42 23 L58 23 L62 40 L60 62 L40 62 L38 40 Z" />
      {/* arms */}
      <path d="M42 25 L30 34 L27 54" />
      <path d="M58 25 L70 34 L73 54" />
      {/* legs */}
      <path d="M41 62 L38 100 L36 130" />
      <path d="M59 62 L62 100 L64 130" />
      <path d="M48 62 L48 100 M52 62 L52 100" opacity="0.4" />
      {view === "back" && (
        <line x1="50" y1="24" x2="50" y2="60" opacity="0.4" strokeDasharray="2 2" />
      )}
    </g>
  );
}
