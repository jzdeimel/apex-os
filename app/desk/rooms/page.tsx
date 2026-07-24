"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthoritativeResourceBoard } from "@/components/frontdesk/AuthoritativeResourceBoard";

/**
 * Front desk · Rooms.
 *
 * "Can I put the next one somewhere yet." A grid of doors rather than a list,
 * because the shape of the answer is spatial and staff already carry a map of
 * the corridor in their heads.
 *
 * It also carries the site-facts row, which is the only place in Apex that
 * names every location including the ones with no data. That is deliberate —
 * see the note on `SiteFacts`.
 */
export default function DeskRoomsPage() {
  return (
    <div>
      <header className="min-w-0">
        <Link
          href="/desk"
          className="inline-flex items-center gap-1.5 rounded-control text-detail text-ink-400 transition-colors hover:text-ink-100 focus-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Today
        </Link>
        <h1 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">
          Rooms
        </h1>
      </header>

      <section className="mt-4">
        <AuthoritativeResourceBoard />
      </section>
    </div>
  );
}
