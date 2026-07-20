"use client";

/**
 * Book a visit — the member does it themselves, at 9pm, on a phone.
 *
 * Four steps, in the order a person actually thinks: what kind of visit, where,
 * who, when. Nothing is asked twice and nothing is asked that the system can
 * work out — the venue list is filtered by what the visit type can physically
 * be delivered as, and the clinician list is filtered by who is qualified and,
 * for telehealth, who is licensed where the member is standing.
 *
 * Two things this screen refuses to do:
 *
 *  · INVENT AVAILABILITY. Every time shown comes from `slotsFor`, which is the
 *    roster minus what is already booked. If a day is empty the screen says so
 *    and offers the waitlist rather than showing a hopeful grid.
 *  · HIDE A CONSTRAINT. When a provider is unavailable because of state
 *    licensure, the screen names them and says why. An unexplained absence
 *    reads as a broken product; an explained one reads as a clinic that takes
 *    its licences seriously.
 */

import { useMemo, useState } from "react";
import { MotionConfig } from "framer-motion";
import {
  Building2,
  Check,
  ChevronLeft,
  Clock,
  Hourglass,
  Info,
  MapPin,
  ShieldCheck,
  Users,
  Video,
} from "lucide-react";
import {
  VISIT_TYPES,
  availabilityByDay,
  blockedByLicensure,
  bookSlot,
  eligibleStaff,
  memberStateOn,
  venuesFor,
  visitTypeMap,
  BOOKING_NOW,
  type Slot,
  type VisitTypeId,
} from "@/lib/booking/availability";
import { joinWaitlist, waitlistTerms, simulateRelease, type WaitlistEntry } from "@/lib/booking/waitlist";
import { travelFor } from "@/lib/account/travel";
import { locationMap, locationName } from "@/lib/mock/locations";
import type { LocationId } from "@/lib/types";
import { Badge, Button, Card, CardContent } from "@/components/ui/primitives";
import { FadeIn, Stagger, StaggerItem, SwitchView } from "@/components/portal/still";
import { useToast } from "@/components/ui/Toast";
import { me, ME } from "@/components/portal/PortalHeader";
import { shortHash } from "@/lib/trace/hash";
import { cn, formatDate } from "@/lib/utils";

type Step = "type" | "where" | "who" | "when" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "type", label: "Visit" },
  { id: "where", label: "Where" },
  { id: "who", label: "Who" },
  { id: "when", label: "When" },
];

export function BookVisit() {
  const client = me();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("type");
  const [visitType, setVisitType] = useState<VisitTypeId | null>(null);
  const [venue, setVenue] = useState<LocationId | null>(null);
  const [staffId, setStaffId] = useState<string | "any">("any");
  const [dateIdx, setDateIdx] = useState(0);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [booked, setBooked] = useState<{ slot: Slot; ledgerId: string; hash: string } | null>(null);
  const [waitlisted, setWaitlisted] = useState<WaitlistEntry | null>(null);

  const travel = travelFor(ME);

  // Where the member physically is on the day they're booking. For an in-clinic
  // visit this is irrelevant; for telehealth it is the whole ballgame.
  const days = useMemo(() => {
    if (!visitType || !venue) return [];
    const firstDate = BOOKING_NOW.slice(0, 10);
    return availabilityByDay({
      visitType,
      locationId: venue,
      staffId: staffId === "any" ? undefined : staffId,
      fromIso: firstDate,
      memberState: venue === "telehealth" ? memberStateOn(client, firstDate, travel) : undefined,
    });
  }, [visitType, venue, staffId, client, travel]);

  const activeDay = days[dateIdx];

  /**
   * When the member said "anyone available", collapse the day to distinct
   * START TIMES rather than one button per clinician per time.
   *
   * Four providers rostered at 15-minute granularity produce seventy-odd
   * buttons for a single Tuesday, most of them the same moment with a
   * different name on it. A member choosing "anyone" has already told us they
   * do not care who — so they pick the time and we assign, preferring their own
   * care team where they're free, which is what a front desk would do anyway.
   */
  const shownSlots = useMemo(() => {
    const slots = activeDay?.slots ?? [];
    if (staffId !== "any") return slots;
    const byTime = new Map<string, Slot>();
    for (const s of slots) {
      const held = byTime.get(s.time);
      const mine = s.staffId === client.providerId || s.staffId === client.coachId;
      const heldIsMine = held && (held.staffId === client.providerId || held.staffId === client.coachId);
      if (!held || (mine && !heldIsMine)) byTime.set(s.time, s);
    }
    return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
  }, [activeDay, staffId, client.providerId, client.coachId]);
  const memberState = memberStateOn(client, activeDay?.date ?? BOOKING_NOW.slice(0, 10), travel);
  const homeState = locationMap[client.locationId]?.state ?? "NC";
  const awayForTelehealth = venue === "telehealth" && memberState !== homeState;

  const blocked = useMemo(
    () => (venue === "telehealth" && visitType ? blockedByLicensure(visitType, memberState) : []),
    [venue, visitType, memberState],
  );

  const people = useMemo(
    () =>
      visitType && venue
        ? eligibleStaff(visitType, venue, client, venue === "telehealth" ? memberState : undefined)
        : [],
    [visitType, venue, client, memberState],
  );

  function reset() {
    setStep("type");
    setVisitType(null);
    setVenue(null);
    setStaffId("any");
    setDateIdx(0);
    setChosen(null);
    setBooked(null);
    setWaitlisted(null);
  }

  function confirm() {
    if (!chosen) return;
    const result = bookSlot(chosen, client);
    if (!result) {
      // The honest failure. Someone took it between render and click.
      toast("That time just went", {
        desc: "Someone booked it while you were deciding. Nothing was double-booked — pick another.",
        tone: "warn",
      });
      setChosen(null);
      return;
    }
    setBooked({ slot: chosen, ledgerId: result.ledgerId, hash: result.ledgerHash });
    setStep("done");
    toast("Visit booked", { desc: `${formatDate(chosen.startIso)} with ${chosen.staffName}.` });
  }

  function joinTheWaitlist() {
    if (!visitType || !venue || !days.length) return;
    const entry = joinWaitlist(
      {
        clientId: ME,
        visitType,
        locationId: venue,
        staffId: staffId === "any" ? undefined : staffId,
        windowStart: days[0].date,
        windowEnd: days[Math.min(6, days.length - 1)].date,
        notifyBy: "Push",
      },
      client,
    );
    setWaitlisted(entry);
    toast(`You're number ${entry.position}`, { desc: "We'll hold your place and offer you the first opening." });
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-5">
        {/* ── Progress ─────────────────────────────────────────────────────── */}
        {step !== "done" && (
          <div className="grid grid-cols-4 gap-2">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                disabled={i > stepIndex}
                onClick={() => setStep(s.id)}
                className={cn(
                  "rounded-panel border px-3 py-2 text-left transition-colors focus-ring disabled:cursor-default",
                  i === stepIndex
                    ? "border-gold-400/40 bg-gold-400/10"
                    : i < stepIndex
                      ? "border-ink-700 bg-ink-850/60 hover:border-ink-600"
                      : "border-ink-800 bg-ink-900/40",
                )}
              >
                <span className="label-eyebrow block text-micro">Step {i + 1}</span>
                <span
                  className={cn(
                    "mt-0.5 block truncate text-detail font-medium",
                    i <= stepIndex ? "text-ink-50" : "text-ink-500",
                  )}
                >
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        )}

        <SwitchView k={step}>
          {/* ── 1. Visit type ──────────────────────────────────────────────── */}
          {step === "type" && (
            <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {VISIT_TYPES.map((t) => (
                <StaggerItem key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setVisitType(t.id);
                      const venues = venuesFor(t.id);
                      // One possible venue is not a question worth asking.
                      if (venues.length === 1) {
                        setVenue(venues[0]);
                        setStep("who");
                      } else {
                        setVenue(null);
                        setStep("where");
                      }
                    }}
                    className="card w-full p-4 text-left transition-colors hover:border-gold-400/40 focus-ring"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-display text-body font-semibold text-ink-50">{t.label}</p>
                      <Badge tone="neutral" className="shrink-0">
                        <Clock className="h-3 w-3" />
                        <span className="stat-mono">{t.durationMin}</span> min
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-detail leading-relaxed text-ink-400">{t.blurb}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {t.inPerson && (
                        <Badge tone="info">
                          <Building2 className="h-3 w-3" /> In clinic
                        </Badge>
                      )}
                      {t.virtual && (
                        <Badge tone="info">
                          <Video className="h-3 w-3" /> By video
                        </Badge>
                      )}
                      {t.providerOnly && <Badge tone="gold">Provider</Badge>}
                    </div>
                  </button>
                </StaggerItem>
              ))}
            </Stagger>
          )}

          {/* ── 2. Venue ───────────────────────────────────────────────────── */}
          {step === "where" && visitType && (
            <div className="space-y-3">
              <BackTo onClick={() => setStep("type")} label={visitTypeMap[visitType].label} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {venuesFor(visitType).map((id) => {
                  const loc = locationMap[id];
                  const virtual = id === "telehealth";
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setVenue(id);
                        setStaffId("any");
                        setStep("who");
                      }}
                      className="card w-full p-4 text-left transition-colors hover:border-gold-400/40 focus-ring"
                    >
                      <div className="flex items-center gap-2">
                        {virtual ? (
                          <Video className="h-4 w-4 text-gold-300" />
                        ) : (
                          <MapPin className="h-4 w-4 text-ink-400" />
                        )}
                        <p className="font-display text-body font-semibold text-ink-50">{loc.short}</p>
                      </div>
                      <p className="mt-1.5 text-detail leading-relaxed text-ink-400">
                        {virtual ? "From wherever you are, on any device." : loc.address}
                      </p>
                      {loc.phone && <p className="mt-1 text-micro text-ink-500 stat-mono">{loc.phone}</p>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 3. Clinician ───────────────────────────────────────────────── */}
          {step === "who" && visitType && venue && (
            <div className="space-y-3">
              <BackTo
                onClick={() => setStep(venuesFor(visitType).length === 1 ? "type" : "where")}
                label={`${visitTypeMap[visitType].label} · ${locationName(venue)}`}
              />

              {venue === "telehealth" && (
                <LicensureNotice
                  memberState={memberState}
                  homeState={homeState}
                  away={awayForTelehealth}
                  destination={travel?.destinationLabel}
                  blocked={blocked}
                />
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setStaffId("any");
                    setDateIdx(0);
                    setStep("when");
                  }}
                  className="card w-full p-4 text-left transition-colors hover:border-gold-400/40 focus-ring"
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-gold-300" />
                    <p className="font-display text-body font-semibold text-ink-50">Anyone available</p>
                  </div>
                  <p className="mt-1.5 text-detail leading-relaxed text-ink-400">
                    The fastest way to be seen. Everyone here has your chart in front of them.
                  </p>
                </button>

                {people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setStaffId(p.id);
                      setDateIdx(0);
                      setStep("when");
                    }}
                    className="card w-full p-4 text-left transition-colors hover:border-gold-400/40 focus-ring"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-body font-semibold text-ink-50">{p.name}</p>
                      {p.onCareTeam && <Badge tone="gold">Your team</Badge>}
                    </div>
                    <p className="mt-1 text-detail text-ink-400">
                      {p.role}
                      {p.credentials ? ` · ${p.credentials}` : ""}
                    </p>
                    {venue === "telehealth" && (
                      <p className="mt-2 text-micro text-ink-500">
                        Licensed in <span className="stat-mono">{p.licences.join(", ")}</span>
                      </p>
                    )}
                  </button>
                ))}

                {!people.length && (
                  <Card className="sm:col-span-2">
                    <CardContent className="pt-5">
                      <p className="text-detail text-ink-200">Nobody is available for this combination.</p>
                      <p className="mt-1 text-detail text-ink-400">
                        {venue === "telehealth"
                          ? `We don't currently have a clinician licensed in ${memberState} for this visit type. Call us on 833-549-9993 and we'll sort it out properly rather than book you into something that isn't legal.`
                          : "Try another location, or a different visit type."}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* ── 4. Time ────────────────────────────────────────────────────── */}
          {step === "when" && visitType && venue && (
            <div className="space-y-4">
              <BackTo
                onClick={() => setStep("who")}
                label={`${visitTypeMap[visitType].label} · ${locationName(venue)} · ${
                  staffId === "any" ? "Anyone" : people.find((p) => p.id === staffId)?.name ?? "Selected"
                }`}
              />

              {/* Day strip. Horizontal scroll rather than a wrapping grid — a
                  two-week calendar that reflows on a 390px screen is unreadable. */}
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {days.map((d, i) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => {
                      setDateIdx(i);
                      setChosen(null);
                    }}
                    className={cn(
                      "min-w-[68px] shrink-0 rounded-panel border px-2.5 py-2 text-center transition-colors focus-ring",
                      i === dateIdx
                        ? "border-gold-400/50 bg-gold-400/10"
                        : "border-ink-700 bg-ink-850/60 hover:border-ink-600",
                    )}
                  >
                    <span className="block text-micro uppercase tracking-wide text-ink-400">{d.label}</span>
                    <span className="stat-mono mt-0.5 block text-detail text-ink-50">{d.date.slice(8)}</span>
                    {/* Distinct start times, not raw slot rows — "78 open" for
                        a day with 26 bookable moments is a number the member
                        cannot reconcile with the list underneath it. */}
                    <span
                      className={cn(
                        "mt-1 block text-micro",
                        d.slots.length ? "text-optimal" : "text-ink-500",
                      )}
                    >
                      {d.slots.length
                        ? `${new Set(d.slots.map((s) => s.time)).size} open`
                        : d.unstaffed
                          ? "closed"
                          : "full"}
                    </span>
                  </button>
                ))}
              </div>

              {activeDay && shownSlots.length > 0 && (
                <FadeIn>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {shownSlots.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setChosen(s)}
                        className={cn(
                          "rounded-panel border px-3 py-2.5 text-left transition-colors focus-ring",
                          chosen?.id === s.id
                            ? "border-gold-400/60 bg-gold-400/10"
                            : "border-ink-700 bg-ink-850/60 hover:border-ink-600",
                        )}
                      >
                        <span className="stat-mono block text-detail text-ink-50">{s.time}</span>
                        <span className="mt-0.5 block truncate text-micro text-ink-400">{s.staffName}</span>
                      </button>
                    ))}
                  </div>
                </FadeIn>
              )}

              {activeDay && shownSlots.length === 0 && (
                <WaitlistPanel
                  day={activeDay.date}
                  unstaffed={activeDay.unstaffed}
                  entry={waitlisted}
                  onJoin={joinTheWaitlist}
                  onSimulate={() => {
                    if (!waitlisted) return;
                    const offer = simulateRelease(waitlisted);
                    setWaitlisted({ ...waitlisted });
                    toast(
                      offer ? "A slot opened up" : "Nothing has opened yet",
                      offer
                        ? { desc: offer.message }
                        : { desc: "We'll keep your place. Nothing in your window has freed up.", tone: "info" },
                    );
                  }}
                />
              )}

              {chosen && (
                <FadeIn>
                  <Card className="border-gold-400/30">
                    <CardContent className="pt-5">
                      <p className="label-eyebrow">Confirm</p>
                      <p className="mt-2 font-display text-heading font-semibold leading-tight text-ink-50">
                        {visitTypeMap[chosen.visitType].label} · {formatDate(chosen.startIso)} at{" "}
                        <span className="stat-mono">{chosen.time}</span>
                      </p>
                      <p className="mt-1.5 text-detail leading-relaxed text-ink-400">
                        With {chosen.staffName}
                        {chosen.staffCredentials ? `, ${chosen.staffCredentials}` : ""} ·{" "}
                        {locationName(chosen.locationId)} · <span className="stat-mono">{chosen.durationMin}</span> min
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="primary" onClick={confirm}>
                          <Check className="h-4 w-4" /> Book it
                        </Button>
                        <Button variant="ghost" onClick={() => setChosen(null)}>
                          Pick another time
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </FadeIn>
              )}
            </div>
          )}

          {/* ── Done ───────────────────────────────────────────────────────── */}
          {step === "done" && booked && (
            <FadeIn>
              <Card className="border-optimal/30">
                <CardContent className="pt-5">
                  <Badge tone="optimal">
                    <Check className="h-3 w-3" /> Booked
                  </Badge>
                  <h3 className="mt-3 font-display text-title font-semibold leading-tight text-ink-50">
                    {visitTypeMap[booked.slot.visitType].label} on {formatDate(booked.slot.startIso)} at{" "}
                    <span className="stat-mono">{booked.slot.time}</span>
                  </h3>
                  <p className="mt-2 text-body leading-relaxed text-ink-400">
                    With {booked.slot.staffName} · {locationName(booked.slot.locationId)}. It's on your home screen and
                    we'll remind you the day before.
                  </p>

                  {booked.slot.locationId === "telehealth" && (
                    <p className="mt-3 text-detail text-ink-300">
                      Your room opens 10 minutes early so you can run the camera and mic check before anyone joins.
                    </p>
                  )}

                  {/* The ledger row. Shown to the member, not just written for
                      staff — "who did what to my record" includes what I did. */}
                  <div className="mt-4 rounded-panel border border-ink-700 bg-ink-900/50 p-3">
                    <p className="label-eyebrow">Recorded</p>
                    <p className="mt-1 text-detail leading-relaxed text-ink-400">
                      This booking was written to your record's audit chain as{" "}
                      <span className="stat-mono text-ink-200">{booked.ledgerId}</span>, hash{" "}
                      <span className="stat-mono text-ink-200">{shortHash(booked.hash)}</span>. You can see it on
                      your Access page.
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="outline" onClick={reset}>
                      Book something else
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </FadeIn>
          )}
        </SwitchView>
      </div>
    </MotionConfig>
  );
}

// ---------------------------------------------------------------------------

function BackTo({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-detail text-ink-400 transition-colors hover:text-ink-100 focus-ring rounded-control"
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * The licensure explainer.
 *
 * Deliberately worded as a fact about the law rather than a limitation of the
 * product, because that is what it is.
 */
function LicensureNotice({
  memberState,
  homeState,
  away,
  destination,
  blocked,
}: {
  memberState: string;
  homeState: string;
  away: boolean;
  destination?: string;
  blocked: { id: string; name: string; licences: string[] }[];
}) {
  return (
    <Card className={cn(away && "border-watch/30")}>
      <CardContent className="flex gap-3 pt-5">
        <ShieldCheck className={cn("mt-0.5 h-4 w-4 shrink-0", away ? "text-watch" : "text-ink-400")} />
        <div className="min-w-0">
          <p className="text-detail font-medium text-ink-100">
            {away
              ? `You'll be in ${memberState}${destination ? ` (${destination})` : ""} — so we're only showing clinicians licensed there.`
              : `Showing clinicians licensed in ${homeState}.`}
          </p>
          <p className="mt-1 text-detail leading-relaxed text-ink-400">
            A telehealth visit legally happens where <em>you</em> are sitting, not where your provider is. Seeing you
            across a state line without a licence there isn't a technicality — it's practising medicine without one. So
            the list is filtered rather than apologetic.
          </p>
          {blocked.length > 0 && (
            <p className="mt-2 text-detail text-ink-500">
              Not shown for {memberState}: {blocked.map((b) => b.name).join(", ")}.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** The answer to "there is nothing that week". */
function WaitlistPanel({
  day,
  unstaffed,
  entry,
  onJoin,
  onSimulate,
}: {
  day: string;
  unstaffed: boolean;
  entry: WaitlistEntry | null;
  onJoin: () => void;
  onSimulate: () => void;
}) {
  return (
    <FadeIn>
      <Card className="border-watch/25">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-watch" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-body font-semibold text-ink-50">
                {unstaffed ? "We're not open for this on " : "Fully booked on "}
                {formatDate(day)}
              </p>

              {!entry ? (
                <>
                  <p className="mt-1.5 text-detail leading-relaxed text-ink-400">
                    Cancellations happen most weeks. Join the waitlist and we'll offer you the first opening in this
                    window — you keep the appointment you already have until you accept a new one.
                  </p>
                  <Button variant="primary" className="mt-4" onClick={onJoin}>
                    Join the waitlist
                  </Button>
                </>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone="gold">
                      Position <span className="stat-mono ml-1">{entry.position}</span>
                    </Badge>
                    <Badge tone="neutral">
                      {entry.windowStart.slice(5)} → {entry.windowEnd.slice(5)}
                    </Badge>
                    <Badge tone={entry.status === "Offered" ? "optimal" : "neutral"}>{entry.status}</Badge>
                  </div>
                  <p className="mt-2 text-detail leading-relaxed text-ink-400">{entry.outlook}</p>

                  <ul className="mt-3 space-y-1.5">
                    {waitlistTerms(entry).map((t) => (
                      <li key={t} className="flex gap-2 text-detail leading-relaxed text-ink-300">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>

                  {entry.offer && (
                    <div className="mt-3 rounded-panel border border-optimal/30 bg-optimal/5 p-3">
                      <p className="text-detail leading-relaxed text-ink-100">{entry.offer.message}</p>
                      <p className="mt-1 text-micro text-ink-500">
                        Held for you until <span className="stat-mono">{entry.offer.holdsUntil.slice(11, 16)}</span>.
                        Nobody else can take it before then.
                      </p>
                    </div>
                  )}

                  <Button variant="outline" size="sm" className="mt-3" onClick={onSimulate}>
                    Demo: someone cancels
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </FadeIn>
  );
}
