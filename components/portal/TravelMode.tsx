"use client";

/**
 * Travel mode.
 *
 * The screen's whole job is to make one promise credible before the member
 * commits to anything: **your streak is safe.** Everything is laid out to be
 * read in that order — what pauses, what deliberately does not, and the streak
 * statement rendered as the loudest thing on the card rather than buried in a
 * footnote where a nervous member will miss it.
 *
 * The impact preview is computed from the real engine (`planTravel`) before the
 * member turns anything on, because a toggle whose consequences you can only
 * discover by pulling it is not a choice anyone actually made.
 *
 * The clinical boundary line is rendered verbatim from
 * `TravelImpact.clinicalBoundary` and is not paraphrased here. Travel mode
 * pauses reminders and shipments; it does not amend a prescription, and this
 * component must never imply otherwise.
 */

import { useEffect, useMemo, useState } from "react";
import { MotionConfig } from "framer-motion";
import { Flame, Package, PlaneTakeoff, Bell, BellOff, Check, ShieldCheck, Undo2 } from "lucide-react";
import { planTravel, startTravel, endTravel, travelFor } from "@/lib/account/travel";
import { locationMap } from "@/lib/mock/locations";
import { Badge, Button, Card, CardContent, Input } from "@/components/ui/primitives";
import { FadeIn, Stagger, StaggerItem } from "@/components/portal/still";
import { useToast } from "@/components/ui/Toast";
import { useMe, useMeClient } from "@/components/portal/PortalHeader";
import { cn, formatDate } from "@/lib/utils";

/** Pinned defaults so the demo opens on a sensible window with no clock read. */
const DEFAULT_FROM = "2026-06-20";
const DEFAULT_TO = "2026-06-30";

export function TravelMode() {
  // Audit fix (GAP_ANALYSIS.md, "Portal renderable as a woman"): was the ME
  // constant, which pinned this card to one hardcoded male member.
  const meId = useMe();
  const client = useMeClient();
  const { toast } = useToast();

  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [where, setWhere] = useState("Austin, TX");
  const [state, setState] = useState("TX");
  const [active, setActive] = useState(() => travelFor(meId));

  // Re-seed when the subject changes. The initialiser above runs once, on
  // mount, and `useMe()` deliberately reports the default on that first
  // render — the persisted choice lands one commit later. Without this the
  // card would show the default member's travel window to a different
  // member. Not merged into the initialiser: reading storage during render
  // is exactly the hydration mismatch useMe() exists to avoid.
  useEffect(() => {
    setActive(travelFor(meId));
  }, [meId]);

  const valid = from <= to && /^[A-Za-z]{2}$/.test(state.trim());

  const impact = useMemo(
    () => (valid ? planTravel(client, from, to, where, state) : null),
    [client, from, to, where, state, valid],
  );

  const homeState = locationMap[client.locationId]?.state ?? "NC";

  function enable() {
    if (!impact) return;
    setActive(startTravel(client, impact));
    toast("Travel mode on", { desc: `Reminders pause ${formatDate(from)}. Your streak is held, not broken.` });
  }

  function disable() {
    endTravel(client);
    setActive(null);
    toast("Travel mode off", { desc: "Reminders and shipments are back to normal." });
  }

  return (
    <MotionConfig reducedMotion="user">
      <Card className={cn(active && "border-gold-400/30")}>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <PlaneTakeoff className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
              <div>
                <p className="font-display text-heading font-semibold leading-tight text-ink-50">Travel mode</p>
                <p className="mt-1 max-w-prose text-detail leading-relaxed text-ink-400">
                  Going away? Tell us when and we'll stop pinging you in a timezone you're not in, hold anything that
                  was due to ship, and protect your streak while you're gone.
                </p>
              </div>
            </div>
            {active && (
              <Badge tone="gold">
                On · {active.from.slice(5)} → {active.to.slice(5)}
              </Badge>
            )}
          </div>

          {/* ── The dates ────────────────────────────────────────────────── */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="label-eyebrow">Leaving</span>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1.5"
                aria-label="First day away"
              />
            </label>
            <label className="block">
              <span className="label-eyebrow">Back</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1.5"
                aria-label="Last day away"
              />
            </label>
            <label className="block">
              <span className="label-eyebrow">Where</span>
              <Input
                value={where}
                onChange={(e) => setWhere(e.target.value)}
                placeholder="Austin, TX"
                className="mt-1.5"
                aria-label="Destination"
              />
            </label>
            <label className="block">
              <span className="label-eyebrow">State</span>
              <Input
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="TX"
                className="mt-1.5"
                aria-label="Destination state"
              />
            </label>
          </div>

          {/* We ask for the state for a specific reason and we say what it is.
              An unexplained field on a travel form reads as data collection. */}
          <p className="mt-2 text-micro leading-relaxed text-ink-500">
            We ask for the state because a telehealth visit legally happens where you are. If you need to be seen while
            you're away, we'll only offer you clinicians licensed in {state.trim() || homeState}.
          </p>

          {impact && (
            <FadeIn>
              {/* ── The promise, loud ─────────────────────────────────────── */}
              <div className="mt-5 rounded-panel border border-optimal/30 bg-optimal/5 p-4">
                <div className="flex items-start gap-3">
                  <Flame className="mt-0.5 h-5 w-5 shrink-0 text-optimal" />
                  <div>
                    <p className="font-display text-body font-semibold text-ink-50">
                      Your streak is safe. All <span className="stat-mono">{impact.days}</span> days.
                    </p>
                    <p className="mt-1 text-detail leading-relaxed text-ink-300">
                      Every day away is recorded as &ldquo;{impact.protectedReason}&rdquo; and counted as held, not
                      missed. Your number does not reset and it does not go backwards. You come home to the same streak
                      you left with.
                    </p>
                  </div>
                </div>
              </div>

              {/* ── What changes, what doesn't ────────────────────────────── */}
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <p className="label-eyebrow flex items-center gap-1.5">
                    <BellOff className="h-3 w-3" /> Goes quiet
                  </p>
                  <Stagger className="mt-2.5 grid grid-cols-1 gap-2">
                    {impact.pauses.map((p) => (
                      <StaggerItem key={p.label}>
                        <div className="rounded-panel border border-ink-700 bg-ink-900/40 p-3">
                          <p className="text-detail font-medium text-ink-100">{p.label}</p>
                          <p className="mt-0.5 text-detail leading-relaxed text-ink-400">{p.detail}</p>
                        </div>
                      </StaggerItem>
                    ))}
                  </Stagger>
                </div>

                <div>
                  <p className="label-eyebrow flex items-center gap-1.5">
                    <Bell className="h-3 w-3" /> Keeps working
                  </p>
                  <Stagger className="mt-2.5 grid grid-cols-1 gap-2">
                    {impact.continues.map((c) => (
                      <StaggerItem key={c.label}>
                        <div className="rounded-panel border border-ink-700 bg-ink-900/40 p-3">
                          <p className="flex items-center gap-1.5 text-detail font-medium text-ink-100">
                            <Check className="h-3 w-3 text-optimal" />
                            {c.label}
                          </p>
                          <p className="mt-0.5 text-detail leading-relaxed text-ink-400">{c.detail}</p>
                        </div>
                      </StaggerItem>
                    ))}
                  </Stagger>
                </div>
              </div>

              {/* ── Shipments ─────────────────────────────────────────────── */}
              {impact.heldShipments.length > 0 && (
                <div className="mt-4">
                  <p className="label-eyebrow flex items-center gap-1.5">
                    <Package className="h-3 w-3" /> Held until you're home
                  </p>
                  <div className="mt-2.5 grid grid-cols-1 gap-2">
                    {impact.heldShipments.map((s) => (
                      <div key={s.id} className="rounded-panel border border-ink-700 bg-ink-900/40 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-detail font-medium text-ink-100">{s.label}</p>
                          <span className="stat-mono text-micro text-ink-500">{s.id}</span>
                        </div>
                        <p className="mt-0.5 text-detail leading-relaxed text-ink-400">{s.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Telehealth + the clinical boundary ────────────────────── */}
              <div className="mt-4 space-y-2">
                <p className="flex gap-2 text-detail leading-relaxed text-ink-300">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
                  <span>{impact.telehealthNote}</span>
                </p>
                <p className="rounded-panel border border-ink-700 bg-ink-900/50 p-3 text-detail leading-relaxed text-ink-300">
                  {impact.clinicalBoundary}
                </p>
              </div>

              <p className="mt-3 text-micro text-ink-500">
                Everything goes back to normal on <span className="stat-mono">{formatDate(impact.resumesOn)}</span>. You
                can turn this off early any time.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {active ? (
                  <Button variant="outline" onClick={disable}>
                    <Undo2 className="h-4 w-4" /> Turn travel mode off
                  </Button>
                ) : (
                  <Button variant="primary" onClick={enable} disabled={!valid}>
                    <PlaneTakeoff className="h-4 w-4" /> Turn on for these dates
                  </Button>
                )}
              </div>
            </FadeIn>
          )}

          {!valid && (
            <p className="mt-4 text-detail text-watch">
              Check the dates and use a two-letter state — we need both to work out what to pause.
            </p>
          )}
        </CardContent>
      </Card>
    </MotionConfig>
  );
}
