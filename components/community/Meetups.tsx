"use client";

/**
 * Meetups & events.
 *
 * ── Why the physical events are in here at all ────────────────────────────
 * Everything else in community is a screen. The retention effect that actually
 * shows up in the numbers comes from a member knowing three other people by
 * face at the clinic they walk into. A hike and a meal-prep night do more for
 * month-four attrition than a feed does, and the app's only job is to make
 * showing up require one tap and zero questions.
 *
 * ── What's new ────────────────────────────────────────────────────────────
 * Two things the community was missing: RSVPs that STICK (across a refresh and
 * a return visit), and members/staff CREATING their own events, not just reading
 * the ones the clinic posts. Both go through lib/community/eventStore — the
 * created event and the RSVP persist, the attendee count is the seeded base plus
 * this member's own tap, and nothing invents a crowd.
 *
 * The address and phone still come straight from lib/mock/locations — never
 * retyped, because a wrong address on an event card is the specific failure that
 * ends with a member standing in a car park.
 */

import { useState } from "react";
import {
  CalendarDays,
  Clock,
  MapPin,
  Phone,
  Users,
  Plus,
  Mountain,
  UtensilsCrossed,
  GraduationCap,
  Dumbbell,
  Video,
  MessageCircleQuestion,
  PartyPopper,
  X,
} from "lucide-react";
import type { EventKind, Meetup } from "@/lib/community/types";
import type { LocationId } from "@/lib/types";
import { locationMap, locationName } from "@/lib/mock/locations";
import { staffMap, staffName } from "@/lib/mock/staff";
import { Badge, Button, Card, CardContent, EmptyState, Progress } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/motion";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate, formatTime, relativeDays } from "@/lib/utils";
import { useEvents, type NewEventInput } from "@/lib/community/eventStore";

function duration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
}

const KIND_META: Record<EventKind, { label: string; icon: typeof Mountain }> = {
  hike: { label: "Hike / outdoors", icon: Mountain },
  "meal-prep": { label: "Meal prep", icon: UtensilsCrossed },
  workshop: { label: "Workshop", icon: GraduationCap },
  qa: { label: "Ask-me-anything", icon: MessageCircleQuestion },
  strength: { label: "Training", icon: Dumbbell },
  social: { label: "Social", icon: PartyPopper },
  virtual: { label: "Online", icon: Video },
};

function kindOf(e: Meetup): EventKind {
  return e.kind ?? (e.virtual ? "virtual" : "social");
}

export function Meetups({
  nowIso,
  myHandle,
  myCoachId,
  myLocationId,
}: {
  nowIso: string;
  myHandle: string;
  myCoachId: string;
  myLocationId: LocationId;
}) {
  const { toast } = useToast();
  const { events, hydrated, isGoing, goingCount, isFull, toggleRsvp, createEvent } = useEvents(nowIso);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-body leading-relaxed text-ink-400">
          In-person at the clinics, plus whatever the community puts together. Telehealth members are
          welcome at any of them — plenty of people drive in for these.
        </p>
        <Button size="sm" variant={creating ? "ghost" : "primary"} onClick={() => setCreating((c) => !c)}>
          {creating ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {creating ? "Close" : "Create event"}
        </Button>
      </div>

      {creating && (
        <CreateEventForm
          myHandle={myHandle}
          myCoachId={myCoachId}
          myLocationId={myLocationId}
          nowIso={nowIso}
          onCreate={(input) => {
            const e = createEvent(input);
            setCreating(false);
            toast("Event created — you're going", { desc: `${e.title} · ${formatDate(e.startsAt)}` });
          }}
        />
      )}

      {events.length === 0 ? (
        <EmptyState title="Nothing on the calendar yet" hint="Create one, or your coach posts these a couple of weeks out." />
      ) : (
        <Stagger className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {events.map((m) => {
            const loc = locationMap[m.locationId];
            const host = staffMap[m.hostStaffId];
            const going = hydrated && isGoing(m.id);
            const count = goingCount(m);
            const full = isFull(m);
            const spots = Math.max(0, m.capacity - count);
            const kind = kindOf(m);
            const KindIcon = KIND_META[kind].icon;

            return (
              <StaggerItem key={m.id}>
                <Card className="flex h-full flex-col">
                  <CardContent className="flex flex-1 flex-col gap-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="gold">
                            <KindIcon className="h-3 w-3" />
                            {KIND_META[kind].label}
                          </Badge>
                          {m.virtual ? (
                            <Badge tone="info">Online</Badge>
                          ) : (
                            <Badge tone="neutral">{locationName(m.locationId)}</Badge>
                          )}
                          {m.createdBy && <Badge tone="neutral">Community-organized</Badge>}
                        </div>
                        <h3 className="mt-2 font-display text-heading font-semibold leading-snug tracking-tight text-ink-50">
                          {m.title}
                        </h3>
                      </div>
                      <span className="shrink-0 text-micro text-ink-500">{relativeDays(m.startsAt)}</span>
                    </div>

                    <p className="text-body leading-relaxed text-ink-400">{m.blurb}</p>
                    {m.description && <p className="text-detail leading-relaxed text-ink-500">{m.description}</p>}

                    <dl className="grid grid-cols-1 gap-2 text-body sm:grid-cols-2">
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
                      {m.virtual ? (
                        <div className="flex items-start gap-2 text-ink-300 sm:col-span-2">
                          <Video className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
                          <span>Online — a join link goes out to everyone going the day before.</span>
                        </div>
                      ) : (
                        <>
                          {loc?.address && (
                            <div className="flex items-start gap-2 text-ink-300 sm:col-span-2">
                              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
                              <span>{loc.address}</span>
                            </div>
                          )}
                          {loc?.phone && (
                            <div className="flex items-start gap-2 text-ink-300 sm:col-span-2">
                              <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
                              <a
                                href={`tel:${loc.phone.replace(/[^0-9]/g, "")}`}
                                className="stat-mono text-ink-300 underline-offset-2 hover:text-ink-100 hover:underline focus-ring"
                              >
                                {loc.phone}
                              </a>
                            </div>
                          )}
                        </>
                      )}
                    </dl>

                    <div className="mt-auto space-y-2.5 pt-1">
                      <div className="flex items-center justify-between text-micro text-ink-500">
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3 w-3" />
                          <span className="stat-mono">{count}</span> going
                        </span>
                        <span className={cn(full && !going ? "text-watch" : "text-ink-500")}>
                          {full && !going ? "Waitlist" : `${spots} spot${spots === 1 ? "" : "s"} left`}
                        </span>
                      </div>
                      <Progress value={Math.min((count / m.capacity) * 100, 100)} tone={full && !going ? "high" : "gold"} />

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <p className="text-micro text-ink-500">
                          {m.createdBy ? `Organized by ${m.createdBy}` : `Run by ${host?.name ?? staffName(m.hostStaffId)}`}
                          {!m.createdBy && host?.credentials ? `, ${host.credentials}` : ""}
                        </p>
                        <Button
                          size="sm"
                          variant={going ? "success" : "primary"}
                          disabled={!hydrated}
                          onClick={() => {
                            const willGo = !going;
                            toggleRsvp(m.id);
                            if (willGo) {
                              toast(full ? "Added to the waitlist" : "You're in", {
                                desc: `${m.title} · ${formatDate(m.startsAt)}`,
                              });
                            }
                          }}
                        >
                          {going ? "Going" : full ? "Join waitlist" : "RSVP"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Create event                                                                */
/* -------------------------------------------------------------------------- */

const LOCATIONS: LocationId[] = ["raleigh", "raleigh-boutique", "southern-pines", "myrtle-beach"];

function CreateEventForm({
  myHandle,
  myCoachId,
  myLocationId,
  nowIso,
  onCreate,
}: {
  myHandle: string;
  myCoachId: string;
  myLocationId: LocationId;
  nowIso: string;
  onCreate: (input: NewEventInput) => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<EventKind>("hike");
  const [virtual, setVirtual] = useState(false);
  const [locationId, setLocationId] = useState<LocationId>(myLocationId === "telehealth" ? "raleigh" : myLocationId);
  // Default to a Saturday morning ~2 weeks out from the pinned clock.
  const defaultDate = new Date(new Date(nowIso).getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("09:00");
  const [durationMin, setDurationMin] = useState(90);
  const [capacity, setCapacity] = useState(12);
  const [blurb, setBlurb] = useState("");

  const canCreate = title.trim().length >= 3 && blurb.trim().length >= 5;

  const submit = () => {
    if (!canCreate) return;
    onCreate({
      title: title.trim(),
      kind: virtual ? "virtual" : kind,
      locationId,
      startsAt: `${date}T${time}:00`,
      durationMin,
      capacity,
      blurb: blurb.trim(),
      virtual,
      hostStaffId: myCoachId,
      createdBy: myHandle,
    });
  };

  const field = "w-full rounded-control border border-ink-700 bg-ink-900/70 px-3 py-2 text-detail text-ink-100 focus-ring";

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <PartyPopper className="h-4 w-4 text-gold-400" />
          <h3 className="text-heading text-ink-50">Create an event</h3>
        </div>

        <div>
          <label className="mb-1 block text-micro uppercase tracking-[0.12em] text-ink-500">Title</label>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Saturday morning hike at Umstead" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-micro uppercase tracking-[0.12em] text-ink-500">Kind</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(KIND_META) as EventKind[]).filter((k) => k !== "virtual").map((k) => {
                const Icon = KIND_META[k].icon;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-control border px-2 py-1 text-micro transition-colors",
                      kind === k && !virtual ? "border-gold-400/50 bg-gold-400/10 text-gold-200" : "border-ink-700 text-ink-400 hover:text-ink-100",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {KIND_META[k].label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-micro uppercase tracking-[0.12em] text-ink-500">Where</label>
            <label className="mb-2 flex items-center gap-2 text-detail text-ink-300">
              <input type="checkbox" checked={virtual} onChange={(e) => setVirtual(e.target.checked)} className="accent-gold-400" />
              Online event
            </label>
            {!virtual && (
              <select className={field} value={locationId} onChange={(e) => setLocationId(e.target.value as LocationId)}>
                {LOCATIONS.map((l) => (
                  <option key={l} value={l}>
                    {locationName(l)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-micro uppercase tracking-[0.12em] text-ink-500">Date</label>
            <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-micro uppercase tracking-[0.12em] text-ink-500">Time</label>
            <input type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-micro uppercase tracking-[0.12em] text-ink-500">Capacity</label>
            <input type="number" min={2} max={100} className={field} value={capacity} onChange={(e) => setCapacity(Math.max(2, Number(e.target.value) || 2))} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-micro uppercase tracking-[0.12em] text-ink-500">Duration (min)</label>
          <input type="number" min={15} max={480} step={15} className={field + " max-w-[8rem]"} value={durationMin} onChange={(e) => setDurationMin(Math.max(15, Number(e.target.value) || 15))} />
        </div>

        <div>
          <label className="mb-1 block text-micro uppercase tracking-[0.12em] text-ink-500">What is it?</label>
          <textarea className={field} rows={2} value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="Easy 3-mile loop, all paces welcome, coffee after." />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-micro text-ink-600">Posted as {myHandle}. You&apos;ll be marked going.</p>
          <Button size="sm" variant="primary" disabled={!canCreate} onClick={submit}>
            <Plus className="h-3.5 w-3.5" /> Create
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
