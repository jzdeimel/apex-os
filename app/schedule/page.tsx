"use client";

import { RefreshCcw } from "lucide-react";

import { LiveDeskBoard } from "@/components/frontdesk/LiveDeskBoard";
import { Badge, Button } from "@/components/ui/primitives";

export default function SchedulePage() {
  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="optimal">AUTHORITATIVE SCHEDULE</Badge>
            <Badge>APEX POSTGRESQL</Badge>
          </div>
          <h1 className="mt-2 font-display text-title font-semibold tracking-tight text-ink-50">
            Today
          </h1>
          <p className="mt-1 max-w-2xl text-detail text-ink-400">
            Appointments shown here are live Apex records. Care-team roles see their own schedule;
            front desk and approved operations roles see their assigned clinics.
          </p>
        </div>
        <div>
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCcw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </header>
      <section className="mt-4">
        <LiveDeskBoard />
      </section>
    </div>
  );
}
