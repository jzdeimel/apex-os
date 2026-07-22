"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Users, ChevronUp, ChevronDown, ChevronsUpDown, MessageSquare, Activity } from "lucide-react";
import type { Client } from "@/lib/types";
import { clients, clientName } from "@/lib/mock/clients";
import { visibleClientsFor } from "@/lib/access/clientScope";
import { staffMap } from "@/lib/mock/staff";
import { staffName } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { alphaScore } from "@/lib/alphaScore";
import { nextBestAction, triageScore, churnRisk } from "@/lib/aiInsights";
import { Input, Select, Button, Badge, EmptyState } from "@/components/ui/primitives";
import { ClientRow, ClientStatusBadge } from "@/components/coach/ClientRow";
import { ME_COACH, clientsForCoach, daysSinceTouch } from "@/components/coach/TodayQueue";
import { AlphaScoreChip } from "@/components/AlphaScoreRing";
import { SinceLastVisitInline } from "@/components/coach/SinceLastVisitCard";
import { ConsultPrepBrief } from "@/components/coach/ConsultPrepBrief";
import { OutcomePanel } from "@/components/coach/OutcomePanel";
import { QuickReply } from "@/components/coach/QuickReply";
import { BulkBar } from "@/components/coach/BulkBar";
import { MemberPulse } from "@/components/coach/MemberPulse";
import { SavedViews } from "@/components/coach/SavedViews";
import {
  BUILT_IN_VIEWS,
  matchesFilters,
  type SavedView,
  type ViewFilters,
  type ViewSort,
} from "@/lib/staff/views";
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

/**
 * The view the roster LANDS on.
 *
 * Not `DEFAULT_VIEW` ("Needs a touch"), even though that is the flag the
 * built-ins set. This page's contract, stated at the top of the file, is "the
 * coach's book, and only the coach's book by default" — a roster that opens
 * pre-filtered to fourteen silent members is a worklist wearing the roster's
 * title, and a coach who came here to look someone up would think the member
 * had been unassigned. "Everyone" applies no filters, so the landing render is
 * byte-identical to what this page did before saved views were mounted.
 */
const LANDING_VIEW: SavedView =
  BUILT_IN_VIEWS.find((v) => v.id === "view-everyone") ?? BUILT_IN_VIEWS[0];

/** Client-scoped so two coaches on one demo machine do not share worklists. */
const CUSTOM_VIEWS_KEY = `apex:coach-views:${ME_COACH}`;

/**
 * Roster sort column -> saved-view sort, where the two vocabularies overlap.
 *
 * Deliberately partial. Score, triage, churn and LTV are engine outputs with no
 * `ViewSort` equivalent, and mapping them onto "last-touch" so the field is
 * never empty would silently save a sort the coach did not choose. Unmapped
 * columns pass `undefined` and SavedViews falls back to its own default — which
 * costs nothing here, because the roster's column headers own the sort and this
 * page never reads `view.sort` back.
 */
const VIEW_SORT: Partial<Record<SortKey, ViewSort>> = {
  name: "name",
  status: "status",
  touch: "last-touch",
  next: "next-visit",
};

/** Triage rendered as a bar, not just a number — 40 rows of bare integers is a
 *  spreadsheet, and a coach scanning for "who is hot" reads length faster. */
function TriageCell({ score }: { score: number }) {
  const tone = score >= 45 ? "bg-high" : score >= 22 ? "bg-watch" : "bg-ink-600";
  return (
    <div className="flex items-center gap-2">
      <span className="stat-mono w-6 text-right text-detail text-ink-200">{score}</span>
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
  // AUDIT: "wide" was the ENTIRE clinic book — a coach covering for a colleague
  // could open every patient at every location. "Wide" now means "everyone at
  // my location(s)", which is the actual cover-for-a-colleague set; the default
  // stays this coach's own assigned members.
  const scope = React.useMemo(
    () => (wide ? visibleClientsFor(ME_COACH) : clientsForCoach(ME_COACH)),
    [wide],
  );

  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<(typeof STATUSES)[number]>("All");
  const [risk, setRisk] = React.useState<RiskFilter>("all");
  const [touch, setTouch] = React.useState<TouchFilter>("any");
  const [sort, setSort] = React.useState<SortKey>("triage");
  const [dir, setDir] = React.useState<SortDir>("desc");

  /**
   * The member whose prep brief is open, if any.
   *
   * Single-select rather than a set: a brief is what you read in the sixty
   * seconds before one call, and letting three of them stack turns the page
   * back into the chart-shaped wall the brief exists to replace.
   */
  const [prepFor, setPrepFor] = React.useState<string | null>(null);

  /**
   * The member the coach is composing a message to, if any.
   *
   * Audit finding: `components/coach/QuickReply.tsx` — 386 lines with consent
   * guards, idempotency and ⌘↵ — was imported by nothing, and "a coach cannot
   * message a client anywhere in this app". This is the mount. Same
   * single-select rule and same anchor position as the prep brief, and the two
   * are mutually exclusive: both are one member's context pinned above the
   * table, and stacking them pushes the table itself off screen.
   */
  const [msgFor, setMsgFor] = React.useState<string | null>(null);

  /**
   * The member whose logged pulse the coach is reading, if any.
   *
   * AUDIT FINDING (docs/audit/ENGAGEMENT.md #4 — "the cheapest large retention
   * win"): coach reactions on member logs did not exist because there was no
   * coach-side surface to read a member's day-to-day self-logs. This is the
   * mount for that surface. Same single-select rule as the prep brief and the
   * compose panel, and mutually exclusive with both — all three are one member's
   * context pinned above the table, and stacking them shoves the table itself
   * off screen.
   */
  const [pulseFor, setPulseFor] = React.useState<string | null>(null);

  /** The active saved view. See LANDING_VIEW for why it is not DEFAULT_VIEW. */
  const [view, setView] = React.useState<SavedView>(LANDING_VIEW);

  /**
   * The coach's own views.
   *
   * Read from localStorage in an effect, never during render — the server has
   * no localStorage, so reading it in the initial state would make the first
   * client render disagree with the server's and throw a hydration error. The
   * cost is one frame with only the built-ins showing, which is invisible.
   *
   * This is demo persistence, not real persistence: it is one browser profile
   * on one machine, so the "a coach off sick takes their queues with them"
   * problem the views module exists to solve is only half solved here. Fixing
   * it properly needs a backend this build does not have.
   */
  const [customViews, setCustomViews] = React.useState<SavedView[]>([]);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOM_VIEWS_KEY);
      if (raw) setCustomViews(JSON.parse(raw) as SavedView[]);
    } catch {
      // Corrupt or unavailable storage means no saved views, not a broken page.
    }
  }, []);

  /**
   * Row selection for the bulk bar. A Set, not an array: the checkbox handler
   * is O(1) and the render-time `has` is O(1) across forty rows.
   */
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  // Widening to the practice closes the brief. The panel is anchored to a
  // member who may no longer be in view, and a brief hanging above a table that
  // no longer contains its subject is disorienting rather than convenient.
  //
  // The compose panel and the selection go with it, and for a sharper reason
  // than tidiness: a selection carried across a scope change is a set of ids
  // the coach can no longer see, and the bulk bar would cheerfully offer to
  // reassign fourteen members that are not on screen.
  React.useEffect(() => {
    setPrepFor(null);
    setMsgFor(null);
    setPulseFor(null);
    setSelected(new Set<string>());
  }, [wide]);

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
      // The saved view runs FIRST and with the shared predicate from
      // lib/staff/views, so what lands on screen is exactly what the pill
      // counted. Selecting a view resets the four controls below (see
      // `chooseView`), which is what keeps "Needs a touch 23" and the row count
      // agreeing at the moment the coach reads them.
      if (!matchesFilters(r.client, view.filters)) return false;
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
  }, [scored, q, status, risk, touch, sort, dir, view]);

  /**
   * What the bulk bar acts on: selected AND currently visible.
   *
   * Intersecting with `rows` rather than handing over the raw Set is the honest
   * version. A coach who selects fourteen members and then types a search has
   * three on screen, and a bar that still says "14 selected" is offering to
   * change records the coach cannot see — the exact accident BulkBar's
   * count-before-you-run rule exists to prevent.
   *
   * Memoised because BulkBar invalidates its open confirm step whenever this
   * array's IDENTITY changes. A fresh array every render would reset the
   * confirm on every keystroke and the bar would be unusable.
   */
  const selectedIds = React.useMemo(
    () => rows.filter((r) => selected.has(r.client.id)).map((r) => r.client.id),
    [rows, selected],
  );

  const allVisibleSelected = rows.length > 0 && selectedIds.length === rows.length;

  const toggleOne = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Select-all is scoped to the visible rows, never to the whole book. "Select
  // all" meaning "all 312 clients in the practice" when nine are on screen is
  // how a bulk action becomes a support ticket.
  const toggleAllVisible = React.useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (rows.every((r) => next.has(r.client.id))) {
        for (const r of rows) next.delete(r.client.id);
      } else {
        for (const r of rows) next.add(r.client.id);
      }
      return next;
    });
  }, [rows]);

  /**
   * Switching views resets the four on-screen controls.
   *
   * Composing them instead would leave a coach looking at "New labs 4" over one
   * row because yesterday's status filter was still set, and the pill's count
   * would be a number that describes nothing on screen. SavedViews promises its
   * counts are real; this is the call site holding up its end.
   */
  const chooseView = React.useCallback((next: SavedView) => {
    setView(next);
    setQ("");
    setStatus("All");
    setRisk("all");
    setTouch("any");
    setPrepFor(null);
    setMsgFor(null);
    setPulseFor(null);
    setSelected(new Set<string>());
  }, []);

  const saveViews = React.useCallback((next: SavedView[], saved: SavedView) => {
    setCustomViews(next);
    setView(saved);
    try {
      window.localStorage.setItem(CUSTOM_VIEWS_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked. The view still works for this session; losing
      // it on reload is better than losing the click.
    }
  }, []);

  /**
   * What "Save current view" would capture — or `undefined` to hide the offer.
   *
   * `ViewFilters` cannot express a free-text search, and the roster's risk
   * control is a triage/churn cut while `ViewFilters.risk` is the record's
   * clinical risk FLAGS. They are different questions with the same word on
   * them. Saving under either would produce a view that reopens showing a
   * different set than the coach was looking at when they named it, so the
   * affordance is withheld instead — which is the documented contract of the
   * prop ("absent means the save affordance is hidden rather than saving
   * nothing").
   */
  const currentFilters: ViewFilters | undefined =
    q.trim() === "" && risk === "all"
      ? {
          ...view.filters,
          status: status === "All" ? view.filters.status : [status],
          lastTouchDays: touch === "any" ? view.filters.lastTouchDays : Number(touch),
        }
      : undefined;

  const summary = React.useMemo(() => {
    const active = scope.filter((c) => c.status === "Active Protocol").length;
    const atRisk = scored.filter((s) => s.churn.level === "high").length;
    const stalest = scored.reduce((m, s) => Math.max(m, s.touchDays), 0);
    return { active, atRisk, stalest };
  }, [scope, scored]);

  const filtersOn =
    q !== "" ||
    status !== "All" ||
    risk !== "all" ||
    touch !== "any" ||
    view.id !== LANDING_VIEW.id;

  return (
    <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="label-eyebrow">COACH CONSOLE</p>
            <h1 className="mt-0.5 font-display text-title font-semibold tracking-tight text-ink-50">
              {wide ? "All Clients" : "My Roster"}
            </h1>
          </div>
          <p className="text-micro text-ink-500">
            {wide
              ? "Every client in the practice — read-only context, not your queue."
              : `Assigned to ${staffName(ME_COACH)} · same next-best-action the provider sees`}
          </p>
        </div>

      {/* Summary strip + scope toggle share a line: both answer "what am I
          looking at", and splitting them cost a full row of table. */}
        <div className="card flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {[
              { label: "Clients", value: String(scope.length) },
              { label: "On protocol", value: String(summary.active) },
              { label: "High churn", value: String(summary.atRisk) },
              { label: "Longest silence", value: `${summary.stalest}d` },
            ].map((s) => (
              <div key={s.label} className="flex items-baseline gap-1.5">
                <span className="stat-mono text-heading font-semibold text-ink-50">{s.value}</span>
                <span className="text-micro text-ink-500">{s.label}</span>
              </div>
            ))}
          </div>
          <Button size="sm" variant={wide ? "primary" : "outline"} onClick={() => setWide((w) => !w)}>
            <Users className="h-3.5 w-3.5" />
            {wide ? "My book only" : "Widen to practice"}
          </Button>
        </div>

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

      {/* The saved-view switcher sits BELOW the ad-hoc controls, not above.
          The controls are what a coach reaches for to answer a one-off
          question; the views are the queues they come back to every morning,
          and selecting one clears the controls above it — so it reads in the
          order it behaves. */}
        <SavedViews
          ownerId={ME_COACH}
          activeViewId={view.id}
          onChange={chooseView}
          customViews={customViews}
          onSaveView={saveViews}
          currentFilters={currentFilters}
          currentSort={VIEW_SORT[sort]}
          /* Counts are computed against the same population the table draws
             from, so widening to the practice moves the pills too. Passing the
             whole book here while the table showed one coach's would put a
             number on every pill that the list could never produce. */
          clients={scope}
        />

      {/* Outcomes. Collapsed by default and above the table on purpose: it is a
          reflective view, not a work queue, and expanding it should be a
          deliberate act that does not cost the coach their table position. */}
        <OutcomePanel coachId={ME_COACH} />

      {/* The open prep brief, anchored above the table rather than inline in a
          row. A brief expanded inside a <tr> either forces a colSpan block that
          shoves every other row off-screen, or scrolls sideways with the table —
          and this one is read while a call is connecting. */}
      {prepFor && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setPrepFor(null)}
              className="focus-ring absolute right-2 top-2 z-10 rounded-lg border border-ink-700 bg-ink-900/90 px-2 py-1 text-micro font-medium text-ink-400 transition-colors hover:text-ink-100"
            >
              Close
            </button>
            <ConsultPrepBrief clientId={prepFor} coachId={ME_COACH} />
          </div>
      )}

      {/* The compose panel, anchored in the same slot as the brief and for the
          same reasons. Keyed on the member so switching from one row's Message
          button to another's resets the draft — carrying a half-typed message
          about Marcus into Priya's thread is the one mistake this surface must
          not make possible. */}
      {msgFor && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMsgFor(null)}
              className="focus-ring absolute right-2 top-2 z-10 rounded-lg border border-ink-700 bg-ink-900/90 px-2 py-1 text-micro font-medium text-ink-400 transition-colors hover:text-ink-100"
            >
              Close
            </button>
            <QuickReply
              key={msgFor}
              clientId={msgFor}
              staffId={ME_COACH}
              /* Closing on send is the right default: the queue-shaped job is
                 "reply and move on". The ledger row and the toast are the
                 receipt, so nothing is lost by the panel going away. */
              onSent={() => setMsgFor(null)}
            />
          </div>
      )}

      {/* The member-pulse panel: read what this member logged and react to it.
          Anchored in the same slot as the brief and compose panel, keyed on the
          member so switching rows resets the note draft inside it. This closes
          the loop the audit rated the cheapest large retention win — a coach
          seeing a member's Tuesday check-in and leaving a named human reply. */}
      {pulseFor && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setPulseFor(null)}
              className="focus-ring absolute right-2 top-2 z-10 rounded-lg border border-ink-700 bg-ink-900/90 px-2 py-1 text-micro font-medium text-ink-400 transition-colors hover:text-ink-100"
            >
              Close
            </button>
            <MemberPulse key={pulseFor} clientId={pulseFor} staffId={ME_COACH} />
          </div>
      )}

        <p className="text-micro text-ink-600">
          Showing <span className="stat-mono text-ink-300">{rows.length}</span> of{" "}
          <span className="stat-mono text-ink-300">{scored.length}</span>
          {filtersOn && " · filtered"}
        </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No clients match"
          hint="Clear the search or widen the status, risk and last-touch filters."
        />
      ) : (
        /* The scroll container, not the page, owns the overflow — the body
           must never scroll sideways at 390px. */
        <div className="card overflow-x-auto">
            {/* Widened with the "Since seen" column. The min-width has to grow
                with the column count or the table starts compressing cells
                instead of scrolling, which is what the overflow container above
                exists to prevent. */}
            <table className="w-full min-w-[1120px] border-collapse text-left">
              <thead className="border-b border-ink-700/70 text-micro uppercase tracking-wide">
                <tr>
                  <th scope="col" className="w-9 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      /* Indeterminate is set through the DOM because React has
                         no attribute for it — a partially-selected box that
                         renders as unchecked invites a second click that
                         silently selects everything. */
                      ref={(el) => {
                        if (el) el.indeterminate = selectedIds.length > 0 && !allVisibleSelected;
                      }}
                      aria-label={`Select all ${rows.length} shown`}
                      className="h-3.5 w-3.5 cursor-pointer accent-gold-400 focus-ring"
                    />
                  </th>
                  <SortHeader label="Member" sortKey="name" active={sort} dir={dir} onSort={onSort} />
                  <SortHeader label="Status" sortKey="status" active={sort} dir={dir} onSort={onSort} />
                  <SortHeader label="Score" sortKey="score" active={sort} dir={dir} onSort={onSort} />
                  <SortHeader label="Triage" sortKey="triage" active={sort} dir={dir} onSort={onSort} />
                  <SortHeader label="Churn" sortKey="churn" active={sort} dir={dir} onSort={onSort} />
                  <SortHeader label="Quiet" sortKey="touch" active={sort} dir={dir} onSort={onSort} />
                  {/* Deliberately not sortable. Sorting this column means
                      building the full diff for every row before the first
                      paint; the cell itself is cheap enough per-row but the
                      comparator would make it a whole-table cost on every
                      click. The filters above already narrow the list. */}
                  <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium text-ink-500">
                    Since seen
                  </th>
                  <SortHeader label="Next appt" sortKey="next" active={sort} dir={dir} onSort={onSort} />
                  <SortHeader label="LTV" sortKey="ltv" active={sort} dir={dir} onSort={onSort} />
                  <th scope="col" className="px-3 py-2 text-right font-medium text-ink-500">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800/70">
                {rows.map((r) => (
                  <tr
                    key={r.client.id}
                    className={cn(
                      "transition-colors hover:bg-ink-800/40",
                      // A selected row is tinted, not just ticked. The bar at
                      // the bottom states a count; the tint is what lets a
                      // coach verify that count is the right fourteen people
                      // before they confirm.
                      selected.has(r.client.id) && "bg-gold-400/[0.07]",
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={selected.has(r.client.id)}
                        onChange={() => toggleOne(r.client.id)}
                        aria-label={`Select ${clientName(r.client)}`}
                        className="h-3.5 w-3.5 cursor-pointer accent-gold-400 focus-ring"
                      />
                    </td>
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
                          "stat-mono text-detail",
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
                    {/*
                      Only for the coach's OWN members. "Since I last saw them"
                      is anchored on this coach's last consult, and for someone
                      else's member that anchor does not exist — the engine
                      would fall back to a colleague's consult and quietly
                      answer a different question than the column header asks.
                      It is also what keeps the practice-wide view from building
                      500 diffs on a single render.
                    */}
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {r.client.coachId === ME_COACH ? (
                        <SinceLastVisitInline clientId={r.client.id} coachId={ME_COACH} />
                      ) : (
                        <span
                          className="stat-mono text-detail text-ink-500"
                          title="Not your member — there is no last visit of yours to measure from."
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span
                        className={cn(
                          "stat-mono text-detail",
                          r.client.nextAppointment ? "text-ink-300" : "text-ink-600",
                        )}
                      >
                        {r.client.nextAppointment ? relativeDays(r.client.nextAppointment) : "none"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span className="stat-mono text-detail text-ink-400">
                        {currency(r.client.lifetimeValue, true)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Messaging is offered for the coach's own members
                            only. QuickReply attributes the send to
                            `staffId` — this coach — and a check-in arriving
                            from someone the member has never spoken to is
                            worse than no check-in. The practice-wide view is
                            read-only context, as the header says. */}
                        {r.client.coachId === ME_COACH && (
                          <Button
                            size="sm"
                            variant={msgFor === r.client.id ? "primary" : "ghost"}
                            aria-label={`Message ${clientName(r.client)}`}
                            onClick={() =>
                              setMsgFor((id) => {
                                const next = id === r.client.id ? null : r.client.id;
                                if (next) {
                                  setPrepFor(null);
                                  setPulseFor(null);
                                }
                                return next;
                              })
                            }
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            Message
                          </Button>
                        )}
                        {/* Read this member's own logs and react to them.
                            Coach's-own-members only: a reaction is attributed to
                            ME_COACH, and a "seen" from a coach the member has
                            never met is worse than none. The practice-wide view
                            is read-only context, as the header says. */}
                        {r.client.coachId === ME_COACH && (
                          <Button
                            size="sm"
                            variant={pulseFor === r.client.id ? "primary" : "ghost"}
                            aria-label={`Read ${clientName(r.client)}'s logs`}
                            onClick={() =>
                              setPulseFor((id) => {
                                const next = id === r.client.id ? null : r.client.id;
                                if (next) {
                                  setMsgFor(null);
                                  setPrepFor(null);
                                }
                                return next;
                              })
                            }
                          >
                            <Activity className="h-3.5 w-3.5" />
                            Logs
                          </Button>
                        )}
                        {r.client.coachId === ME_COACH && (
                          <Button
                            size="sm"
                            variant={prepFor === r.client.id ? "primary" : "ghost"}
                            onClick={() =>
                              setPrepFor((id) => {
                                const next = id === r.client.id ? null : r.client.id;
                                if (next) {
                                  setMsgFor(null);
                                  setPulseFor(null);
                                }
                                return next;
                              })
                            }
                          >
                            Prep
                          </Button>
                        )}
                        <Link href={`/clients/${r.client.id}`}>
                          <Button size="sm" variant="outline">
                            Open
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      )}

      {/* Room for the fixed bar to sit over, so the last row of the table is
          never the row hidden underneath it. Only while there is a selection —
          reserving it permanently would leave dead space on every render. */}
      {selectedIds.length > 0 && <div className="h-24 lg:h-20" aria-hidden />}

      {/*
        The bulk bar. Audit finding: four actions, per-record ledger rows and a
        correct compensating-write undo, imported by nothing.

        `bottom-24` below `lg` clears the mobile BottomNav, which is fixed at
        `bottom-0 z-40`. The bar's own z-index (100) would happily paint on top
        of it, which is worse than useless: the coach loses the app's navigation
        for as long as anything is selected.

        It is safe as `position: fixed` here because `animate-page-in` ends on
        `transform: none` rather than `translateY(0)` — see the note in
        tailwind.config.ts. A filled transform on that ancestor would make the
        page the bar's containing block and drop it thousands of pixels below
        the fold.
      */}
      <BulkBar
        selectedIds={selectedIds}
        staffId={ME_COACH}
        onClearSelection={() => setSelected(new Set<string>())}
        className="bottom-24 lg:bottom-3"
      />
    </div>
  );
}
