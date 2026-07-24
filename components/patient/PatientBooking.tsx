"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";

interface Slot {
  staffName: string;
  locationName: string;
  timezone: string;
  startAt: string;
  endAt: string;
}

interface Visit {
  id: string;
  visitType: string;
  startAt: string;
  staffName: string | null;
}

function time(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(new Date(value));
}

export function PatientBooking({
  slots,
  timezone,
  upcoming,
}: {
  slots: Slot[];
  timezone: string;
  upcoming: Visit[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(slots[0]?.startAt ?? "");
  const [state, setState] = useState("idle");

  async function book() {
    if (!selected) return;
    setState("booking");
    const response = await fetch("/api/patient/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startAt: selected, requestId: crypto.randomUUID() }),
    });
    setState(response.ok ? "booked" : "error");
    if (response.ok) router.refresh();
  }

  async function cancel(id: string) {
    const reason = window.prompt("Why are you cancelling this appointment?");
    if (!reason?.trim()) return;
    setState(`cancelling-${id}`);
    const response = await fetch("/api/patient/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "cancel", reason }),
    });
    setState(response.ok ? "cancelled" : "error");
    if (response.ok) router.refresh();
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-display text-title text-ink-50">Upcoming visits</h2>
        <div className="mt-4 space-y-3">
          {upcoming.length ? upcoming.map((visit) => (
            <div key={visit.id} className="flex flex-col gap-3 rounded-control border border-ink-700 bg-ink-900/40 p-4 sm:flex-row sm:items-center">
              <div className="flex-1"><p className="font-medium text-ink-100">{visit.visitType}</p><p className="mt-1 text-detail text-ink-400">{time(visit.startAt, timezone)} · {visit.staffName ?? "Assignment pending"}</p></div>
              <Button size="sm" variant="outline" onClick={() => void cancel(visit.id)} disabled={state === `cancelling-${visit.id}`}>{state === `cancelling-${visit.id}` ? "Cancelling…" : "Cancel"}</Button>
            </div>
          )) : <p className="text-body text-ink-400">No upcoming visits are scheduled.</p>}
        </div>
      </section>
      <section className="border-t border-ink-800 pt-6">
        <h2 className="font-display text-title text-ink-50">Book a coach follow-up</h2>
        <p className="mt-2 text-detail text-ink-400">Only openings inside your assigned coach’s approved hours and connected calendar appear.</p>
        {slots.length ? (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 space-y-2 text-detail text-ink-300"><span>Available time</span><select value={selected} onChange={(event) => setSelected(event.target.value)} className="focus-ring h-11 w-full rounded-control border border-ink-700 bg-ink-900 px-3 text-ink-100">{slots.map((slot) => <option key={slot.startAt} value={slot.startAt}>{time(slot.startAt, slot.timezone)} · {slot.staffName}</option>)}</select></label>
            <Button onClick={() => void book()} disabled={state === "booking"}>{state === "booking" ? "Booking…" : "Book follow-up"}</Button>
          </div>
        ) : <p className="mt-5 rounded-control border border-ink-700 bg-ink-900/40 p-4 text-body text-ink-400">No verified coach openings are available right now. Message your coach for help.</p>}
      </section>
      {state === "error" && <p className="text-detail text-high">The appointment change was not confirmed. Refresh and try again.</p>}
    </div>
  );
}
