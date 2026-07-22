"use client";

import * as React from "react";
import Link from "next/link";
import {
  Phone,
  MapPin,
  ArrowRight,
  Check,
  Copy,
  Star,
  ShieldCheck,
  Clock,
  CreditCard,
} from "lucide-react";
import { BRAND, JOURNEY, PILLARS, CARE_TRACKS, PROOF } from "@/lib/brand";
import { locations } from "@/lib/mock/locations";
import { makeIntakeToken, INTAKE_TTL_HOURS } from "@/lib/intake/tokens";
import { DEMO_INVITE } from "@/lib/mock/intake";
import type { CareTrackKey } from "@/lib/intake/types";
import type { LocationId } from "@/lib/types";
import { Button, Input, Textarea, Badge } from "@/components/ui/primitives";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { cn } from "@/lib/utils";

/**
 * /book — "Book your free consultation"
 *
 * The clinic's front door, and the first thing a prospective member ever sees of
 * Apex. Everything above the form exists to answer the three questions a person
 * actually has before they hand over a phone number: what happens to me, where
 * do I go, and what does it cost me to find out. The clinic already answers all
 * three on their own site, so this page uses their words — JOURNEY, PILLARS and
 * CARE_TRACKS out of lib/brand.ts — rather than inventing marketing copy.
 *
 * PRE-AUTH SURFACE. Standalone layout, own header, no app chrome. See the note
 * in app/intake/[token]/page.tsx for why that matters beyond aesthetics.
 *
 * Demo-shaped, not live: submitting mints a token deterministically and renders
 * the confirmation. No network call, no email, no SMS.
 */

// ---------------------------------------------------------------------------
// Public chrome
// ---------------------------------------------------------------------------

function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-800/80 bg-ink-950/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/book" className="flex min-w-0 items-center gap-2.5 rounded-lg focus-ring">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gold-500 font-display text-body font-bold text-white">
            A
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-body font-semibold text-ink-50">
              {BRAND.name}
            </span>
            <span className="block truncate text-micro text-ink-500">{BRAND.tagline}</span>
          </span>
        </Link>
        <a
          href={`tel:${BRAND.telehealthPhone}`}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-body text-ink-300 hover:text-ink-50 focus-ring"
        >
          <Phone className="h-4 w-4" />
          <span className="stat-mono hidden sm:inline">{BRAND.telehealthPhone}</span>
        </a>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface Form {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  locationId: LocationId;
  track: CareTrackKey;
  reason: string;
}

export default function BookPage() {
  const [form, setForm] = React.useState<Form>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    locationId: "raleigh",
    track: "male",
    reason: "",
  });
  const [error, setError] = React.useState<string | null>(null);
  const [booked, setBooked] = React.useState<null | { intakePath: string; expiresAt: string }>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("We need your name so we know who we're calling.");
      return;
    }
    if (!form.email.includes("@")) {
      setError("We need a valid email — that's where your intake link goes.");
      return;
    }
    if (form.phone.trim().length < 7) {
      setError("We need a phone number. The consultation happens on a call.");
      return;
    }
    setError(null);
    void send();
  };

  /**
   * The real capture. This used to mint a token in the browser from a seeded
   * PRNG and store nothing — the lead was discarded and the link it produced
   * could never resolve, which the confirmation screen had to admit. Now the
   * server creates the lead + invite in one transaction and returns the one raw
   * copy of a CSPRNG token.
   */
  const send = async () => {
    setSubmitting(true);
    try {
      const r = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          track: form.track,
          locationId: form.locationId,
          reason: form.reason,
        }),
      });
      const res = await r.json().catch(() => ({}));
      if (r.ok && res.ok) {
        setBooked({ intakePath: res.intakePath, expiresAt: res.expiresAt });
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        // Never a fake confirmation: if it did not save, the person must know,
        // because they will otherwise wait for a call that is not coming.
        setError(res.error || "We could not save your request. Please try again or call us.");
      }
    } catch {
      setError("We could not reach the server. Please check your connection or call us.");
    } finally {
      setSubmitting(false);
    }
  };

  const track = CARE_TRACKS[form.track];
  const chosen = locations.find((l) => l.id === form.locationId);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="flex-1">
        {booked ? (
          <Confirmation form={form} intakePath={booked.intakePath} />
        ) : (
          <>
            {/* ---------------------------------------------------------------
                Hero
            --------------------------------------------------------------- */}
            <section className="mx-auto w-full max-w-5xl px-4 pb-10 pt-12 sm:px-6 sm:pt-16">
              <FadeIn>
                <p className="label-eyebrow">{BRAND.motto}</p>
                <h1 className="mt-3 max-w-3xl font-display text-title font-semibold leading-tight tracking-tight text-ink-50 sm:text-display">
                  Book your free consultation.
                </h1>
                <p className="mt-4 max-w-xl text-body leading-relaxed text-ink-300 sm:text-heading">
                  {BRAND.promise} We look past “normal” labs to find the real cause — then
                  build a plan a real clinician signs and a real coach helps you execute.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-body text-ink-400">
                  <span className="flex items-center gap-1.5">
                    <Star className="h-4 w-4 text-gold-400" />
                    <span className="stat-mono text-ink-200">{PROOF.googleRating}</span> Google
                    rating
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-gold-400" />
                    {PROOF.credential}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-gold-400" />
                    {PROOF.paymentNote}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-gold-400" />
                    <span className="stat-mono text-ink-200">{PROOF.markers}</span> markers
                  </span>
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  <a href="#book">
                    <Button variant="primary" className="h-11 gap-2 px-6 text-body">
                      Book my consultation
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </a>
                  <a href={`tel:${BRAND.telehealthPhone}`}>
                    <Button variant="outline" className="h-11 gap-2 px-5 text-body">
                      <Phone className="h-4 w-4" />
                      {BRAND.telehealthPhone}
                    </Button>
                  </a>
                </div>
              </FadeIn>
            </section>

            {/* ---------------------------------------------------------------
                Pillars
            --------------------------------------------------------------- */}
            <section className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
              <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {PILLARS.map((p) => (
                  <StaggerItem key={p.key}>
                    <div className="card h-full p-5">
                      <p className="font-display text-body font-semibold text-ink-50">
                        {p.title}
                      </p>
                      <p className="mt-2 text-body leading-relaxed text-ink-300">{p.blurb}</p>
                      <p className="mt-2 text-detail leading-relaxed text-ink-500">{p.detail}</p>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </section>

            {/* ---------------------------------------------------------------
                The four steps — the clinic's own journey, verbatim
            --------------------------------------------------------------- */}
            <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
              <p className="label-eyebrow">How it works</p>
              <h2 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">
                Four steps, in this order, every time.
              </h2>
              <p className="mt-1.5 max-w-prose text-body text-ink-400">
                Nothing gets prescribed before it gets measured, and nothing gets measured
                before somebody listens to you.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {JOURNEY.map((j) => (
                  <div key={j.step} className="card card-hover flex gap-4 p-5">
                    <span className="stat-mono grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-500/15 text-body font-semibold text-gold-300">
                      {j.step}
                    </span>
                    <div className="min-w-0">
                      <p className="font-display text-body font-semibold text-ink-50">
                        {j.title}
                      </p>
                      <p className="mt-1.5 text-body leading-relaxed text-ink-400">{j.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ---------------------------------------------------------------
                Form
            --------------------------------------------------------------- */}
            <section id="book" className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-10 sm:px-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                {/* The form itself */}
                <div className="card p-5 sm:p-7">
                  <p className="label-eyebrow">No charge, no obligation</p>
                  <h2 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">
                    Tell us where to reach you.
                  </h2>
                  <p className="mt-1.5 text-body text-ink-400">
                    Four fields. We call within one business day to book the consultation.
                  </p>

                  {/* Track */}
                  <div className="mt-6">
                    <p className="mb-2 text-body font-medium text-ink-200">Which track?</p>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {(Object.keys(CARE_TRACKS) as CareTrackKey[]).map((k) => {
                        const t = CARE_TRACKS[k];
                        const on = form.track === k;
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => set("track", k)}
                            aria-pressed={on}
                            className={cn(
                              "rounded-xl border p-4 text-left transition-colors focus-ring",
                              on
                                ? "border-gold-400/50 bg-gold-400/10"
                                : "border-ink-700 bg-ink-900/40 hover:border-ink-600",
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                                  on ? "border-gold-400 bg-gold-500" : "border-ink-600",
                                )}
                              >
                                {on && <Check className="h-2.5 w-2.5 text-white" />}
                              </span>
                              <span className="text-body font-medium text-ink-100">{t.label}</span>
                            </span>
                            <span className="mt-2 block text-detail leading-relaxed text-ink-500">
                              {t.services.slice(0, 3).join(" · ")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Location */}
                  <div className="mt-6">
                    <p className="mb-2 text-body font-medium text-ink-200">Where would you go?</p>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {locations.map((l) => {
                        const on = form.locationId === l.id;
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => set("locationId", l.id)}
                            aria-pressed={on}
                            className={cn(
                              "rounded-xl border p-3.5 text-left transition-colors focus-ring",
                              on
                                ? "border-gold-400/50 bg-gold-400/10"
                                : "border-ink-700 bg-ink-900/40 hover:border-ink-600",
                            )}
                          >
                            <span className="flex items-start gap-2">
                              <MapPin
                                className={cn(
                                  "mt-0.5 h-4 w-4 shrink-0",
                                  on ? "text-gold-300" : "text-ink-500",
                                )}
                              />
                              <span className="min-w-0">
                                <span className="block text-body font-medium text-ink-100">
                                  {l.short}
                                </span>
                                <span className="block text-detail leading-relaxed text-ink-500">
                                  {l.address ?? "Nationwide by video and phone"}
                                </span>
                                {l.phone && (
                                  <span className="stat-mono mt-0.5 block text-detail text-ink-600">
                                    {l.phone}
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-body font-medium text-ink-200">
                        First name
                      </span>
                      <Input
                        value={form.firstName}
                        onChange={(e) => set("firstName", e.target.value)}
                        autoComplete="given-name"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-body font-medium text-ink-200">
                        Last name
                      </span>
                      <Input
                        value={form.lastName}
                        onChange={(e) => set("lastName", e.target.value)}
                        autoComplete="family-name"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-body font-medium text-ink-200">Email</span>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => set("email", e.target.value)}
                        autoComplete="email"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-body font-medium text-ink-200">Mobile</span>
                      <Input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        autoComplete="tel"
                      />
                    </label>
                  </div>

                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-body font-medium text-ink-200">
                      What's going on? <span className="text-ink-500">(optional)</span>
                    </span>
                    <Textarea
                      rows={3}
                      value={form.reason}
                      onChange={(e) => set("reason", e.target.value)}
                      placeholder="A sentence is plenty. This is the first thing your clinician reads."
                    />
                  </label>

                  {error && <p className="mt-4 text-body text-high">{error}</p>}

                  <Button
                    variant="primary"
                    className="mt-5 h-11 w-full gap-2 text-body"
                    onClick={submit}
                  >
                    Book my free consultation
                    <ArrowRight className="h-4 w-4" />
                  </Button>

                  <p className="mt-3 text-detail leading-relaxed text-ink-500">
                    Booking a consultation does not sign you up for marketing. You'll be
                    asked about that separately, on its own checkbox, during intake — and
                    saying no changes nothing about your care.
                  </p>
                </div>

                {/* What happens next — the summary rail */}
                <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
                  <div className="card p-5">
                    <p className="label-eyebrow">What happens next</p>
                    <ol className="mt-3 space-y-3">
                      {[
                        "We call within one business day to book your consultation.",
                        `You get a private intake link by email and text. It expires in ${INTAKE_TTL_HOURS} hours.`,
                        "You spend four minutes on intake, so the call is about you.",
                        "You meet a clinician. No plan, no charge, no pressure — yet.",
                      ].map((s, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="stat-mono grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-800 text-detail text-ink-300">
                            {i + 1}
                          </span>
                          <span className="text-body leading-relaxed text-ink-400">{s}</span>
                        </li>
                      ))}
                    </ol>

                    <div className="mt-5 border-t border-ink-700/70 pt-4">
                      <p className="label-eyebrow">Your selection</p>
                      <p className="mt-2 text-body text-ink-200">{track.label}</p>
                      <p className="text-detail leading-relaxed text-ink-500">
                        {chosen?.name ?? "—"}
                        {chosen?.address ? ` · ${chosen.address}` : ""}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {track.services.map((s) => (
                          <Badge key={s} tone="neutral">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="mt-8 border-t border-ink-800/80">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
          <p className="text-detail leading-relaxed text-ink-600">
            Demo environment. {BRAND.name} · {BRAND.motto} · Nothing on this page is
            transmitted or treated as medical advice. Telehealth {BRAND.telehealthPhone}.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

function Confirmation({
  form,
  intakePath,
}: {
  form: Form;
  intakePath: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [copyFailed, setCopyFailed] = React.useState(false);
  const chosen = locations.find((l) => l.id === form.locationId);
  const link = intakePath;

  const copy = async () => {
    if (typeof window === "undefined" || !navigator.clipboard) {
      setCopyFailed(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(new URL(link, window.location.origin).toString());
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <FadeIn>
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-optimal/15 text-optimal">
          <Check className="h-5 w-5" />
        </span>
        <h1 className="mt-4 font-display text-title font-semibold tracking-tight text-ink-50">
          You're on the list, {form.firstName}.
        </h1>
        <p className="mt-2 text-body leading-relaxed text-ink-300">
          Someone from {chosen?.short ?? "the clinic"} calls within one business day to book
          your free consultation. If you'd rather not wait, call{" "}
          <a href={`tel:${BRAND.telehealthPhone}`} className="text-gold-300 hover:underline">
            {BRAND.telehealthPhone}
          </a>
          .
        </p>

        <div className="card mt-7 p-5">
          <p className="label-eyebrow">Your private intake link</p>
          <p className="mt-2 text-body leading-relaxed text-ink-400">
            Continue securely on this device, or copy the link for later. Alpha Health will
            follow up at <span className="text-ink-100">{form.email}</span> or{" "}
            <span className="stat-mono text-ink-100">{form.phone}</span> to finish scheduling.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code className="stat-mono min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-ink-700 bg-ink-950/70 px-3 py-2 text-detail text-ink-300">
              {link}
            </code>
            <Link href={link}>
              <Button variant="primary" size="sm">Continue intake</Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => void copy()} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          {copyFailed && (
            <p className="mt-2 text-detail text-high" role="alert">
              Copy was blocked by this browser. Use Continue intake on this device.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-detail text-ink-500">
            <span>Expires in {INTAKE_TTL_HOURS} hours</span>
            <span>Single use</span>
          </div>

          {/* Real: the lead and its single-use invite were written in one
              transaction, and this link resolves against that row. */}
        </div>

        <div className="card mt-4 p-5">
          <p className="label-eyebrow">While you wait</p>
          <ul className="mt-3 space-y-2">
            {JOURNEY.map((j) => (
              <li key={j.step} className="flex gap-3">
                <span className="stat-mono grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-800 text-detail text-ink-300">
                  {j.step}
                </span>
                <span className="min-w-0">
                  <span className="block text-body font-medium text-ink-100">{j.title}</span>
                  <span className="block text-detail leading-relaxed text-ink-500">{j.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </FadeIn>
  );
}
