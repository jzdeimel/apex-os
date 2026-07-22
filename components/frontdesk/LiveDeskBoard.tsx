"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, DoorOpen, Loader2, RefreshCw, UserCheck, UserX, X } from "lucide-react";
import { Badge, Button, EmptyState, Input, Textarea } from "@/components/ui/primitives";

type LiveAppointment = {
  id: string;
  clientId: string;
  clientFirstName: string;
  clientLastName: string;
  clientPreferredName: string | null;
  staffName: string | null;
  locationName: string | null;
  visitType: string;
  bookingGroupId: string | null;
  component: string | null;
  modality: string;
  startAt: string;
  endAt: string;
  status: string;
  room: string | null;
  reason: string | null;
};

type PendingAction = { row: LiveAppointment; action: "room" | "cancel" | "reschedule" | "reopen" | "no-show" };

function bounds() {
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function time(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function localInput(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function LiveDeskBoard() {
  const [rows, setRows] = useState<LiveAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [room, setRoom] = useState("");
  const [reason, setReason] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = bounds();
      const response = await fetch(`/api/appointments?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`, { cache: "no-store" });
      const payload = await response.json() as { appointments?: LiveAppointment[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The live schedule could not be loaded.");
      setRows(payload.appointments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The live schedule could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    total: rows.length,
    waiting: rows.filter((row) => row.status === "Arrived" || row.status === "Checked In").length,
    roomed: rows.filter((row) => row.status === "Roomed").length,
    complete: rows.filter((row) => row.status === "Completed").length,
  }), [rows]);

  async function move(row: LiveAppointment, action: string, extra: Record<string, unknown> = {}) {
    setBusyId(row.id);
    setError(null);
    try {
      const groupAction = Boolean(row.bookingGroupId && ["cancel", "no-show", "reschedule"].includes(action));
      const response = await fetch(groupAction ? "/api/appointments/ncv" : "/api/appointments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(groupAction ? { groupId: row.bookingGroupId, action, ...extra } : { id: row.id, action, ...extra }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The appointment change was not confirmed.");
      setPending(null); setRoom(""); setReason(""); setNewStart(""); setNewEnd("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The appointment change was not confirmed.");
    } finally {
      setBusyId(null);
    }
  }

  function open(row: LiveAppointment, action: PendingAction["action"]) {
    setPending({ row, action });
    setRoom(row.room ?? "");
    setReason("");
    setNewStart(localInput(row.startAt));
    setNewEnd(localInput(row.endAt));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['On schedule', counts.total], ['Waiting', counts.waiting], ['Roomed', counts.roomed], ['Complete', counts.complete]].map(([label, value]) => (
          <div key={String(label)} className="card px-4 py-3"><p className="text-micro text-ink-500">{label}</p><p className="stat-mono mt-1 text-heading text-ink-50">{value}</p></div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-detail text-ink-400">Postgres is the authority for every status and timestamp below.</p>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
      </div>

      {error && <div className="rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high" role="alert">{error}</div>}
      {loading && !rows.length ? (
        <div className="flex items-center gap-2 py-12 text-detail text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading the live clinic day…</div>
      ) : rows.length ? (
        <div className="overflow-x-auto rounded-panel border border-ink-700">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead className="bg-ink-900/80 text-micro uppercase tracking-wide text-ink-500"><tr><th className="p-3">Time</th><th className="p-3">Patient</th><th className="p-3">Visit</th><th className="p-3">Staff / clinic</th><th className="p-3">State</th><th className="p-3 text-right">Next action</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const waiting = busyId === row.id;
                return (
                  <tr key={row.id} className="border-t border-ink-800 align-top">
                    <td className="p-3 stat-mono text-body text-ink-100">{time(row.startAt)}<span className="block text-micro text-ink-600">to {time(row.endAt)}</span></td>
                    <td className="p-3"><p className="font-medium text-ink-100">{row.clientPreferredName || `${row.clientFirstName} ${row.clientLastName}`}</p><p className="mt-1 text-micro text-ink-600">{row.clientId}</p></td>
                    <td className="p-3 text-detail text-ink-300">{row.visitType}<span className="block text-micro text-ink-600">{row.modality}</span></td>
                    <td className="p-3 text-detail text-ink-300">{row.staffName ?? "Unassigned"}<span className="block text-micro text-ink-600">{row.locationName ?? "Clinic pending"}</span></td>
                    <td className="p-3"><Badge tone={row.status === "Completed" ? "optimal" : row.status === "Cancelled" || row.status === "No Show" ? "neutral" : row.status === "Roomed" ? "gold" : "info"}>{row.status}{row.room ? ` · ${row.room}` : ""}</Badge></td>
                    <td className="p-3"><div className="flex flex-wrap justify-end gap-2">
                      {row.status === "Scheduled" && <><Button size="sm" onClick={() => void move(row, "arrive")} disabled={waiting}><UserCheck className="h-3.5 w-3.5" /> Arrived</Button>{(!row.bookingGroupId || row.component === "coach-intro") && <><Button size="sm" variant="outline" onClick={() => open(row, "reschedule")}><CalendarClock className="h-3.5 w-3.5" /> {row.bookingGroupId ? "Move NCV" : "Move"}</Button><Button size="sm" variant="ghost" onClick={() => row.bookingGroupId ? open(row, "no-show") : void move(row, "no-show")}><UserX className="h-3.5 w-3.5" /> No show</Button><Button size="sm" variant="ghost" onClick={() => open(row, "cancel")}><X className="h-3.5 w-3.5" /> {row.bookingGroupId ? "Cancel NCV" : "Cancel"}</Button></>}</>}
                      {(row.status === "Arrived" || row.status === "Checked In") && <><Button size="sm" onClick={() => open(row, "room")}><DoorOpen className="h-3.5 w-3.5" /> Room</Button><Button size="sm" variant="outline" onClick={() => void move(row, "complete")}><Check className="h-3.5 w-3.5" /> Complete</Button>{!row.bookingGroupId && <Button size="sm" variant="ghost" onClick={() => open(row, "cancel")}>Cancel</Button>}</>}
                      {row.status === "Roomed" && <><Button size="sm" onClick={() => void move(row, "complete")}><Check className="h-3.5 w-3.5" /> Check out</Button>{!row.bookingGroupId && <Button size="sm" variant="ghost" onClick={() => open(row, "cancel")}>Cancel</Button>}</>}
                      {(row.status === "Cancelled" || row.status === "No Show") && !row.bookingGroupId && <Button size="sm" variant="outline" onClick={() => open(row, "reopen")}>Reopen</Button>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="No live appointments today" hint="This is an empty Postgres result, not a demo schedule." />}

      {pending && (
        <div className="rounded-panel border border-gold-400/30 bg-ink-900 p-5">
          <h3 className="font-display text-heading text-ink-50">{pending.action === "room" ? "Assign a room" : pending.action === "reschedule" ? pending.row.bookingGroupId ? "Move complete NCV" : "Move appointment" : pending.action === "reopen" ? "Correct a closed appointment" : pending.action === "no-show" ? "Mark complete NCV no-show" : pending.row.bookingGroupId ? "Cancel complete NCV" : "Cancel appointment"}</h3>
          <p className="mt-1 text-detail text-ink-400">{pending.row.clientPreferredName || pending.row.clientFirstName} · {pending.row.visitType}</p>
          {pending.action === "room" && <Input className="mt-4" value={room} onChange={(event) => setRoom(event.target.value)} placeholder="Room name or number" />}
          {pending.action === "reschedule" && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-detail text-ink-300">Start<Input type="datetime-local" className="mt-1" value={newStart} onChange={(event) => setNewStart(event.target.value)} /></label>{!pending.row.bookingGroupId && <label className="text-detail text-ink-300">End<Input type="datetime-local" className="mt-1" value={newEnd} onChange={(event) => setNewEnd(event.target.value)} /></label>}</div>}
          {pending.action === "reschedule" && pending.row.bookingGroupId && <Textarea className="mt-4 min-h-20" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why the complete NCV is moving (required)" />}
          {(pending.action === "cancel" || pending.action === "reopen" || pending.action === "no-show") && <Textarea className="mt-4 min-h-20" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={pending.action === "reopen" ? "Correction reason (required)" : pending.action === "no-show" ? "No-show reason (required)" : "Cancellation reason (required)"} />}
          <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setPending(null)}>Back</Button><Button onClick={() => void move(pending.row, pending.action, pending.action === "room" ? { room } : pending.action === "reschedule" ? pending.row.bookingGroupId ? { startAt: new Date(newStart).toISOString(), reason } : { startAt: new Date(newStart).toISOString(), endAt: new Date(newEnd).toISOString() } : { reason })} disabled={busyId === pending.row.id || (pending.action === "room" && !room.trim()) || (pending.action === "reschedule" && (!newStart || (!pending.row.bookingGroupId && !newEnd) || (Boolean(pending.row.bookingGroupId) && !reason.trim()))) || ((pending.action === "cancel" || pending.action === "reopen" || pending.action === "no-show") && !reason.trim())}>{busyId === pending.row.id ? "Saving…" : "Confirm"}</Button></div>
        </div>
      )}
    </div>
  );
}
