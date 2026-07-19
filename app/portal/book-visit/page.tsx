"use client";

/**
 * /portal/book-visit — the member books their own visit.
 *
 * The page this replaces is a phone call. Everything about the layout follows
 * from that: booking is the page, and travel mode sits underneath it because
 * the two questions arrive together — a member who is looking at a calendar is
 * a member who knows when they are away.
 *
 * Upcoming visits go first and small. A member arriving here often already has
 * something booked and has come to check it rather than add to it; showing
 * that above the wizard answers the question without them working through four
 * steps to find out.
 */

import Link from "next/link";
import { ArrowRight, CalendarDays, Video } from "lucide-react";
import { appointmentsForMember, visitTypeMap, BOOKING_NOW } from "@/lib/booking/availability";
import { waitlistFor } from "@/lib/booking/waitlist";
import { staffMap } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { FadeIn } from "@/components/motion";
import { ME, PortalPageHeader } from "@/components/portal/PortalHeader";
import { BookVisit } from "@/components/portal/BookVisit";
import { TravelMode } from "@/components/portal/TravelMode";
import { formatDate, formatTime, relativeDays } from "@/lib/utils";

export default function BookVisitPage() {
  const upcoming = appointmentsForMember(ME).filter((a) => a.start >= BOOKING_NOW && a.status === "Scheduled");
  const waiting = waitlistFor(ME);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 pb-16 pt-4 sm:px-6">
      <PortalPageHeader
        eyebrow="Appointments"
        title="Book a visit"
        subtitle="Real openings, not a request form. Every time you see below is a time somebody is actually free — pick one and it's yours."
      />

      {upcoming.length > 0 && (
        <FadeIn>
          <section>
            <p className="label-eyebrow">Already booked</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {upcoming.slice(0, 4).map((a) => {
                const virtual = a.locationId === "telehealth" || a.type === "Telehealth";
                return (
                  <Card key={a.id}>
                    <CardContent className="pt-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-display text-[15px] font-semibold text-ink-50">
                            {visitTypeMap[a.type]?.label ?? a.type}
                          </p>
                          <p className="mt-1 text-[13px] text-ink-400">
                            {formatDate(a.start)} at <span className="stat-mono">{formatTime(a.start)}</span> ·{" "}
                            {staffMap[a.staffId]?.name ?? "Your care team"}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-500">
                            {locationName(a.locationId)} · {relativeDays(a.start)}
                          </p>
                        </div>
                        {virtual && (
                          <Badge tone="gold">
                            <Video className="h-3 w-3" /> Video
                          </Badge>
                        )}
                      </div>
                      {virtual && (
                        <Link
                          href={`/portal/visit/${a.id}`}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-gold-300 transition-colors hover:text-gold-200 focus-ring"
                        >
                          Open your visit room <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        </FadeIn>
      )}

      {waiting.length > 0 && (
        <FadeIn>
          <section>
            <p className="label-eyebrow">On the waitlist</p>
            <div className="mt-3 grid grid-cols-1 gap-3">
              {waiting.map((w) => (
                <Card key={w.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink-50">
                        {visitTypeMap[w.visitType]?.label ?? w.visitType} · {locationName(w.locationId)}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {formatDate(w.windowStart)} → {formatDate(w.windowEnd)}
                      </p>
                    </div>
                    <Badge tone="gold">
                      Position <span className="stat-mono ml-1">{w.position}</span>
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </FadeIn>
      )}

      <section>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-gold-300" />
          <h2 className="font-display text-lg font-semibold text-ink-50">Find a time</h2>
        </div>
        <div className="mt-4">
          <BookVisit />
        </div>
      </section>

      <section>
        <TravelMode />
      </section>
    </div>
  );
}
