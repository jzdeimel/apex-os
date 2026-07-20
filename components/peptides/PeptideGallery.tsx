"use client";

/**
 * PeptideGallery — filter by family, or by the thing you are actually trying to
 * fix.
 *
 * Two filter rows because members and staff arrive with different questions.
 * Staff think in families ("show me the GH-axis compounds"); a member thinks
 * "I want to sleep better". The second row is the one that gets used, so it is
 * the one with the wider vocabulary.
 *
 * Filtering is pure derivation from two pieces of state — no memo, no effect,
 * no synced copy of the list that can drift. Thirteen entries; a `.filter()`
 * per keystroke is free.
 */

import { useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Badge, Input } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/motion";
import { MoleculeCard } from "@/components/peptides/MoleculeCard";
import { MechanismDiagram } from "@/components/peptides/MechanismDiagram";
import {
  peptideFamilies,
  peptideLibrary,
  peptideUses,
  type PeptideEntry,
  type PeptideFamily,
  type PeptideUse,
} from "@/lib/peptides/library";
import { cn } from "@/lib/utils";

export function PeptideGallery({
  entries = peptideLibrary,
  /**
   * key → chip label, e.g. `{ "semaglutide": "On your plan" }`. The label is the
   * caller's to choose because only the caller knows whether the compound is
   * signed off or merely proposed — this component must not upgrade "proposed"
   * to "prescribed" by picking its own wording.
   */
  planChips = {},
  /** Show the mechanism diagram inline under the grid for the focused entry. */
  showMechanism = true,
}: {
  entries?: PeptideEntry[];
  planChips?: Record<string, string | null>;
  showMechanism?: boolean;
}) {
  const [family, setFamily] = useState<PeptideFamily | null>(null);
  const [use, setUse] = useState<PeptideUse | null>(null);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const visible = entries.filter((e) => {
    if (family && e.family !== family) return false;
    if (use && !e.commonlyUsedFor.includes(use)) return false;
    if (!q) return true;
    return [e.name, ...e.aka, e.family, ...e.commonlyUsedFor]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const onPlan = visible.filter((e) => planChips[e.key]);
  const filtered = family !== null || use !== null || q.length > 0;

  return (
    <div className="space-y-5">
      {/* -------------------------------------------------------------- */}
      {/* Filters                                                         */}
      {/* -------------------------------------------------------------- */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or what it's used for"
            aria-label="Search the library"
            className="pl-9"
          />
        </div>

        <FilterRow label="What kind">
          <Chip active={family === null} onClick={() => setFamily(null)}>
            All
          </Chip>
          {peptideFamilies.map((f) => (
            <Chip key={f} active={family === f} onClick={() => setFamily(family === f ? null : f)}>
              {f}
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="What for">
          <Chip active={use === null} onClick={() => setUse(null)}>
            All
          </Chip>
          {peptideUses.map((u) => (
            <Chip key={u} active={use === u} onClick={() => setUse(use === u ? null : u)}>
              {u}
            </Chip>
          ))}
        </FilterRow>

        <div className="flex flex-wrap items-center gap-2 text-detail text-ink-500">
          <span className="stat-mono">
            {visible.length} of {entries.length}
          </span>
          {onPlan.length > 0 && (
            <Badge tone="gold">
              {onPlan.length} on your plan
            </Badge>
          )}
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setFamily(null);
                setUse(null);
                setQuery("");
              }}
              className="focus-ring inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-ink-400 transition-colors hover:text-ink-100"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Grid — explicit base grid-cols-1, or the implicit column sizes   */}
      {/* to content and blows out 390px.                                  */}
      {/* -------------------------------------------------------------- */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-700 px-6 py-12 text-center">
          <p className="text-body font-medium text-ink-300">Nothing matches that</p>
          <p className="mt-1 text-detail text-ink-500">
            Try a broader filter — or ask your care team directly, which is faster than guessing.
          </p>
        </div>
      ) : (
        <Stagger
          // Re-keying on the filter state replays the stagger, so a filter
          // change reads as a new set arriving rather than items vanishing.
          key={`${family ?? "all"}-${use ?? "all"}-${q}`}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {visible.map((e) => (
            <StaggerItem key={e.key} className="h-full">
              <MoleculeCard entry={e} planChip={planChips[e.key] ?? null} className="h-full" />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Mechanisms                                                       */}
      {/* -------------------------------------------------------------- */}
      {showMechanism && visible.length > 0 && (
        <div className="space-y-4 pt-2">
          <div>
            <h3 className="font-display text-body font-semibold text-ink-50">How they work</h3>
            <p className="mt-1 max-w-prose text-body text-ink-400">
              The same four questions for every compound: what it is, what it binds to, what that
              changes, and what the intended result is.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {visible.map((e) => (
              <div key={e.key} className="card p-5">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: e.accent }}
                    aria-hidden
                  />
                  <span className="font-display text-body font-semibold text-ink-50">{e.name}</span>
                  <span className="text-detail text-ink-500">{e.family}</span>
                </div>
                <MechanismDiagram entry={e} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="label-eyebrow shrink-0 sm:w-20">{label}</span>
      {/* Horizontal scroll rather than wrap: a phone shows the first four chips
          and a clear affordance to swipe, instead of four stacked rows. */}
      <div className="-mx-1 flex flex-nowrap gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {children}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-ring shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-detail transition-colors",
        active
          ? "border-gold-400/40 bg-gold-400/12 text-gold-300"
          : "border-ink-700 text-ink-300 hover:border-ink-600 hover:text-ink-100",
      )}
    >
      {children}
    </button>
  );
}
