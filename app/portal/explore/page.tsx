"use client";

/**
 * Explore — "everything available to you".
 *
 * WHY THIS PAGE EXISTS. Members do not know what their clinic does. They came
 * in for testosterone or a GLP-1, and two years later they still do not know
 * the clinic runs body-composition scans, draws a thyroid add-on, or that the
 * scan they paid $45 for at the front desk has been included in their tier the
 * whole time. Every one of those facts already lived in Apex, in three modules
 * that never met.
 *
 * THE ORDER OF THIS SCREEN IS THE ARGUMENT.
 *
 *   1. What you are already on.      ← affirm before you offer
 *   2. What you are paying for and haven't used.  ← what they are owed
 *   3. Everything else the clinic does.           ← the actual discovery
 *
 * Leading with (3) would make this a catalogue, and a catalogue is what a store
 * shows you. Leading with (1) means the first thing a member reads is a
 * description of their own care. By the time an offer appears they have already
 * been told what they have — which is the difference between being informed and
 * being sold to. See the tone rule in components/portal/WhatsAvailable.tsx; it
 * governs every string on this page too.
 *
 * Deterministic throughout: one pinned member, one pinned clock, pure selectors.
 */

import { useMemo } from "react";
import Link from "next/link";
import { useMe, useMeClient, PortalPageHeader } from "@/components/portal/PortalHeader";
import {
  availableFor,
  membershipUpgrade,
  dollars,
} from "@/lib/discover/available";
import {
  WhatsAvailable,
  OfferingCard,
  StatusLegend,
} from "@/components/portal/WhatsAvailable";
import { Card, CardContent, SectionTitle, EmptyState, Badge } from "@/components/ui/primitives";
import { FadeIn } from "@/components/portal/still";
import { BRAND, PROOF } from "@/lib/brand";
import { Compass, MessageSquare, Sparkles } from "lucide-react";

export default function ExplorePage() {
  // Audit fix (GAP_ANALYSIS.md, "Portal renderable as a woman"): this was the
  // module constant ME, which pinned the portal to one male member.
  const meId = useMe();
  const client = useMeClient();

  // Pure selectors over frozen data — memo is for render cost, not correctness.
  const data = useMemo(() => availableFor(meId), [meId]);
  const upgrade = useMemo(() => membershipUpgrade(meId), [meId]);

  if (!data) {
    return (
      <div className="space-y-8">
        <PortalPageHeader
          eyebrow="Everything available to you"
          title="Explore"
          subtitle="What Alpha Health offers, and what you already have."
        />
        <EmptyState
          icon={<Compass className="h-6 w-6" />}
          title="Nothing to show yet"
          hint="Once your location and membership are set up, everything offered to you appears here."
        />
      </div>
    );
  }

  const { onYourPlan, includedUnused, groups, membership, benefits, protocolCreditCents } = data;

  return (
    <div className="space-y-8">
      <PortalPageHeader
        eyebrow="Everything available to you"
        title="Explore"
        subtitle={`Everything Alpha Health offers at ${data.locationLabel}, and where you stand with each of it. ${BRAND.tagline}.`}
      />

      {/* ------------------------------------------------------------------ */}
      {/* 1. AFFIRM. What they already have, before anything is offered.     */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn>
        <div className="rounded-panel border border-gold-400/25 bg-gradient-to-br from-gold-400/12 via-gold-400/4 to-transparent px-5 py-7 sm:px-8 sm:py-9">
          <p className="label-eyebrow">Where you are today</p>
          <h2 className="mt-3 max-w-2xl font-display text-title font-semibold leading-snug text-ink-50 sm:text-title">
            {client.firstName}, you&rsquo;re on the {data.trackLabel.toLowerCase()} track
            {membership ? ` with an ${membership.tier} membership` : ""}.
          </h2>
          <p className="mt-3 max-w-prose text-detail leading-relaxed text-ink-300">
            The clinic files your care under {data.trackLabel.toLowerCase()}, so that comes first
            below. Everything else the practice does is still on this page — Alpha Health treats
            men and women, and nothing here is hidden from you because of your track.
          </p>

          {/* The clinic's own published service list for this track. Topic
              framing, verbatim from their site — not our paraphrase. */}
          <ul className="mt-5 flex flex-wrap gap-2">
            {data.trackServices.map((s) => (
              <li key={s}>
                <Badge tone="gold">{s}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </FadeIn>

      <section className="space-y-4">
        <div>
          <SectionTitle>What you&rsquo;re already on</SectionTitle>
          <p className="mt-1 max-w-prose text-detail leading-relaxed text-ink-400">
            Part of the plan your care team built with you. Nothing to decide here — this is
            what your care currently is.
          </p>
        </div>

        {onYourPlan.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {onYourPlan.map((o) => (
                <OfferingCard key={o.sku} offering={o} />
              ))}
            </div>
            {/*
             * NECESSARY, not boilerplate. Your plan names a modality; the
             * catalog lists every strength the clinic stocks of it. So a plan
             * that says "semaglutide" matches two products here, and without
             * this line a member reasonably concludes both strengths are
             * theirs. Apex never states a dose — the prescription does.
             */}
            <p className="max-w-prose text-micro leading-relaxed text-ink-500">
              Where a product is listed at more than one strength, all of them appear — your plan
              names the therapy, and your prescription is what states the amount. Your
              prescription, not this page, is the record of what you take.
            </p>
          </>
        ) : (
          <EmptyState
            title="No plan items yet"
            hint="Your plan is written after your labs are back and reviewed. It appears here the moment it exists."
          />
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 2. WHAT THEY ARE OWED. Included, and quite possibly unused.        */}
      {/* ------------------------------------------------------------------ */}
      {membership && (
        <section className="space-y-4">
          <div>
            <SectionTitle>Included in your membership</SectionTitle>
            <p className="mt-1 max-w-prose text-detail leading-relaxed text-ink-400">
              You already pay for these at {dollars(membership.monthlyRate * 100)} a month. A
              member paying at the front desk for something their tier covers is our error, not
              theirs — so it is listed plainly.
            </p>
          </div>

          <Card>
            <CardContent className="p-5 sm:p-6">
              <p className="text-detail font-medium text-ink-200">
                {membership.tier}
                {membership.status !== "Active" && (
                  <span className="ml-2 text-ink-500">({membership.status.toLowerCase()})</span>
                )}
              </p>
              <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {benefits.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-detail leading-relaxed text-ink-300">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-optimal" />
                    {b}
                  </li>
                ))}
              </ul>
              {protocolCreditCents > 0 && (
                <p className="mt-4 text-detail leading-relaxed text-ink-400">
                  You currently carry a{" "}
                  <span className="stat-mono text-ink-100">{dollars(protocolCreditCents)}</span>{" "}
                  protocol credit balance, which goes against prescribed items when your provider
                  writes them.
                </p>
              )}
            </CardContent>
          </Card>

          {includedUnused.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {includedUnused.map((o) => (
                <OfferingCard key={o.sku} offering={o} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3. EVERYTHING ELSE. The discovery this page was built for.         */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <div>
          <SectionTitle>Everything else Alpha Health does</SectionTitle>
          <p className="mt-1 max-w-prose text-detail leading-relaxed text-ink-400">
            Grouped the way the clinic groups it. Each item says what it is and what it costs.
            Nothing here is a recommendation — it appears because the practice offers it at{" "}
            {data.locationLabel}, and for no other reason.
          </p>
        </div>

        <StatusLegend />

        <WhatsAvailable groups={groups} />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* The other track. Explicitly named, because the FAQ question is real.*/}
      {/* ------------------------------------------------------------------ */}
      <FadeIn>
        <Card>
          <CardContent className="p-5 sm:p-6">
            <p className="label-eyebrow">{data.otherTrackLabel}</p>
            <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-300">
              Alpha Health is not a men&rsquo;s clinic or a women&rsquo;s clinic — it is both, and
              the {data.otherTrackLabel.toLowerCase()} services below are listed here so nobody
              has to ask whether they exist.
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {data.otherTrackServices.map((s) => (
                <li key={s}>
                  <Badge tone="neutral">{s}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </FadeIn>

      {/* ------------------------------------------------------------------ */}
      {/* Upgrade — a comparison, not a pitch.                               */}
      {/* ------------------------------------------------------------------ */}
      {upgrade && upgrade.adds.length > 0 && (
        <section className="space-y-4">
          <div>
            <SectionTitle>If you ever want to compare tiers</SectionTitle>
            <p className="mt-1 max-w-prose text-detail leading-relaxed text-ink-400">
              The difference between {upgrade.from} and {upgrade.to}, stated. There is no reason
              to change tiers unless one of these lines is something you actually want.
            </p>
          </div>

          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-display text-body font-semibold text-ink-50">{upgrade.to}</p>
                <p className="stat-mono text-detail text-ink-300">
                  +{dollars(upgrade.monthlyDifference * 100)}/mo
                </p>
              </div>
              <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {upgrade.adds.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-detail leading-relaxed text-ink-300">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-300" />
                    {a}
                  </li>
                ))}
              </ul>
              {upgrade.addedCreditCents > 0 && (
                <p className="mt-4 text-detail leading-relaxed text-ink-400">
                  {/* Not "per month" — `protocolCreditCents` is a balance the
                      tier carries, and the source data does not say how often
                      it refreshes. Stating a cadence we cannot see would be an
                      invented billing term. */}
                  Adds{" "}
                  <span className="stat-mono text-ink-100">{dollars(upgrade.addedCreditCents)}</span>{" "}
                  to the protocol credit balance you carry.
                </p>
              )}
              <p className="mt-4 text-micro leading-relaxed text-ink-500">
                {PROOF.paymentNote}. Tier changes are handled by the front desk — nothing on this
                page changes your billing.
              </p>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Closing: the honest destination for every question this page raises. */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <p className="max-w-prose text-detail leading-relaxed text-ink-300">
            Seeing something here does not mean you need it, and nothing on this page is medical
            advice. If one of these is worth a conversation, the conversation is the next step —
            not a purchase.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/portal/messages"
              className="focus-ring inline-flex items-center gap-1.5 rounded-control text-detail font-medium text-gold-300 hover:text-gold-200"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Message your care team
            </Link>
            <span className="text-detail text-ink-500">
              or call {BRAND.telehealthPhone} to speak with the clinic.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
