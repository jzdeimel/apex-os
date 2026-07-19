"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Users, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { Client } from "@/lib/types";
import { clients, clientName } from "@/lib/mock/clients";
import { staffName } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { alphaScore } from "@/lib/alphaScore";
import { nextBestAction, triageScore, churnRisk } from "@/lib/aiInsights";
import { Input, Select, Button, Badge, EmptyState } from "@/components/ui/primitives";
import { FadeIn } from "@/components/motion";
import { ClientRow, ClientStatusBadge } from "@/components/coach/ClientRow";
import { ME_COACH, clientsForCoach, daysSinceTouch } from "@/components/coach/TodayQueue";
import { AlphaScoreChip } from "@/components/AlphaScoreRing";
import { cn, relativeDays, currency } from "@/lib/utils";

/**
 * Coach · My Roster
 *
 * The coach's book, and only the coach's book by default. A table rather than a
 * feed, because the roster is where a coach answers comparative questions —
 * "who is quietest", "who is bleeding churn score", "who has no appointment" —
 * and you cannot compare what you cannot line up in a column.
 *
 * It scrolls sideways on a phone instead of reflowing. A table that rewraps
 * into stacked blocks below `sm` stops being a table exactly when the coach is
 * most likely to be standing in a hallway trying to scan one column.
 */

const STATUSES: (Client["status"] | "All")[] = [
  "All",
  "Lead",
  "Consult Booked",
  "Labs Ordered",
  "Results Ready",
  "Plan Review",
  "Active Protocol",
  "Follow-Up Due",
  "Inactive",
];

type RiskFilter = "all" | "attention" | "churn-high" | "churn-any";
type TouchFilter = "any" | "7" | "21" | "45";
type SortKey = "name" | "status" | "score" | "triage" | "churn" | "touch" | "next" | "ltv";
type SortDir = "asc" | "desc";

/**
 * Which direction a column means on first click. Nobody sorts churn risk
 * ascending to find their healthiest member — the useful end of each column is
 * the default, so one click is the whole interaction.
 */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  status: "asc",
  score: "desc",
  triage: "desc",
  churn: "desc",
  touch: "desc",
  next: "asc",
  ltv: "desc",
};

interface Row {
  client: Client;
  triage: ReturnType<typeof triageScore>;
  churn: ReturnType<typeof churnRisk>;
  nba: ReturnType<typeof nextBestAction>;
  score: ReturnType<typeof alphaScore>;
  touchDays: number;
}

const CHURN_TONE: Record<ReturnType<typeof churnRisk>["level"], "optimal" | "watch" | "high"> = {
  low: "optimal",
  medium: "watch",
  high: "high",
};

/** Triage rendered as a bar, not just a number — 40 rows of bare integers is a
 *  spreadsheet, and a coach scanning for "who is hot" reads length faster. */
function TriageCell({ score }: { score: number }) {
  const tone = score >= 45 ? "bg-high" : score >= 22 ? "bg-watch" : "bg-ink-600";
  return (
    <div className="flex items-center gap-2">
      <span className="stat-mono w-6 text-right text-xs text-ink-200">{score}</span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-900">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${score}%` }} />
      </span>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = active === sortKey;
  const Icon = !isActive ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
      <button
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 rounded transition-colors focus-ring",
          align === "right" && "flex-row-reverse",
          isActive ? "text-watch" : "text-ink-500 hover:text-ink-200",
        )}
      >
        {label}
        <Icon className={cn("h-3 w-3", !isActive && "opacity-50")} />
      </button>
    </th>
  );
}

export default function CoachRosterPage() {
  // Default is the coach's own book. The toggle widens to the whole practice
  // for the "who covers my members while I'm out" conversation — but it is a
  // deliberate act, never the state you land in.
  const [wide, setWide] = React.useState(false);
  const scope = React.useMemo(
    () => (wide ? clients : clientsForCoach(ME_COACH)),
    [wide],
  );

  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<(typeof STATUSES)[number]>("All");
  const [risk, setRisk] = React.useState<RiskFilter>("all");
  const [touch, setTouch] = React.useState<TouchFilter>("any");
  const [sort, setSort] = React.useState<SortKey>("triage");
  const [dir, setDir] = React.useState<SortDir>("desc");

  // Scores are computed once per client and reused by the filters, the sort and
  // the row, rather than recomputed inside the comparator on every comparison.
  const scored = React.useMemo<Row[]>(
    () =>
      scope.map((client) => ({
        client,
        triage: triageScore(client),
        churn: churnRisk(client),
        nba: nextBestAction(client),
        score: alphaScore(client),
        touchDays: daysSinceTouch(client),
      })),
    [scope],
  );

  const onSort = React.useCallback(
    (k: SortKey) => {
      // Re-clicking the active column flips it; a new column starts at its own
      // useful end rather than inheriting the previous column's direction.
      if (k === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSort(k);
        setDir(DEFAULT_DIR[k]);
      }
    },
    [sort],
  );

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const minTouch = touch === "any" ? -1 : Number(touch);

    const filtered = scored.filter((r) => {
      if (status !== "All" && r.client.status !== status) return false;
      if (risk === "attention" && r.triage.score < 45) return false;
      if (risk === "churn-high" && r.churn.level !== "high") return false;
      if (risk === "churn-any" && r.churn.level === "low") return false;
      if (r.touchDays < minTouch) return false;
      if (!needle) return true;
      return (
        clientName(r.client).toLowerCase().includes(needle) ||
        r.client.mrn.toLowerCase().includes(needle) ||
        r.client.email.toLowerCase().includes(needle)
      );
    });

    // Every comparator is written ascending; direction is applied once at the
    // end so a column can never disagree with the arrow drawn on its header.
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      name: (a, b) => clientName(a.client).localeCompare(clientName(b.client)),
      status: (a, b) => a.client.status.localeCompare(b.client.status),
      score: (a, b) => a.score.score - b.score.score,
      triage: (a, b) => a.triage.score - b.triage.score,
      churn: (a, b) => a.churn.score - b.churn.score,
      touch: (a, b) => a.touchDays - b.touchDays,
      // No appointment sorts to the far end rather than the top — an empty cell
      // is not "soonest", it is the thing you were looking for last.
      next: (a, b) =>
        (a.client.nextAppointment ?? "9999").localeCompare(b.client.nextAppointment ?? "9999"),
      ltv: (a, b) => a.client.lifetimeValue - b.client.lifetimeValue,
    };

    const sign = dir === "asc" ? 1 : -1;
    // Tiebreak on id so the list never shuffles between renders.
    return [...filtered].sort(
      (a, b) => sign * cmp[sort](a, b) || a.client.id.localeCompare(b.client.id),
    );
  }, [scored, q, status, risk, touch, sort, dir]);

  const summary = React.useMemo(() => {
    const active = scope.filter((c) => c.status === "Active Protocol").length;
    const atRisk = scored.filter((s) => s.churn.level === "high").length;
    const stalest = scored.reduce((m, s) => Math.max(m, s.touchDays), 0);
    return { active, atRisk, stalest };
  }, [scope, scored]);

  const filtersOn = q !== "" || status !== "All" || risk !== "all" || touch !== "any";

  return (
    <div className="space-y-3">
      <FadeIn>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="label-eyebrow">COACH CONSOLE</p>
            <h1 className="mt-0.5 font-display text-xl font-semibold tracking-tight text-ink-50">
              {wide ? "All Clients" : "My Roster"}
            </h1>
          </div>
          <p className="text-[11px] text-ink-500">
            {wide
              ? "Every client in the practice — read-only context, not your queue."
              : `Assigned to ${staffName(ME_COACH)} · same next-best-action the provider sees`}
          </p>
        </div>
      </FadeIn>

      {/* Summary strip + scope toggle share a line: both answer "what am I
          looking at", and splitting them cost a full row of table. */}
      <FadeIn delay={0.04}>
        <div className="card flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {[
              { label: "Clients", value: String(scope.length) },
              { label: "On protocol", value: String(summary.active) },
              { label: "High churn", value: String(summary.atRisk) },
              { label: "Longest silence", value: `${summary.stalest}d` },
            ].map((s) => (
              <div key={s.label} className="flex items-baseline gap-1.5">
                <span className="stat-mono text-base font-semibold text-ink-50">{s.value}</span>
                <span className="text-[11px] text-ink-500">{s.label}</span>
              </div>
            ))}
          </div>
          <Button size="sm" variant={wide ? "primary" : "outline"} onClick={() => setWide((w) => !w)}>
            <Users className="h-3.5 w-3.5" />
            {wide ? "My book only" : "Widen to practice"}
          </Button>
        </div>
      </FadeIn>

      <FadeIn delay={0.06}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, MRN or email…"
              className="pl-9"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "All statuses" : s}
              </option>
            ))}
          </Select>
          <Select value={risk} onChange={(e) => setRisk(e.target.value as RiskFilter)}>
            <option value="all">Any risk</option>
            <option value="attention">Needs attention (triage 45+)</option>
            <option value="churn-high">High churn risk</option>
            <option value="churn-any">Churn risk: medium or high</option>
          </Select>
          <Select value={touch} onChange={(e) => setTouch(e.target.value as TouchFilter)}>
            <option value="any">Any last touch</option>
            <option value="7">Quiet 7+ days</option>
            <option value="21">Quiet 21+ days (stale)</option>
            <option value="45">Quiet 45+ days</option>
          </Select>
        </div>
      </FadeIn>

      <FadeIn delay={0.08}>
        <p className="text-[11px] text-ink-600">
          Showing <span className="stat-mono text-ink-300">{rows.length}</span> of{" "}
          <span className="stat-mono text-ink-300">{scored.length}</span>
          {filtersOn && " · filtered"}
        </p>
      </FadeIn>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No clients match"
          hint="Clear the search or widen the status, risk and last-touch filters."
        />
      ) : (
        <FadeIn delay={0.1}>
          {/* The scroll container, not the page, owns the overflow — the body
              must never scroll sideways at 390px. */}
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead className="border-b border-ink-700/70 text-[11px] uppercase tracking-wide">
                <tr>
                  <SortHeader label="Member" sortKey="name" active={sort} dir={dir} onSort={onSort} />
                  <SortHeader label="Status" sortKey="status" active={sort} dir={dir} onSort={onSort} />
                  <SortHeader label="Score" sortKey="score" active={sort} dir={dir} onSort={onSort} />
                  <SortHeader label="Triage" sortKey="triage" active={sort} dir={dir} onSort={onSort} />
                  <SortHeader label="Churn" sortKey="churn" active={sort} dir={dir} onSort={onSort} />
                  <SortHeader label="Quiet" sortKey="touch" active={sort} dir={dir} onSort={onSort} />
                  <SortHeader label="Next appt" sortKey="next" active={sort} dir={dir} onSort={onSort} />
                  <SortHeader label="LTV" sortKey="ltv" active={sort} dir={dir} onSort={onSort} />
                  <th scope="col" className="px-3 py-2 text-right font-medium text-ink-500">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800/70">
                {rows.map((r) => (
                  <tr key={r.client.id} className="transition-colors hover:bg-ink-800/40">
                    {/* Same ClientRow as the Today queue. One identity block,
                        one truncation rule, one link target — a roster that
                        renders names differently from the queue is how a coach
                        ends up unsure whether it is the same person. */}
                    <td className="px-3 py-1.5">
                      <ClientRow
                        client={r.client}
                        href={`/clients/${r.client.id}`}
                        showScore={false}
                        showStatus={false}
                        bare
                        subtitle={r.nba.action}
                        note={locationName(r.client.locationId)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <ClientStatusBadge status={r.client.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <AlphaScoreChip result={r.score} />
                    </td>
                    <td className="px-3 py-1.5">
                      <TriageCell score={r.triage.score} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <Badge tone={CHURN_TONE[r.churn.level]} title={r.churn.drivers.join(" · ")}>
                        <span className="stat-mono">{r.churn.score}</span>
                        {r.churn.level}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span
                        className={cn(
                          "stat-mono text-xs",
                          r.touchDays >= 21
                            ? "text-high"
                            : r.touchDays >= 10
                              ? "text-watch"
                              : "text-ink-400",
                        )}
                      >
                        {r.touchDays}d
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span
                        className={cn(
                          "stat-mono text-xs",
                          r.client.nextAppointment ? "text-ink-300" : "text-ink-600",
                        )}
                      >
                        {r.client.nextAppointment ? relativeDays(r.client.nextAppointment) : "none"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span className="stat-mono text-xs text-ink-400">
                        {currency(r.client.lifetimeValue, true)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right">
                      <Link href={`/clients/${r.client.id}`}>
                        <Button size="sm" variant="outline">
                          Open
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FadeIn>
      )}
    </div>
  );
}
