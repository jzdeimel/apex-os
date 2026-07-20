"use client";

import { Building2, Video, Layers } from "lucide-react";
import { locationMap } from "@/lib/mock/locations";
import { useDeskScope, useDayCounts, DESK_LOCATIONS } from "@/lib/frontdesk/useDesk";
import type { DeskScope } from "@/lib/frontdesk/day";
import { cn } from "@/lib/utils";

/**
 * Which building am I standing in.
 *
 * The switcher scopes the ENTIRE desk persona — the day board, the room board
 * and the phone-booking surface all read the same module-level scope, so a
 * caller booked from Southern Pines lands on Southern Pines' board without the
 * user setting the site twice.
 *
 * Each chip carries its own count, and a site with nothing on the books today
 * says "no visits" rather than showing a bare zero. That distinction matters
 * for the boutique in particular: it genuinely has no appointments in the seed,
 * and a silent zero next to four populated sites reads as a bug.
 *
 * Tap targets are deliberately oversized. This control gets hit with a thumb on
 * a tablet at the counter, often by someone who is also talking to a person.
 */
export function LocationSwitcher() {
  const [scope, setScope] = useDeskScope();
  const counts = useDayCounts();

  const options: { id: DeskScope; label: string; sub: string; icon: typeof Building2 }[] = [
    ...DESK_LOCATIONS.map((id) => {
      const loc = locationMap[id];
      return {
        id: id as DeskScope,
        label: loc.short,
        sub: loc.type === "virtual" ? "Video" : `${loc.city}, ${loc.state}`,
        icon: loc.type === "virtual" ? Video : Building2,
      };
    }),
    { id: "all", label: "All sites", sub: "Multi-site ops", icon: Layers },
  ];

  const totalAll = Object.values(counts).reduce((s, c) => s + c.total, 0);
  const hereAll = Object.values(counts).reduce((s, c) => s + c.here, 0);

  return (
    <div
      role="group"
      aria-label="Clinic"
      /* Horizontal scroll rather than a wrapping grid: six chips that reflow to
         three rows on a 390px phone push the first appointment off the screen,
         and the board is the point of the page. */
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((o) => {
        const active = o.id === scope;
        const c = o.id === "all" ? { total: totalAll, here: hereAll } : counts[o.id];
        const total = c?.total ?? 0;
        const here = c?.here ?? 0;
        const Icon = o.icon;

        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setScope(o.id)}
            aria-pressed={active}
            className={cn(
              "min-w-[9.5rem] shrink-0 rounded-panel border px-3 py-2.5 text-left transition-colors focus-ring",
              active
                ? "border-low/50 bg-low/10"
                : "border-ink-700 bg-ink-850/60 hover:border-ink-600",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-low" : "text-ink-500")} />
              <span
                className={cn(
                  "min-w-0 truncate text-detail font-medium",
                  active ? "text-ink-50" : "text-ink-200",
                )}
              >
                {o.label}
              </span>
            </span>
            <span className="mt-1 block truncate text-micro text-ink-600">{o.sub}</span>
            <span className="mt-1.5 flex items-baseline gap-1.5">
              {total === 0 ? (
                // Not a zero. A zero next to five populated chips reads as a
                // loading failure; "no visits" reads as a quiet Thursday.
                <span className="text-micro text-ink-600">No visits today</span>
              ) : (
                <>
                  <span className="stat-mono text-detail font-semibold text-ink-50">{total}</span>
                  <span className="text-micro text-ink-500">booked</span>
                  {here > 0 && (
                    <span className="ml-auto inline-flex items-center gap-1 text-micro font-medium text-optimal">
                      <span className="h-1.5 w-1.5 rounded-full bg-optimal" />
                      {here} in
                    </span>
                  )}
                </>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
