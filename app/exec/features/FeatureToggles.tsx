"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * The interactive island of the features page.
 *
 * WHAT IT DOES NOT DO. It does not decide anything. The toggle posts to
 * /api/features, which re-checks authority server-side; this component's
 * optimistic state is a rendering convenience that the next load overwrites
 * with the truth. Treating a client toggle as the decision is the pattern this
 * codebase was audited for.
 *
 * TWO DIFFERENT "OFF"s, SHOWN DIFFERENTLY. A feature can be off because the
 * release preset ships it off, or because someone overrode it. Collapsing those
 * into one grey switch is how an owner turns something "on", ships a new
 * release, and finds it off again with no idea why. The row says which it is,
 * and "Reset" (clearing the override) is a distinct action from switching off.
 */

export interface ToggleRow {
  key: string;
  label: string;
  description: string;
  caution?: string;
  routes: string[];
  enabled: boolean;
  decidedBy: string;
  decidedByTarget: string | null;
  overrideCount: number;
  presetDefault: boolean;
}

export function FeatureToggles({ rows }: { rows: ToggleRow[] }) {
  return (
    <div className="divide-y divide-ink-800 rounded-lg border border-ink-700/60 bg-ink-900/30">
      {rows.map((row) => (
        <ToggleItem key={row.key} row={row} />
      ))}
    </div>
  );
}

function ToggleItem({ row }: { row: ToggleRow }) {
  const [enabled, setEnabled] = useState(row.enabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isOverridden = row.decidedBy !== "preset";

  function post(payload: Record<string, unknown>, optimistic: boolean) {
    setError(null);
    setSaved(false);
    const previous = enabled;
    setEnabled(optimistic);

    startTransition(async () => {
      try {
        const res = await fetch("/api/features", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: row.key, scope: "global", targetId: "*", ...payload }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          // Revert. A switch that stays where the user put it while the server
          // refused is the "toast claiming success with no write" failure the
          // audit named, in miniature.
          setEnabled(previous);
          setError(json.error ?? `Failed (${res.status}).`);
          return;
        }
        setSaved(true);
      } catch (err) {
        setEnabled(previous);
        setError(err instanceof Error ? err.message : "Network error.");
      }
    });
  }

  return (
    <div className="flex items-start gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink-100">{row.label}</span>
          {isOverridden ? (
            <Badge tone="gold">
              overridden · {row.decidedBy}
              {row.decidedByTarget && row.decidedByTarget !== "*"
                ? ` · ${row.decidedByTarget}`
                : ""}
            </Badge>
          ) : (
            <Badge tone="neutral">release default</Badge>
          )}
          <Badge tone="info">global · everyone</Badge>
          {row.overrideCount > 1 && (
            <Badge tone="info">{row.overrideCount} scoped rules</Badge>
          )}
        </div>

        <p className="mt-1 text-sm leading-relaxed text-ink-400">{row.description}</p>

        {row.caution && (
          <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-watch">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{row.caution}</span>
          </p>
        )}

        {row.routes.length > 0 && (
          <p className="mt-2 font-mono text-[11px] text-ink-500">
            {row.routes.join(" · ")}
          </p>
        )}

        {error && <p className="mt-2 text-xs text-high">{error}</p>}
        {saved && !error && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-optimal">
            <Check className="h-3.5 w-3.5" /> Saved and written to the audit trail.
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isOverridden && (
          <button
            type="button"
            title="Clear the override and follow the release preset again"
            onClick={() => post({ clear: true }, row.presetDefault)}
            disabled={pending}
            className="rounded-md border border-ink-700 p-1.5 text-ink-400 transition hover:text-ink-200 disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${row.label}: ${enabled ? "on" : "off"}`}
          disabled={pending}
          onClick={() => post({ enabled: !enabled }, !enabled)}
          className={cn(
            "relative h-6 w-11 rounded-full border transition disabled:opacity-50",
            enabled
              ? "border-optimal/40 bg-optimal/25"
              : "border-ink-600 bg-ink-700/60",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all",
              enabled ? "left-[1.4rem] bg-optimal" : "left-0.5 bg-ink-400",
            )}
            style={{ height: "1.125rem", width: "1.125rem" }}
          />
          {pending && (
            <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-ink-200" />
          )}
        </button>
      </div>
    </div>
  );
}
