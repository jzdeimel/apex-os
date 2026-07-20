"use client";

import { useState } from "react";
import { ShieldAlert, KeyRound } from "lucide-react";
import { clientName, getClient } from "@/lib/mock/clients";
import { locationName } from "@/lib/mock/locations";

/**
 * The break-glass challenge, shown ON the location refusal.
 *
 * It is deliberately not a one-click override. A reason is required and the
 * consequence is stated plainly before the button will do anything — because
 * the whole value of break-glass is that the person doing it knew, at the
 * moment they did it, that it was witnessed. Friction here is a feature, not a
 * rough edge to sand off.
 */
export function BreakGlassChallenge({
  clientId,
  onBreak,
}: {
  clientId: string;
  onBreak: (reason: string) => void;
}) {
  const [arming, setArming] = useState(false);
  const [reason, setReason] = useState("");
  const client = getClient(clientId);
  const enough = reason.trim().length >= 8;

  return (
    <div className="mx-auto max-w-md rounded-panel border border-ink-800 bg-ink-900/40 px-6 py-8 text-center">
      <ShieldAlert className="mx-auto h-8 w-8 text-watch" aria-hidden />
      <h1 className="mt-3 text-heading text-ink-50">Outside your locations</h1>
      <p className="mt-2 text-detail leading-relaxed text-ink-400">
        {client ? clientName(client) : "This patient"} is at{" "}
        {client ? locationName(client.locationId) : "another location"}. Staff see the patients at
        the locations they are assigned to.
      </p>

      {!arming ? (
        <button
          type="button"
          onClick={() => setArming(true)}
          className="focus-ring mt-5 inline-flex items-center gap-2 rounded-control border border-high/40 bg-high/10 px-4 py-2.5 text-detail font-medium text-high transition-colors hover:bg-high/15"
        >
          <KeyRound className="h-4 w-4" />
          Break the glass — emergency access
        </button>
      ) : (
        <div className="mt-5 text-left">
          {/* The consequence, stated before the field, not buried after it. */}
          <p className="rounded-control border border-high/30 bg-high/5 px-3 py-2 text-micro leading-relaxed text-high">
            This opens the chart for one hour and writes an emergency-access record{" "}
            {client ? clientName(client) : "the patient"} can see in their own access log. Use it
            only when care requires it.
          </p>
          <label className="mt-3 block text-micro uppercase tracking-[0.14em] text-ink-500">
            Why you need this
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder="e.g. Patient presented in acute distress at this location; treating now."
            className="mt-1.5 w-full rounded-control border border-ink-700 bg-ink-900/70 px-3 py-2 text-detail text-ink-100 placeholder:text-ink-600 focus-ring"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={!enough}
              onClick={() => onBreak(reason.trim())}
              className="focus-ring flex-1 rounded-control bg-high px-4 py-2.5 text-detail font-medium text-white transition-colors hover:bg-high/90 disabled:opacity-40"
            >
              Open the chart
            </button>
            <button
              type="button"
              onClick={() => {
                setArming(false);
                setReason("");
              }}
              className="focus-ring rounded-control border border-ink-700 px-3 py-2.5 text-detail text-ink-400 transition-colors hover:text-ink-100"
            >
              Cancel
            </button>
          </div>
          {!enough && reason.length > 0 && (
            <p className="mt-1.5 text-micro text-ink-600">A short reason is required.</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The banner shown while an emergency window is open.
 *
 * Persistent and unmissable on purpose. A provider working in a break-glass
 * window should never forget they are in one, and a screenshot of the chart
 * should carry the evidence that it was emergency access — so the banner is part
 * of the chart, not a toast that fades.
 */
export function BreakGlassBanner({ clientId }: { clientId: string }) {
  const client = getClient(clientId);
  return (
    <div className="flex items-center gap-2.5 rounded-control border border-high/40 bg-high/10 px-4 py-2.5">
      <ShieldAlert className="h-4 w-4 shrink-0 text-high" aria-hidden />
      <p className="text-detail text-high">
        Emergency access — you are viewing {client ? clientName(client) : "this chart"} outside your
        locations. This is recorded in the audit trail and visible to the patient.
      </p>
    </div>
  );
}
