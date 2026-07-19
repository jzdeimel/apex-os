"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShieldCheck,
  FlaskConical,
  Scale,
  CalendarPlus,
  PenLine,
  AlertTriangle,
  PhoneCall,
  Activity,
  ChevronRight,
  Filter,
} from "lucide-react";
import type { Client } from "@/lib/types";
import type { Gap, GapKind, GapOwner, GapSeverity } from "@/lib/discover/gaps";
import {
  GAP_KINDS,
  GAP_KIND_LABEL,
  GAP_OWNERS,
  coverageForCoach,
  gapsForCoach,
  groupBySeverity,
} from "@/lib/discover/gaps";
import { clientMap } from "@/lib/mock/clients";
import { Badge, Button, Select, EmptyState } from "@/components/ui/primitives";
import { ClientRow } from "@/components/coach/ClientRow";
import { Stagger, StaggerItem } from "@/components/motion";
import { cn, formatDate } from "@/lib/utils";

/**
 * Care Gap Board.
 *
 * The counterpart to the member's "what's available": this answers "what should
 * this member have that they don't". Read the header of lib/discover/gaps.ts
 * before adding a row type — a gap is a gap in care, never an unsold product.
 *
 * Three design decisions worth defending:
 *   · Grouped by severity, not by member. A coach works the overdue column
 *     first regardless of whose name is on it; grouping by member hides the one
 *     urgent row inside a person who otherwise looks fine.
 *   · Every row is one click from the chart. A gap you cannot act on from
 *     where you found it is a gap you write on a sticky note and lose.
 *   · Coverage is % of MEMBERS with zero open gaps, not % of gaps closed —
 *     see coverageForCoach(). It is the only number here a coach can move by
 *     finishing someone rather than by nibbling at everyone.
 */

const KIND_ICON: Record<GapKind, React.ElementType> = {
  "labs-overdue": FlaskConical,
  "safety-monitoring": ShieldCheck,
  "no-baseline-scan": Scale,
  "no-rescan": Scale,
  "no-followup": CalendarPlus,
  "plan-unapproved": PenLine,
  "unaddressed-marker": AlertTriangle,
  "coach-silence": PhoneCall,
};

const SEVERITY_META: Record<
  GapSeverity,
  { label: string; blurb: string; tone: React.ComponentProps<typeof Badge>["tone"]; accent: string }
> = {
  overdue: {
    label: "Overdue",
    blurb: "Past the date the member's own plan set. Work these first.",
    tone: "high",
    accent: "border-high/30",
  },
  due: {
    label: "Due now",
    blurb: "At the checkpoint. Still on time if it happens this week.",
    tone: "watch",
    accent: "border-watch/30",
  },
  routine: {
    label: "Coming up",
    blurb: "Inside the next two weeks. Book it before it ages.",
    tone: "info",
    accent: "border-ink-700/70",
  },
};

const OWNER_TONE: Record<GapOwner, React.ComponentProps<typeof Badge>["tone"]> = {
  Provider: "gold",
  Coach: "info",
  Member: "neutral",
};

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

function Coverage({
  pct,
  clear,
  total,
  withOverdue,
}: {
  pct: number;
  clear: number;
  total: number;
  withOverdue: number;
}) {
  const tone = pct >= 80 ? "text-optimal" : pct >= 50 ? "text-watch" : "text-high";
  const bar = pct >= 80 ? "bg-optimal" : pct >= 50 ? "bg-watch" : "bg-high";

  return (
    <div className="card px-3 py-2.5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <p className="label-eyebrow">Coverage</p>
          <p className={cn("stat-mono text-2xl font-semibold leading-none", tone)}>{pct}%</p>
        </div>
        {/* The definition sits next to the number on purpose. A coverage figure
            a coach cannot audit is a figure they argue with instead of act on. */}
        <p className="text-[11px] leading-tight text-ink-500">
          <span className="stat-mono text-ink-200">{clear}</span> of{" "}
          <span className="stat-mono text-ink-200">{total}</span> members in your book have no open
          care gap.{" "}
          <span className="text-high">
            <span className="stat-mono">{withOverdue}</span> carry something overdue.
          </span>
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-700/70">
        <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One gap
// ---------------------------------------------------------------------------

function GapCard({ gap, client }: { gap: Gap; client: Client }) {
  const [open, setOpen] = React.useState(false);
  const Icon = KIND_ICON[gap.kind];
  const meta = SEVERITY_META[gap.severity];

  return (
    <div className={cn("card overflow-hidden", meta.accent)}>
      <div className="flex flex-col gap-2 px-3 py-2 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tone={meta.tone}>
              <Icon className="h-3 w-3" />
              {GAP_KIND_LABEL[gap.kind]}
            </Badge>
            <Badge tone={OWNER_TONE[gap.owner]}>{gap.owner}</Badge>
            {gap.dueOn && (
              <span className="stat-mono text-[10px] text-ink-600">
                {gap.daysOverdue > 0
                  ? `${gap.daysOverdue}d past ${formatDate(gap.dueOn)}`
                  : `due ${formatDate(gap.dueOn)}`}
              </span>
            )}
          </div>

          <ClientRow
            client={client}
            href={`/clients/${client.id}`}
            showScore={false}
            bare
            subtitle={<span className="font-medium text-ink-200">{gap.title}</span>}
            note={gap.why}
          />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide evidence" : "Evidence"}
          </Button>
          <Link href={`/clients/${client.id}`} className="focus-ring rounded-lg">
            <Button size="sm" variant="outline">
              Open chart
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Evidence is collapsed but never elsewhere. The claim and the records
          behind it live in the same card, so a clinician can disagree with the
          board without leaving it. */}
      {open && (
        <div className="border-t border-ink-700/60 bg-ink-900/40 px-3 py-2.5">
          <p className="label-eyebrow mb-1.5">Evidence</p>
          <ul className="space-y-1">
            {gap.evidence.filter(Boolean).map((e, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-snug text-ink-300">
                <Activity className="mt-px h-3 w-3 shrink-0 text-ink-600" />
                <span>{e}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-ink-400">
            <span className="text-ink-500">Suggested next step · </span>
            {gap.suggestedAction}
            <span className="text-ink-600"> ({gap.owner})</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export function CareGaps({ coachId }: { coachId: string }) {
  const [kind, setKind] = React.useState<GapKind | "all">("all");
  const [owner, setOwner] = React.useState<GapOwner | "all">("all");

  const all = React.useMemo(() => gapsForCoach(coachId), [coachId]);
  const coverage = React.useMemo(() => coverageForCoach(coachId), [coachId]);

  const filtered = React.useMemo(
    () =>
      all.filter((g) => (kind === "all" || g.kind === kind) && (owner === "all" || g.owner === owner)),
    [all, kind, owner],
  );

  const groups = React.useMemo(() => groupBySeverity(filtered), [filtered]);

  // Only offer filter values that exist in this book — a dropdown full of
  // options that return nothing teaches the coach the board is broken.
  const kindsPresent = React.useMemo(
    () => GAP_KINDS.filter((k) => all.some((g) => g.kind === k)),
    [all],
  );

  return (
    <div className="space-y-3">
      <Coverage
        pct={coverage.pct}
        clear={coverage.clear}
        total={coverage.total}
        withOverdue={coverage.withOverdue}
      />

      {/* Filters. Base grid-cols-1 so the controls stack on a phone rather than
          sizing to content and pushing the board sideways. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_1fr] sm:items-center">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
          <Filter className="h-3.5 w-3.5" />
          <span>
            Showing <span className="stat-mono text-ink-200">{filtered.length}</span> of{" "}
            <span className="stat-mono text-ink-200">{all.length}</span>
          </span>
        </div>
        <Select
          aria-label="Filter by gap type"
          value={kind}
          onChange={(e) => setKind(e.target.value as GapKind | "all")}
        >
          <option value="all">All gap types</option>
          {kindsPresent.map((k) => (
            <option key={k} value={k}>
              {GAP_KIND_LABEL[k]} ({all.filter((g) => g.kind === k).length})
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by owner"
          value={owner}
          onChange={(e) => setOwner(e.target.value as GapOwner | "all")}
        >
          <option value="all">Anyone&apos;s to close</option>
          {GAP_OWNERS.map((o) => (
            <option key={o} value={o}>
              {o} ({all.filter((g) => g.owner === o).length})
            </option>
          ))}
        </Select>
      </div>

      {groups.length === 0 ? (
        all.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title="Every member in your book is fully covered"
            hint="No overdue rechecks, no missing scans, no unsigned plans, and nothing out of range that the plan doesn't already address. This is what finished looks like."
          />
        ) : (
          <EmptyState
            icon={<Filter className="h-6 w-6" />}
            title="No gaps match this filter"
            hint="Widen the gap type or owner to see the rest of the board."
          />
        )
      ) : (
        <Stagger className="space-y-4">
          {groups.map((group) => {
            const m = SEVERITY_META[group.severity];
            return (
              <StaggerItem key={group.severity}>
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h3 className="font-display text-sm font-semibold text-ink-50">{m.label}</h3>
                    <span className="stat-mono text-xs text-ink-500">{group.gaps.length}</span>
                    <p className="text-[11px] text-ink-600">{m.blurb}</p>
                  </div>
                  <div className="space-y-1.5">
                    {group.gaps.map((gap) => {
                      const client = clientMap[gap.clientId];
                      if (!client) return null;
                      // Keyed on the gap id (which embeds the client id) so a
                      // filter change can never reuse one member's expanded
                      // evidence panel for another member's row.
                      return <GapCard key={gap.id} gap={gap} client={client} />;
                    })}
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}

      <p className="text-[11px] leading-snug text-ink-600">
        A care gap is a gap in care, not an unsold product. Every row here comes from the member&apos;s
        own plan of care, panel, protocol or calendar — nothing is surfaced because it would sell.
      </p>
    </div>
  );
}

/** Named export used by the page header for a one-line summary. */
export function gapHeadline(coachId: string): string {
  const c = coverageForCoach(coachId);
  const open = gapsForCoach(coachId).length;
  if (open === 0) return `All ${c.total} members covered`;
  return `${open} open gap${open === 1 ? "" : "s"} across ${c.total - c.clear} member${
    c.total - c.clear === 1 ? "" : "s"
  }`;
}
