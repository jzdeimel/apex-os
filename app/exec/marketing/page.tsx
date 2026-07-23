"use client";

import * as React from "react";
import { Megaphone, TrendingUp, AlertTriangle, Users, ArrowRight, CheckCircle2, Clock3, ClipboardList, Loader2 } from "lucide-react";
import { Card, Badge, Button, Input, Select, Textarea } from "@/components/ui/primitives";
import { locationName } from "@/lib/mock/locations";

/**
 * ACQUISITION — where new patients actually come from.
 *
 * This reads REAL lead rows from Postgres (/api/leads, gated on
 * read:business-metrics),
 * not a seeded funnel. Every row here was created by someone submitting the
 * public booking form or a receptionist capturing a walk-in, and the `source`
 * field is what finally separates "the website is working" from "Raleigh's desk
 * is carrying us".
 *
 * WHY THIS IS ON THE OWNER CONSOLE AND NOWHERE ELSE. Acquisition performance is
 * commercial information — the same rule that keeps revenue off the coach and
 * member surfaces. The endpoint enforces it server-side; this page is not the
 * gate.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM. There is no spend data in Apex, so there
 * is no CAC, no ROAS, and no channel "score". Inventing those from nothing is
 * how a dashboard starts lying. What can be known from these rows — volume by
 * source, stage progression, conversion, and where leads stall — is what is
 * shown.
 */

interface Lead {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  track: string | null;
  preferredLocationId: string | null;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  ownerStaffId: string | null;
  ownerName: string | null;
  stage: string;
  createdAt: string;
  firstResponseDueAt: string;
  firstContactedAt: string | null;
  convertedClientId: string | null;
  reason: string | null;
  lostReason: string | null;
  notes: Array<{
    id: string;
    body: string;
    authorName: string;
    createdAt: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    assigneeStaffId: string;
    dueAt: string;
    status: string;
    completionNote: string | null;
  }>;
}

interface Candidate {
  id: string;
  name: string;
}

const STAGE_ORDER = [
  "new",
  "contacted",
  "intake-submitted",
  "consult-booked",
  "converted",
  "lost",
];

export default function MarketingPage() {
  const [leads, setLeads] = React.useState<Lead[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busyLead, setBusyLead] = React.useState<string | null>(null);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [taskTitle, setTaskTitle] = React.useState("");
  const [taskAssignee, setTaskAssignee] = React.useState("");
  const [taskDue, setTaskDue] = React.useState("");
  const [newOwner, setNewOwner] = React.useState("");
  const [reassignmentReason, setReassignmentReason] = React.useState("");

  const load = React.useCallback(async () => {
      setError(null);
      try {
        const r = await fetch("/api/leads", { cache: "no-store" });
        const res = await r.json().catch(() => ({}));
        if (r.ok && res.ok) {
          setLeads(res.leads);
          setCandidates(res.candidates ?? []);
          setSelectedId((current) => current && res.leads.some((lead: Lead) => lead.id === current) ? current : res.leads[0]?.id ?? null);
        }
        else setError(res.error || `Could not load leads (HTTP ${r.status}).`);
      } catch {
        setError("Could not reach the server.");
      }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const workLead = async (
    leadId: string,
    action: "claim" | "release" | "advance" | "assign" | "add-note" | "create-task" | "complete-task",
    toStage?: string,
    extra: Record<string, unknown> = {},
  ) => {
    setBusyLead(leadId);
    setError(null);
    try {
      const r = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, action, toStage, ...extra }),
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || !res.ok) {
        setError(res.error || `Could not update lead (HTTP ${r.status}).`);
        return;
      }
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyLead(null);
    }
  };

  const selected = React.useMemo(
    () => (leads ?? []).find((lead) => lead.id === selectedId) ?? null,
    [leads, selectedId],
  );

  React.useEffect(() => {
    if (!selected) return;
    setNewOwner(selected.ownerStaffId ?? "");
    setTaskAssignee(selected.ownerStaffId ?? candidates[0]?.id ?? "");
    setNote("");
    setReassignmentReason("");
  }, [selected, candidates]);

  const bySource = React.useMemo(() => {
    if (!leads) return [];
    const m = new Map<string, { total: number; converted: number; submitted: number }>();
    for (const l of leads) {
      const k = l.utmSource ?? l.source ?? "unknown";
      const e = m.get(k) ?? { total: 0, converted: 0, submitted: 0 };
      e.total += 1;
      if (l.convertedClientId) e.converted += 1;
      if (l.stage !== "new") e.submitted += 1;
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [leads]);

  const byStage = React.useMemo(() => {
    if (!leads) return [];
    const m = new Map<string, number>();
    for (const l of leads) m.set(l.stage, (m.get(l.stage) ?? 0) + 1);
    return STAGE_ORDER.filter((s) => m.has(s)).map((s) => [s, m.get(s)!] as const);
  }, [leads]);

  const stalled = React.useMemo(
    () => (leads ?? []).filter((l) => l.stage === "new"),
    [leads],
  );
  const overdueFirstResponse = React.useMemo(
    () => (leads ?? []).filter((lead) => !lead.firstContactedAt && new Date(lead.firstResponseDueAt).getTime() < Date.now()),
    [leads],
  );

  return (
    <div className="space-y-5">
      <header>
        <p className="label-eyebrow">Owner console</p>
        <h1 className="mt-0.5 flex items-center gap-2 font-display text-title font-semibold tracking-tight text-ink-50">
          <Megaphone className="h-5 w-5 text-gold-400" /> Acquisition
        </h1>
        <p className="mt-1 max-w-prose text-detail leading-relaxed text-ink-500">
          Real leads, from the public booking form and front-desk walk-ins. Spend is not in
          Apex, so this shows what can be known — volume, progression and conversion by
          channel — and does not invent a cost per acquisition.
        </p>
      </header>

      {error && (
        <Card className="flex items-start gap-2 border-critical/40 bg-critical/10 p-4 text-detail text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </Card>
      )}

      {!leads && !error && (
        <Card className="p-5 text-detail text-ink-500">Loading the funnel…</Card>
      )}

      {leads && leads.length === 0 && (
        <Card className="p-6 text-center">
          <Users className="mx-auto h-6 w-6 text-ink-600" />
          <p className="mt-2 text-body text-ink-200">No leads captured yet.</p>
          <p className="mt-1 text-detail text-ink-500">
            The public booking form and the front desk&apos;s walk-in page both land here the
            moment they are used.
          </p>
        </Card>
      )}

      {leads && leads.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Stat label="Leads captured" value={leads.length} />
            <Stat
              label="Completed intake"
              value={leads.filter((l) => l.stage !== "new").length}
              hint={`${pct(leads.filter((l) => l.stage !== "new").length, leads.length)} of captured`}
            />
            <Stat
              label="Converted to client"
              value={leads.filter((l) => l.convertedClientId).length}
              hint={`${pct(leads.filter((l) => l.convertedClientId).length, leads.length)} of captured`}
            />
            <Stat
              label="Response SLA overdue"
              value={overdueFirstResponse.length}
              hint="15-minute initial target"
            />
          </div>

          <Card className="p-5">
            <p className="label-eyebrow">By channel</p>
            <div className="mt-3 space-y-2">
              {bySource.map(([source, s]) => (
                <div key={source} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-detail capitalize text-ink-200">
                    {source}
                  </span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-800">
                    <div
                      className="h-full rounded-full bg-gold-400/70"
                      style={{ width: `${(s.total / leads.length) * 100}%` }}
                    />
                  </div>
                  <span className="stat-mono w-28 shrink-0 text-right text-detail text-ink-400">
                    {s.total} · {pct(s.submitted, s.total)} intake
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="label-eyebrow">Authoritative work queue</p>
                <p className="mt-1 max-w-2xl text-detail text-ink-500">
                  Ownership, speed-to-lead, append-only notes, and durable follow-up tasks.
                  Reassignment requires a reason and every mutation is ledger witnessed.
                </p>
              </div>
              <Badge tone={overdueFirstResponse.length ? "high" : "optimal"}>
                {overdueFirstResponse.length} response clock{overdueFirstResponse.length === 1 ? "" : "s"} overdue
              </Badge>
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(300px,0.85fr)_minmax(480px,1.35fr)]">
              <ol className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {leads.map((lead) => {
                  const responseLate = !lead.firstContactedAt && new Date(lead.firstResponseDueAt).getTime() < Date.now();
                  const openTasks = lead.tasks.filter((task) => task.status === "open");
                  return (
                    <li key={lead.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(lead.id)}
                        className={`w-full rounded-control border p-3 text-left transition ${selected?.id === lead.id ? "border-gold-400/50 bg-gold-400/[0.06]" : "border-ink-800 bg-ink-950/20 hover:border-ink-600"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate text-detail font-medium text-ink-100">{[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed lead"}</p>
                          <Badge tone={responseLate ? "high" : lead.firstContactedAt ? "optimal" : "watch"}>{lead.stage.replaceAll("-", " ")}</Badge>
                        </div>
                        <p className="mt-2 text-micro text-ink-500">{lead.ownerName ?? "Unassigned"} · {openTasks.length} open task{openTasks.length === 1 ? "" : "s"}</p>
                        <p className={`mt-1 text-micro ${responseLate ? "text-high" : "text-ink-500"}`}>
                          {lead.firstContactedAt ? `First contact ${new Date(lead.firstContactedAt).toLocaleString()}` : `Response due ${new Date(lead.firstResponseDueAt).toLocaleString()}`}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {selected && (
                <div className="rounded-control border border-ink-800 bg-ink-950/25 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-heading text-ink-50">{[selected.firstName, selected.lastName].filter(Boolean).join(" ") || "Unnamed lead"}</h3>
                      <p className="mt-1 text-detail text-ink-400">{selected.email ?? "No email"} · {selected.phone ?? "No phone"}</p>
                    </div>
                    <Badge>{selected.stage.replaceAll("-", " ")}</Badge>
                  </div>
                  {selected.reason && <p className="mt-4 rounded-control border border-ink-800 bg-ink-900/40 p-3 text-detail leading-relaxed text-ink-300">{selected.reason}</p>}

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <label className="text-detail text-ink-300">Owner<Select className="mt-2" value={newOwner} onChange={(event) => setNewOwner(event.target.value)}><option value="">Unassigned</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</Select></label>
                    <label className="text-detail text-ink-300">Reassignment reason<Input className="mt-2" value={reassignmentReason} onChange={(event) => setReassignmentReason(event.target.value)} placeholder="Coverage, workload, handoff…" /></label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" disabled={busyLead === selected.id || newOwner === (selected.ownerStaffId ?? "") || !reassignmentReason.trim()} onClick={() => void workLead(selected.id, "assign", undefined, { assigneeStaffId: newOwner || null, note: reassignmentReason })}>Save owner</Button>
                    {!selected.ownerStaffId && <Button size="sm" variant="outline" disabled={busyLead === selected.id} onClick={() => void workLead(selected.id, "claim")}>Claim as me</Button>}
                    {selected.stage === "new" && <Button size="sm" variant="success" disabled={busyLead === selected.id} onClick={() => void workLead(selected.id, "advance", "contacted")}>Mark contacted</Button>}
                    {selected.stage !== "lost" && selected.stage !== "converted" && <Button size="sm" variant="danger" disabled={busyLead === selected.id} onClick={() => { const reason = window.prompt("Why was this opportunity lost?"); if (reason) void workLead(selected.id, "advance", "lost", { note: reason }); }}>Mark lost</Button>}
                    {selected.stage === "lost" && <Button size="sm" variant="outline" disabled={busyLead === selected.id} onClick={() => void workLead(selected.id, "advance", "new", { note: "Opportunity reopened" })}>Reopen</Button>}
                  </div>

                  <div className="mt-6 grid gap-5 lg:grid-cols-2">
                    <section>
                      <div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-teal-300" /><h4 className="text-body font-medium text-ink-100">Working notes</h4></div>
                      <Textarea className="mt-3 min-h-20" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What happened and what is next?" />
                      <Button className="mt-2" size="sm" disabled={busyLead === selected.id || note.trim().length < 2} onClick={() => void workLead(selected.id, "add-note", undefined, { note })}>Add note</Button>
                      <ol className="mt-4 max-h-56 space-y-3 overflow-y-auto">
                        {selected.notes.map((entry) => <li key={entry.id} className="border-l border-ink-700 pl-3 text-detail"><p className="text-ink-300">{entry.body}</p><p className="mt-1 text-micro text-ink-500">{entry.authorName} · {new Date(entry.createdAt).toLocaleString()}</p></li>)}
                        {!selected.notes.length && <li className="text-detail text-ink-500">No working notes yet.</li>}
                      </ol>
                    </section>

                    <section>
                      <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-watch" /><h4 className="text-body font-medium text-ink-100">Follow-up tasks</h4></div>
                      <Input className="mt-3" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Call, confirm, schedule…" />
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Select value={taskAssignee} onChange={(event) => setTaskAssignee(event.target.value)}>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</Select>
                        <Input type="datetime-local" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} />
                      </div>
                      <Button className="mt-2" size="sm" disabled={busyLead === selected.id || !taskTitle.trim() || !taskDue || !taskAssignee} onClick={() => void workLead(selected.id, "create-task", undefined, { title: taskTitle, dueAt: new Date(taskDue).toISOString(), assigneeStaffId: taskAssignee })}>Create task</Button>
                      <ol className="mt-4 max-h-56 space-y-2 overflow-y-auto">
                        {selected.tasks.map((task) => <li key={task.id} className="flex items-start gap-2 rounded-control border border-ink-800 p-3 text-detail"><button type="button" disabled={task.status !== "open" || busyLead === selected.id} onClick={() => void workLead(selected.id, "complete-task", undefined, { taskId: task.id })} className="mt-0.5 text-ink-500 hover:text-optimal disabled:text-optimal"><CheckCircle2 className="h-4 w-4" /></button><div><p className={task.status === "completed" ? "text-ink-500 line-through" : "text-ink-200"}>{task.title}</p><p className="mt-1 text-micro text-ink-500">Due {new Date(task.dueAt).toLocaleString()}</p></div></li>)}
                        {!selected.tasks.length && <li className="text-detail text-ink-500">No follow-up tasks yet.</li>}
                      </ol>
                    </section>
                  </div>
                  {busyLead === selected.id && <p className="mt-4 flex items-center gap-2 text-detail text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Confirming durable change…</p>}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <p className="label-eyebrow">Funnel</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {byStage.map(([stage, n], i) => (
                <React.Fragment key={stage}>
                  {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-ink-500" />}
                  <div className="rounded-lg border border-ink-700 bg-ink-900/50 px-3 py-2">
                    <p className="stat-mono text-body text-ink-50">{n}</p>
                    <p className="text-micro capitalize text-ink-500">{stage.replace("-", " ")}</p>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <p className="label-eyebrow">Campaign attribution</p>
            <p className="mt-1 text-detail text-ink-500">
              First-touch UTM values captured with the lead. Blank means the booking
              arrived without campaign parameters; Apex does not guess.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-detail">
                <thead className="text-micro uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="pb-2 pr-3 font-medium">Lead</th>
                    <th className="pb-2 pr-3 font-medium">Source</th>
                    <th className="pb-2 pr-3 font-medium">Medium</th>
                    <th className="pb-2 pr-3 font-medium">Campaign</th>
                    <th className="pb-2 font-medium">Captured</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-800">
                  {leads.slice(0, 25).map((lead) => (
                    <tr key={lead.id}>
                      <td className="py-2 pr-3 text-ink-200">
                        {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed lead"}
                      </td>
                      <td className="py-2 pr-3 text-ink-400">
                        {lead.utmSource ?? lead.source ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-ink-400">{lead.utmMedium ?? "—"}</td>
                      <td className="py-2 pr-3 text-ink-400">{lead.utmCampaign ?? "—"}</td>
                      <td className="stat-mono py-2 text-ink-500">
                        {new Date(lead.createdAt).toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {stalled.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-high" />
                <p className="text-body font-medium text-ink-100">
                  {stalled.length} captured but no intake yet
                </p>
              </div>
              <p className="mt-1 text-detail text-ink-500">
                These people raised their hand and stopped. This is the highest-yield call
                list in the business.
              </p>
              <ul className="mt-3 divide-y divide-ink-800">
                {stalled.slice(0, 12).map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="min-w-0 flex-1 truncate text-detail text-ink-200">
                      {[l.firstName, l.lastName].filter(Boolean).join(" ") || "Unnamed lead"}
                    </span>
                    <Badge tone="neutral">{l.source ?? "unknown"}</Badge>
                    <Badge tone={l.ownerStaffId ? "optimal" : "watch"}>
                      {l.ownerStaffId ? "Owned" : "Unassigned"}
                    </Badge>
                    {l.preferredLocationId && (
                      <span className="text-micro text-ink-500">
                        {locationName(l.preferredLocationId as never)}
                      </span>
                    )}
                    <span className="stat-mono text-micro text-ink-600">
                      {new Date(l.createdAt).toISOString().slice(0, 10)}
                    </span>
                    {!l.ownerStaffId && (
                      <button
                        type="button"
                        disabled={busyLead === l.id}
                        onClick={() => void workLead(l.id, "claim")}
                        className="focus-ring rounded-lg border border-ink-700 px-2.5 py-1 text-micro text-ink-300 transition-colors hover:border-ink-500 hover:text-ink-100 disabled:opacity-50"
                      >
                        Claim
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyLead === l.id}
                      onClick={() => void workLead(l.id, "advance", "contacted")}
                      className="focus-ring rounded-lg border border-gold-400/40 bg-gold-400/10 px-2.5 py-1 text-micro text-gold-200 transition-colors hover:bg-gold-400/20 disabled:opacity-50"
                    >
                      Mark contacted
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function pct(n: number, d: number) {
  return d === 0 ? "0%" : `${Math.round((n / d) * 100)}%`;
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="label-eyebrow">{label}</p>
      <p className="stat-mono mt-1 text-display font-semibold text-ink-50">{value}</p>
      {hint && <p className="mt-0.5 text-micro text-ink-500">{hint}</p>}
    </Card>
  );
}
