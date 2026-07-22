"use client";

import { useMemo, useState } from "react";
import { Syringe, RotateCcw, Info, Check } from "lucide-react";
import type { Client } from "@/lib/types";
import {
  INJECTION_SITES,
  SITE_LOAD_WINDOW_DAYS,
  SITE_REST_DAYS,
  type InjectionSite,
  type SiteLoad,
  type SiteState,
  injectableNames,
  logSite,
  maxUsesIn,
  recommendNextSite,
  rotationHeadline,
  siteHistory,
  siteLoad,
  sitesForView,
} from "@/lib/protocol/sites";
import { appendLedger } from "@/lib/trace/ledger";
import { Card, CardContent, Badge, Button, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";

/**
 * The body map.
 *
 * Small feature, and it is the one that makes a member say "they actually know
 * what I do every Tuesday morning". Rotating sites is the single piece of a
 * hormone or peptide protocol the member owns entirely, and until now the only
 * record of it was their memory.
 *
 * WHAT THIS SCREEN NEVER SAYS: how much, how often, or what to inject. It is a
 * map of WHERE, and the copy is written so that no sentence could be mistaken
 * for a clinical instruction. See the module header in lib/protocol/sites.ts.
 *
 * Layout is single-column at 390px. The two silhouettes sit side by side even
 * on a phone (`grid-cols-2`) because they are tall and narrow — stacking them
 * would push the back view a full screen below the front.
 */

const NOW = "2026-06-12T09:00:00";

/** Colour per state. Clinical semantics, reused rather than invented. */
const STATE_STYLE: Record<SiteState, { dot: string; ring: string; badge: "high" | "watch" | "optimal" | "neutral"; label: string }> = {
  overused: { dot: "bg-high", ring: "ring-high/40", badge: "high", label: "Overused" },
  resting: { dot: "bg-watch", ring: "ring-watch/40", badge: "watch", label: "Resting" },
  ready: { dot: "bg-optimal", ring: "ring-optimal/40", badge: "optimal", label: "Rested" },
  unused: { dot: "bg-ink-500", ring: "ring-ink-500/40", badge: "neutral", label: "Unused" },
};

/**
 * An abstract mannequin rather than an anatomical illustration.
 *
 * Deliberate: a realistic body render invites a member to read precision into
 * the dot placement that a rotation tracker cannot support. Simple shapes say
 * "roughly here, this side" — which is exactly the claim being made.
 */
function Silhouette({ view }: { view: "front" | "back" }) {
  return (
    <svg
      viewBox="0 0 100 200"
      aria-hidden
      className="absolute inset-0 h-full w-full"
      fill="currentColor"
    >
      <ellipse cx="50" cy="24" rx="11" ry="14" />
      <rect x="34" y="42" width="32" height="62" rx="13" />
      <rect x="22" y="48" width="10" height="52" rx="5" />
      <rect x="68" y="48" width="10" height="52" rx="5" />
      <rect x="36" y="100" width="28" height="22" rx="10" />
      <rect x="37" y="120" width="12" height="70" rx="6" />
      <rect x="51" y="120" width="12" height="70" rx="6" />
      {/* The only thing distinguishing the two figures: a spine line on the
          back view. Enough to orient, not enough to over-claim. */}
      {view === "back" && (
        <rect x="49" y="44" width="2" height="58" rx="1" className="text-white" fill="currentColor" opacity={0.5} />
      )}
    </svg>
  );
}

function BodyMap({
  view,
  loads,
  selected,
  recommended,
  onSelect,
}: {
  view: "front" | "back";
  loads: Record<InjectionSite, SiteLoad>;
  selected: InjectionSite | null;
  recommended: InjectionSite | null;
  onSelect: (site: InjectionSite) => void;
}) {
  return (
    <div className="hairline rounded-panel bg-ink-900/50 p-3">
      <p className="text-center text-micro uppercase tracking-wide text-ink-500">
        {view === "front" ? "Front" : "Back"}
      </p>
      <div className="relative mx-auto mt-2 aspect-[1/2] w-full max-w-[150px] text-ink-800">
        <Silhouette view={view} />
        {sitesForView(view).map((meta) => {
          const load = loads[meta.id];
          const style = STATE_STYLE[load.state];
          const isSelected = selected === meta.id;
          const isNext = recommended === meta.id;
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() => onSelect(meta.id)}
              aria-pressed={isSelected}
              aria-label={`${meta.label} — ${style.label}. ${load.note}`}
              title={`${meta.label} — ${style.label}`}
              style={{ left: `${meta.x}%`, top: `${(meta.y / 200) * 100}%` }}
              className={cn(
                "focus-ring absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 transition-transform",
                "grid place-items-center hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100",
                style.ring,
                isSelected && "scale-110 ring-4 ring-ink-50/70 motion-reduce:scale-100",
              )}
            >
              <span className={cn("block h-3.5 w-3.5 rounded-full", style.dot)} />
              {/* The suggestion is marked on the map itself, not only in the
                  card above it — a member taps the figure first. */}
              {isNext && (
                <span
                  aria-hidden
                  className="absolute -inset-1 rounded-full border-2 border-dashed border-optimal/80"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function InjectionSites({ client }: { client: Client }) {
  const { toast } = useToast();
  /**
   * The site log lives in a module-level store (same shape as the ledger and
   * the subscription book), so a bump counter is what tells React that an
   * append happened. Cheaper and more honest than mirroring the log into
   * component state, where the two copies would drift.
   */
  const [version, bump] = useState(0);
  const [selected, setSelected] = useState<InjectionSite | null>(null);
  const [item, setItem] = useState("");

  const names = useMemo(() => injectableNames(client.id), [client.id]);

  const { loads, list, next, headline, history } = useMemo(() => {
    const list = siteLoad(client.id, SITE_LOAD_WINDOW_DAYS, NOW);
    const loads = Object.fromEntries(list.map((l) => [l.site, l])) as Record<InjectionSite, SiteLoad>;
    return {
      list,
      loads,
      next: recommendNextSite(client.id, NOW),
      headline: rotationHeadline(client.id, NOW),
      history: siteHistory(client.id).slice(0, 8),
    };
    // `version` is the dependency that matters — it is what changes after a log.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id, version]);

  const active = selected ? loads[selected] : null;
  const target = active ?? (next ? loads[next.site] : null);

  function handleLog(site: InjectionSite) {
    const entry = logSite(client.id, site, NOW, item || undefined);

    // The member is the actor here. A log the member wrote and a log a coach
    // wrote are different events and the ledger has to be able to tell them
    // apart — which is why actorRole is "Client" rather than a staff role.
    appendLedger({
      actorId: client.id,
      actorName: `${client.firstName} ${client.lastName}`,
      actorRole: "Client",
      action: "create",
      entity: "protocol",
      entityId: entry.id,
      subjectId: client.id,
      subjectName: `${client.firstName} ${client.lastName}`,
      locationId: client.locationId,
      reason: "Member logged an injection site from the portal",
      after: {
        site: loads[site].meta.label,
        anatomical: loads[site].meta.anatomical,
        ...(item ? { item } : {}),
      },
    });

    setSelected(site);
    bump((v) => v + 1);
    toast("Site logged", { desc: `${loads[site].meta.label} — your rotation is updated.` });
  }

  if (names.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 sm:p-6">
          <p className="text-body leading-relaxed text-ink-300">
            Nothing on your plan is injected right now, so there is nothing to rotate. If that changes,
            this map fills in on its own.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Headline ---------------------------------------------------------- */}
      <Card>
        <CardContent className="flex items-start gap-3 p-5 sm:p-6">
          <RotateCcw
            className={cn("mt-0.5 h-5 w-5 shrink-0", headline.tone === "good" ? "text-optimal" : "text-watch")}
          />
          <div className="min-w-0">
            <p className="text-body leading-relaxed text-ink-100">{headline.text}</p>
            <p className="mt-2 text-detail leading-relaxed text-ink-500">
              Using the same spot over and over thickens the tissue underneath it. It does not hurt, which
              is exactly why it goes unnoticed — and thickened tissue absorbs unevenly. Giving each spot
              about {SITE_REST_DAYS} days off is all it takes.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Use this next ------------------------------------------------------ */}
      {next && (
        <Card className="border-optimal/25 bg-optimal/[0.04]">
          <CardContent className="p-5 sm:p-6">
            <p className="label-eyebrow">Use this next</p>
            <h2 className="mt-1.5 font-display text-title font-semibold tracking-tight text-ink-50">
              {next.meta.label}
            </h2>
            <p className="mt-1 text-detail text-ink-500">
              {next.meta.anatomical} · {next.meta.tissue}
            </p>
            <p className="mt-3 max-w-prose text-body leading-relaxed text-ink-300">{next.reason}</p>
            {next.alternate && (
              <p className="mt-2 text-detail leading-relaxed text-ink-500">
                If that one is sore or awkward to reach, your{" "}
                {loads[next.alternate].meta.label.toLowerCase()} is the next best rested.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* The map ------------------------------------------------------------ */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <h2 className="font-display text-title font-semibold text-ink-50">Your map</h2>
          <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
            Tap a spot to see when you last used it. The dashed circle is the one we suggest next. Front
            view is drawn facing you and the back view from behind — go by the label, not the side of the
            picture.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <BodyMap
              view="front"
              loads={loads}
              selected={selected}
              recommended={next?.site ?? null}
              onSelect={setSelected}
            />
            <BodyMap
              view="back"
              loads={loads}
              selected={selected}
              recommended={next?.site ?? null}
              onSelect={setSelected}
            />
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            {(["ready", "resting", "overused", "unused"] as SiteState[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-micro text-ink-400">
                <span className={cn("h-2.5 w-2.5 rounded-full", STATE_STYLE[s].dot)} />
                {STATE_STYLE[s].label}
              </span>
            ))}
          </div>

          {/* Selected site + the log action ---------------------------------- */}
          {target && (
            <div className="mt-5 rounded-panel border border-ink-700 bg-ink-900 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-heading font-semibold text-ink-50">{target.meta.label}</h3>
                <Badge tone={STATE_STYLE[target.state].badge}>{STATE_STYLE[target.state].label}</Badge>
              </div>
              <p className="mt-1 text-detail text-ink-500">
                {target.meta.anatomical} · {target.meta.tissue}
              </p>
              <p className="mt-3 text-body leading-relaxed text-ink-300">{target.note}</p>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <label
                    htmlFor="site-item"
                    className="block text-micro uppercase tracking-wide text-ink-500"
                  >
                    What went in (optional)
                  </label>
                  <Select
                    id="site-item"
                    className="mt-1.5"
                    value={item}
                    onChange={(e) => setItem(e.target.value)}
                  >
                    <option value="">Not saying</option>
                    {names.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button variant="primary" onClick={() => handleLog(target.site)} className="w-full sm:w-auto">
                  <Syringe className="h-4 w-4" />
                  Log this site
                </Button>
              </div>
              <p className="mt-3 flex items-start gap-2 text-micro leading-relaxed text-ink-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                We record the spot and the date. We never record an amount here — that lives on the order
                your provider signed.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Load table --------------------------------------------------------- */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <h2 className="font-display text-title font-semibold text-ink-50">Last {SITE_LOAD_WINDOW_DAYS} days</h2>
          <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
            Every spot you have, including the ones you have not touched. More than{" "}
            <span className="stat-mono">{maxUsesIn(SITE_LOAD_WINDOW_DAYS)}</span> uses in this window means
            that spot did not get its {SITE_REST_DAYS} days off between turns.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {list.map((l) => (
              <button
                key={l.site}
                type="button"
                onClick={() => setSelected(l.site)}
                className={cn(
                  "focus-ring hairline flex items-center gap-3 rounded-panel bg-ink-900/50 p-3 text-left transition-colors hover:bg-ink-900",
                  selected === l.site && "bg-ink-900 ring-1 ring-ink-600",
                )}
              >
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", STATE_STYLE[l.state].dot)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-detail text-ink-100">{l.meta.label}</span>
                  <span className="block truncate text-micro text-ink-500">
                    {l.daysSince === null
                      ? "Never used"
                      : l.daysSince === 0
                        ? "Used today"
                        : `${l.daysSince}d ago`}
                  </span>
                </span>
                <span className="stat-mono shrink-0 text-detail text-ink-300">{l.count}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent log --------------------------------------------------------- */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <h2 className="font-display text-title font-semibold text-ink-50">Recently logged</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-detail text-ink-400">Nothing logged yet. Tap a spot above after your next one.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {history.map((h) => (
                <li key={h.id} className="hairline flex items-center gap-3 rounded-panel bg-ink-900/50 p-3">
                  <Check className="h-4 w-4 shrink-0 text-optimal" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-detail text-ink-100">
                      {INJECTION_SITES.includes(h.site) ? loads[h.site].meta.label : h.site}
                    </span>
                    {h.itemName && (
                      <span className="block truncate text-micro text-ink-500">{h.itemName}</span>
                    )}
                  </span>
                  <span className="stat-mono shrink-0 text-micro text-ink-400">{formatDate(h.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
