"use client";

import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { LocationSwitcher } from "@/components/frontdesk/LocationSwitcher";
import { DeskBoard } from "@/components/frontdesk/DeskBoard";

/**
 * Front desk · The day.
 *
 * The screen somebody leaves open from open to close. Everything above the
 * board is a strip — the site switcher, three counts and the clock — sized so
 * the first appointment row is visible on a tablet at the counter without
 * scrolling. That is the same layout rule `app/coach/page.tsx` states for its
 * queue, and for the same reason: whitespace here is not elegance, it is rows
 * pushed below the fold.
 *
 * The one action that gets its own button in the header is booking a caller,
 * because it is the thing this persona does while somebody is on hold and it
 * must never be more than one tap away from the day.
 */
export default function DeskDayPage() {
  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="label-eyebrow">FRONT DESK</p>
          <h1 className="mt-0.5 font-display text-title font-semibold tracking-tight text-ink-50">
            Today
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="hidden text-micro text-ink-500 sm:block">
            Thu 12 Jun 2026 · check-in, rooming and check-out
          </p>
          <Link href="/desk/book">
            <Button variant="primary" className="h-11 px-4 text-body">
              <PhoneCall className="h-4 w-4" />
              Book a caller
            </Button>
          </Link>
        </div>
      </header>

      <section className="mt-4">
        <LocationSwitcher />
      </section>

      <section className="mt-4">
        <DeskBoard />
      </section>
    </div>
  );
}
