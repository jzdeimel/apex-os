"use client";

/**
 * Meetups.
 *
 * ── Why the physical events are in here at all ────────────────────────────
 * Everything else in community is a screen. The retention effect that actually
 * shows up in the numbers comes from a member knowing three other people by
 * face at the clinic they walk into. A hike and a meal-prep night do more for
 * month-four attrition than a feed does, and the app's only job is to make
 * showing up require one tap and zero questions.
 *
 * So the card answers every question that would otherwise become a phone call
 * to the front desk: where exactly, what time, who's running it, how many are
 * going, is there room. Address and phone come straight from
 * lib/mock/locations — never retyped here, because a wrong address on an event
 * card is the specific failure that ends with a member standing in a car park.
 */

import { useState } from "react";
import { CalendarDays, Clock, MapPin, Phone, Users } from "lucide-react";
import type { Meetup } from "@/lib/community/types";
import { locationMap, locationName } from "@/lib/mock/locations";
import { staffMap, staffName } from "@/lib/mock/staff";
import { Badge, Button, Card, CardContent, EmptyState, Progress } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/motion";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate, formatTime, relativeDays } from "@/lib/utils";

function duration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
}

export function Meetups({ meetups }: { meetups: Meetup[] }) {
  const { toast } = useToast();
  const [going, setGoing] = useState<Record<string, boolean>>({});

  const upcoming = meetups.slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  if (upcoming.length === 0) {
    return (
      <EmptyState
        title="Nothing on the calendar yet"
        hint="Your coach posts these a couple of weeks out."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Telehealth members have no clinic of their own, and the honest answer
          is that they're welcome at all four rather than pretending a video
          call is a meetup. Said once, at the top, instead of on every card. */}
      <p className="max-w-prose text-sm leading-relaxed text-ink-400">
        In-person, at the clinics. If you&apos;re a Telehealth member you&apos;re welcome at any
        of them — plenty of people drive in for these.
      </p>

      {/* Base grid-cols-1 is explicit: the address lines are long and an
          implicit column would size to the widest one and overflow at 390px. */}
      <Stagger className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {upcoming.map((m) => {
          const loc = locationMap[m.locationId];
          const host = staffMap[m.hostStaffId];
          const rsvps = m.rsvps + (going[m.id] ? 1 : 0);
          const full = rsvps >= m.capacity;
          const spots = Math.max(0, m.capacity - rsvps);

          return (
            <StaggerItem key={m.id}>
              <Card className="flex h-full flex-col">
                <CardContent className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Badge tone="gold">{locationName(m.locationId)}</Badge>
                      <h3 className="mt-2 font-display text-lg font-semibold leading-snug tracking-tight text-ink-50">
                        {m.title}
                      </h3>
                    </div>
                    <span className="shrink-0 text-[11px] text-ink-500">
                      {relativeDays(m.startsAt)}
                    </span>
                  </div>

                  <p className="text-sm leading-relaxed text-ink-400">{m.blurb}</p>

                  <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <div className="flex items-start gap-2 text-ink-300">
                      <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
                      <span>
                        {formatDate(m.startsAt)}
                        <span className="text-ink-500"> · </span>
                        <span className="stat-mono">{formatTime(m.startsAt)}</span>
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-ink-300">
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
                      <span className="stat-mono">{duration(m.durationMin)}</span>
                    </div>
                    {loc?.address && (
                      <div className="flex items-start gap-2 text-ink-300 sm:col-span-2">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
                        <span>{loc.address}</span>
                      </div>
                    )}
                    {loc?.phone && (
                      <div className="flex items-start gap-2 text-ink-300 sm:col-span-2">
                        <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
                        {/* Tappable: on a phone, "can I still get in?" should be
                            one tap, not a copy-paste. */}
                        <a
                          href={`tel:${loc.phone.replace(/[^0-9]/g, "")}`}
                          className="stat-mono text-ink-300 underline-offset-2 hover:text-ink-100 hover:underline focus-ring"
                        >
                          {loc.phone}
                        </a>
                      </div>
                    )}
                  </dl>

                  <div className="mt-auto space-y-2.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-ink-500">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3 w-3" />
                        <span className="stat-mono">{rsvps}</span> going
                      </span>
                      <span className={cn(full ? "text-watch" : "text-ink-500")}>
                        {full ? "Waitlist" : `${spots} spots left`}
                      </span>
                    </div>
                    <Progress
                      value={(rsvps / m.capacity) * 100}
                      tone={full ? "high" : "gold"}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <p className="text-[11px] text-ink-500">
                        Run by {host?.name ?? staffName(m.hostStaffId)}
                        {host?.credentials ? `, ${host.credentials}` : ""}
                      </p>
                      <Button
                        size="sm"
                        variant={going[m.id] ? "success" : "primary"}
                        onClick={() => {
                          const next = !going[m.id];
                          setGoing((g) => ({ ...g, [m.id]: next }));
                          if (next) {
                            toast(full ? "Added to the waitlist" : "You're in", {
                              desc: `${m.title} · ${formatDate(m.startsAt)}`,
                            });
                          }
                        }}
                      >
                        {going[m.id] ? "Going" : full ? "Join waitlist" : "RSVP"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          );
        })}
      </Stagger>
    </div>
  );
}
