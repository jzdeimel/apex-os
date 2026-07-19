"use client";

import * as React from "react";
import { Search, Users } from "lucide-react";
import type { Client } from "@/lib/types";
import { clientName } from "@/lib/mock/clients";
import { staffName } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { nextBestAction, triageScore, churnRisk } from "@/lib/aiInsights";
import { Input, Select, EmptyState } from "@/components/ui/primitives";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { ClientRow } from "@/components/coach/ClientRow";
import { ME_COACH, clientsForCoach, daysSinceTouch } from "@/components/coach/TodayQueue";
import { relativeDays, currency } from "@/lib/utils";

/**
 * Coach · My Roster
 *
 * The coach's book, and only the coach's book. Sortable by the three questions
 * a coach actually asks it: who is on fire (triage), who is slipping away
 * (churn), and who have I not spoken to (last touch).
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

type SortKey = "triage" | "churn" | "touch" | "name";

export default function CoachRosterPage() {
  const mine = React.useMemo(() => clientsForCoach(ME_COACH), []);

  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<(typeof STATUSES)[number]>("All");
  const [sort, setSort] = React.useState<SortKey>("triage");

  // Scores are computed once per client and reused by both the sort and the row,
  // rather than recomputed inside the comparator on every comparison.
  const scored = React.useMemo(
    () =>
      mine.map((client) => ({
        client,
        triage: triageScore(client),
        churn: churnRisk(client),
        nba: nextBestAction(client),
        touchDays: daysSinceTouch(client),
      })),
    [mine],
  );

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = scored.filter(({ client }) => {
      if (status !== "All" && client.status !== status) return false;
      if (!needle) return true;
      return (
        clientName(client).toLowerCase().includes(needle) ||
        client.mrn.toLowerCase().includes(needle) ||
        client.email.toLowerCase().includes(needle)
      );
    });

    const cmp: Record<SortKey, (a: typeof filtered[number], b: typeof filtered[number]) => number> = {
      triage: (a, b) => b.triage.score - a.triage.score,
      churn: (a, b) => b.churn.score - a.churn.score,
      touch: (a, b) => b.touchDays - a.touchDays,
      name: (a, b) => clientName(a.client).localeCompare(clientName(b.client)),
    };
    // Tiebreak on id so the list never shuffles between renders.
    return [...filtered].sort((a, b) => cmp[sort](a, b) || a.client.id.localeCompare(b.client.id));
  }, [scored, q, status, sort]);

  const summary = React.useMemo(() => {
    const active = mine.filter((c) => c.status === "Active Protocol").length;
    const atRisk = scored.filter((s) => s.churn.level === "high").length;
    const book = mine.reduce((s, c) => s + c.lifetimeValue, 0);
    const stalest = scored.reduce((m, s) => Math.max(m, s.touchDays), 0);
    return { active, atRisk, book, stalest };
  }, [mine, scored]);

  return (
    <div className="space-y-6">
      <FadeIn>
        <p className="label-eyebrow">COACH CONSOLE</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-50">
          My Roster
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          Every client assigned to {staffName(ME_COACH)} — with the same next-best-action the
          provider sees, because a coach who cannot see the plan cannot coach the plan.
        </p>
      </FadeIn>

      {/* Per-coach summary strip */}
      <FadeIn delay={0.05}>
        <div className="card grid grid-cols-2 divide-ink-700/70 sm:grid-cols-4 sm:divide-x">
          {[
            { label: "Clients", value: String(mine.length) },
            { label: "On protocol", value: String(summary.active) },
            { label: "High churn risk", value: String(summary.atRisk) },
            { label: "Longest silence", value: `${summary.stalest}d` },
          ].map((s) => (
            <div key={s.label} className="p-4">
              <p className="label-eyebrow">{s.label}</p>
              <p className="stat-mono mt-1 text-xl font-semibold text-ink-50">{s.value}</p>
            </div>
          ))}
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
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
            className="sm:w-52"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "All statuses" : s}
              </option>
            ))}
          </Select>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="sm:w-52"
          >
            <option value="triage">Sort · attention</option>
            <option value="churn">Sort · churn risk</option>
            <option value="touch">Sort · longest since touch</option>
            <option value="name">Sort · name</option>
          </Select>
        </div>
      </FadeIn>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No clients match"
          hint="Clear the search or widen the status filter."
        />
      ) : (
        <Stagger className="card divide-y divide-ink-700/60">
          {rows.map(({ client, nba, touchDays }) => (
            <StaggerItem key={client.id}>
              <ClientRow
                client={client}
                href={`/clients/${client.id}`}
                subtitle={
                  <>
                    <span className="text-ink-300">{nba.action}</span>
                    <span className="text-ink-600"> · {locationName(client.locationId)}</span>
                  </>
                }
                meta={
                  <>
                    <span className="stat-mono block text-ink-300">{touchDays}d since touch</span>
                    <span className="block text-[11px] text-ink-600">
                      next {relativeDays(client.nextAppointment)} · {currency(client.lifetimeValue, true)}
                    </span>
                  </>
                }
              />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
