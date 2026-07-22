"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LiveBookingForm } from "@/components/frontdesk/LiveBookingForm";

/**
 * Front desk · Book a caller.
 *
 * GAP_ANALYSIS, FRONT DESK, P0: "Phone-driven booking (staff-side) — MISSING.
 * `lib/booking/availability.ts` is wired ONLY to the patient portal. For a
 * clinic on an 833 line, the single most important front-desk action has no
 * surface."
 *
 * The number in the subhead is the real one from `lib/mock/locations.ts`, and
 * the per-site numbers change with the site switcher, because the person
 * reading this screen is the person those calls ring through to.
 */
export default function DeskBookPage() {
  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/desk"
            className="inline-flex items-center gap-1.5 rounded-control text-detail text-ink-400 transition-colors hover:text-ink-100 focus-ring"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Today
          </Link>
          <h1 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">
            Book a caller
          </h1>
        </div>
        <p className="text-micro text-ink-500">Line: <span className="stat-mono text-ink-300">833-549-9993</span></p>
      </header>

      <section className="mt-4">
        <LiveBookingForm />
      </section>
    </div>
  );
}
