"use client";

import * as React from "react";
import { Bookmark, BookmarkPlus, Check, X } from "lucide-react";
import { Button, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { clients as allClients } from "@/lib/mock/clients";
import {
  BUILT_IN_VIEWS,
  createView,
  describeFilters,
  upsertView,
  viewCount,
  type SavedView,
  type ViewFilters,
  type ViewSort,
} from "@/lib/staff/views";
import { cn } from "@/lib/utils";
import type { Client } from "@/lib/types";

/**
 * SAVED VIEWS — the switcher.
 *
 * ── Why the counts are real ───────────────────────────────────────────────
 * Every pill carries the count it will actually produce, computed with the
 * same predicate the list uses (`viewCount` → `matchesFilters`). A switcher
 * whose numbers are approximate, cached, or omitted is one a coach checks by
 * clicking — which is exactly the navigation the saved view was supposed to
 * remove. Seeing "Needs a touch 23" and "New labs 4" is the decision; clicking
 * is just carrying it out.
 *
 * ── Why saving is one field ───────────────────────────────────────────────
 * Name it, save it. No folders, no sharing dialog, no icon picker. The reason
 * saved-search features die is that saving costs more than re-filtering, and
 * every extra field is a reason to not bother.
 *
 * ── Why built-ins cannot be edited away ───────────────────────────────────
 * The five built-ins are the clinic's shared definition of its own worklists.
 * A coach may add to them; nobody may quietly redefine "At risk" for everyone
 * else. Custom views sit in their own row, visibly the coach's own.
 */

export interface SavedViewsProps {
  /** Staff id of the coach whose views these are. */
  ownerId: string;
  activeViewId: string;
  onChange: (view: SavedView) => void;
  /** The coach's own saved views. Owned by the caller so it can be persisted. */
  customViews?: SavedView[];
  onSaveView?: (views: SavedView[], saved: SavedView) => void;
  /**
   * Filters currently on screen — what "Save current view" captures.
   * Absent means the save affordance is hidden rather than saving nothing.
   */
  currentFilters?: ViewFilters;
  currentSort?: ViewSort;
  /** Population the counts are computed against. Defaults to the whole book. */
  clients?: Client[];
  className?: string;
}

export function SavedViews({
  ownerId,
  activeViewId,
  onChange,
  customViews = [],
  onSaveView,
  currentFilters,
  currentSort,
  clients = allClients,
  className,
}: SavedViewsProps) {
  const { toast } = useToast();
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const nameRef = React.useRef<HTMLInputElement>(null);

  // Counts are the expensive part — one full-book scan per view. Memoised on
  // the population and the view set so switching views does not rescan.
  const counts = React.useMemo(() => {
    const out = new Map<string, number>();
    for (const v of [...BUILT_IN_VIEWS, ...customViews]) {
      out.set(v.id, viewCount(v, clients));
    }
    return out;
  }, [clients, customViews]);

  React.useEffect(() => {
    if (naming) nameRef.current?.focus();
  }, [naming]);

  function commitSave() {
    if (!currentFilters || !onSaveView) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const view = createView({
      name: trimmed,
      ownerId,
      description: describeFilters(currentFilters),
      filters: currentFilters,
      sort: currentSort ?? "last-touch",
    });
    onSaveView(upsertView(customViews, view), view);
    setNaming(false);
    setName("");
    toast(`Saved “${view.name}”`, { desc: describeFilters(currentFilters) });
    onChange(view);
  }

  const canSave = Boolean(currentFilters && onSaveView);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label-eyebrow mr-1 flex items-center gap-1 text-ink-500">
          <Bookmark className="h-3 w-3" />
          Views
        </span>

        {BUILT_IN_VIEWS.map((v) => (
          <ViewPill
            key={v.id}
            view={v}
            count={counts.get(v.id) ?? 0}
            active={v.id === activeViewId}
            onSelect={() => onChange(v)}
          />
        ))}
      </div>

      {(customViews.length > 0 || canSave) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label-eyebrow mr-1 text-ink-500">Mine</span>

          {customViews.map((v) => (
            <ViewPill
              key={v.id}
              view={v}
              count={counts.get(v.id) ?? 0}
              active={v.id === activeViewId}
              onSelect={() => onChange(v)}
            />
          ))}

          {canSave && !naming && (
            <Button size="sm" variant="outline" onClick={() => setNaming(true)}>
              <BookmarkPlus className="h-3.5 w-3.5" />
              Save current view
            </Button>
          )}

          {canSave && naming && (
            <span className="flex items-center gap-1.5">
              <Input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitSave();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setNaming(false);
                    setName("");
                  }
                }}
                placeholder="Name this view…"
                aria-label="Name this view"
                className="h-8 w-48 text-xs"
              />
              <Button size="sm" variant="primary" onClick={commitSave} disabled={!name.trim()}>
                <Check className="h-3.5 w-3.5" />
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setNaming(false);
                  setName("");
                }}
                aria-label="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </span>
          )}
        </div>
      )}

      {/* The active view states its own purpose. A queue whose definition is
          invisible drifts in meaning between the two coaches sharing it. */}
      <ActiveViewNote
        view={[...BUILT_IN_VIEWS, ...customViews].find((v) => v.id === activeViewId)}
      />
    </div>
  );
}

function ViewPill({
  view,
  count,
  active,
  onSelect,
}: {
  view: SavedView;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      title={view.description}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-ring",
        active
          ? "border-gold-400/40 bg-gold-400/15 text-gold-200"
          : "border-ink-700 text-ink-300 hover:border-ink-600 hover:text-ink-100",
      )}
    >
      {view.name}
      <span
        className={cn(
          "stat-mono rounded-full px-1.5 py-0.5 text-[10px]",
          active ? "bg-gold-400/20 text-gold-200" : "bg-ink-800 text-ink-400",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function ActiveViewNote({ view }: { view?: SavedView }) {
  if (!view) return null;
  return (
    <p className="text-xs leading-relaxed text-ink-500">
      <span className="text-ink-300">{view.name}</span> — {view.description}
    </p>
  );
}

export default SavedViews;
