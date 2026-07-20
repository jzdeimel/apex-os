"use client";

/**
 * WhatsAvailable — the member-facing rendering of the clinic's whole offer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TONE RULE. READ THIS BEFORE EDITING ANY STRING BELOW.
 *
 * This is a medical practice, not a store. Three things follow, and all three
 * are load-bearing:
 *
 *  1. DESCRIBE WHAT A SERVICE IS, NEVER WHAT IT WILL ACHIEVE. "A blood panel
 *     covering 48 biomarkers" is a fact. "Get your energy back with our panel"
 *     is an outcome promise, and an outcome promise about a medical service is
 *     a clinical claim that no clinician on staff has signed. The clinic's own
 *     promise line exists on their website, where the FTC-relevant context is
 *     marketing; inside a logged-in patient portal the same sentence reads as
 *     medical advice about that specific patient. It does not appear here.
 *
 *  2. NEVER IMPLY A CLINICAL NEED IN ORDER TO SURFACE AN OFFERING. Nothing on
 *     this screen may say "your labs suggest you'd benefit from…" unless a
 *     provider actually wrote that. Manufacturing a symptom to justify a sale
 *     is the failure mode this entire screen is at risk of, and it is the one
 *     that would do real harm. Items appear here because the clinic offers them
 *     at this member's location — that is the ONLY reason given.
 *
 *  3. ANYTHING REQUIRING A PROVIDER ROUTES TO A CONVERSATION, NOT A CHECKOUT.
 *     `requiresProviderApproval` items get "Ask your provider" and a link to
 *     messages. There is no buy button on a prescription. A portal that lets a
 *     patient add a Schedule III medication to a cart has taught them that the
 *     provider is a formality.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Structurally the screen mirrors goalphahealth.com — Men's Health, Women's
 * Health, Diagnostics, Services — so that a member who reads the website and a
 * member who opens the app are looking at the same clinic. The member's own
 * care track leads; the other track is further down but always present.
 */

import Link from "next/link";
import type { Offering, OfferingGroup, OfferingStatus } from "@/lib/discover/available";
import { dollars } from "@/lib/discover/available";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/portal/still";
import { cn } from "@/lib/utils";
import { MessageSquare, MapPin, Check } from "lucide-react";

// ---------------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------------

/**
 * Each status gets a chip and a one-line explanation of what the chip MEANS.
 *
 * The explanation is not decoration. "Included in your membership" without
 * "you've already paid for this" is a phrase a member reads as marketing; with
 * it, it is information they can act on this week.
 */
const STATUS_META: Record<
  OfferingStatus,
  { label: string; tone: "gold" | "optimal" | "neutral" | "info"; meaning: string }
> = {
  "on your plan": {
    label: "On your plan",
    tone: "gold",
    meaning: "Already part of the plan your care team built with you.",
  },
  "included in your membership": {
    label: "Included",
    tone: "optimal",
    meaning: "Covered by your current membership — no additional charge.",
  },
  "available to you": {
    label: "Available",
    tone: "neutral",
    meaning: "Offered at your location. Book it whenever you want it.",
  },
  "ask your provider": {
    label: "Ask your provider",
    tone: "info",
    meaning: "Requires a prescription. Your provider decides whether it applies to you.",
  },
};

export function StatusChip({ status }: { status: OfferingStatus }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function statusMeaning(status: OfferingStatus): string {
  return STATUS_META[status].meaning;
}

// ---------------------------------------------------------------------------
// One offering
// ---------------------------------------------------------------------------

export function OfferingCard({ offering }: { offering: Offering }) {
  const o = offering;
  const needsProvider = o.status === "ask your provider";

  return (
    <div
      className={cn(
        "hairline flex h-full flex-col rounded-panel bg-ink-900/50 p-4 sm:p-5",
        o.status === "on your plan" && "border-gold-400/30 bg-gold-400/5",
        o.status === "included in your membership" && "border-optimal/25 bg-optimal/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-detail font-medium leading-snug text-ink-50">{o.name}</p>
          <p className="mt-1 text-micro uppercase tracking-wide text-ink-500">{o.kindLabel}</p>
        </div>
        <StatusChip status={o.status} />
      </div>

      {/* What it IS. Structural description only — see the tone rule up top. */}
      <p className="mt-3 text-detail leading-relaxed text-ink-300">{o.whatItIs}</p>

      {o.planBecause && (
        <p className="mt-2 text-micro leading-relaxed text-gold-300">{o.planBecause}</p>
      )}

      {o.includedBecause && (
        <p className="mt-2 flex items-start gap-1.5 text-micro leading-relaxed text-optimal">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Your membership includes: {o.includedBecause}.</span>
        </p>
      )}

      {o.inClinicOnly && (
        <p className="mt-2 flex items-center gap-1.5 text-micro text-ink-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          At the clinic — not available by telehealth.
        </p>
      )}

      {/* mt-auto keeps the price row on the baseline across a ragged grid. */}
      <div className="mt-auto pt-4">
        {o.priceCents !== null ? (
          <p className="stat-mono text-detail text-ink-100">{dollars(o.priceCents)}</p>
        ) : null}
        {o.priceNote && (
          <p className="mt-1 text-micro leading-relaxed text-ink-500">{o.priceNote}</p>
        )}

        {/*
         * The routing rule, rendered. A prescription item gets a link to a
         * conversation with the care team. It never gets an order control —
         * ordering lives on staff surfaces, behind a provider signature.
         */}
        {needsProvider && (
          <Link
            href="/portal/messages"
            className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-control text-detail font-medium text-gold-300 hover:text-gold-200"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Bring it up with your care team
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A group of offerings
// ---------------------------------------------------------------------------

export function OfferingGroupBlock({ group }: { group: OfferingGroup }) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-display text-body font-semibold text-ink-50">{group.line}</h3>
          {group.trackLabels.length > 0 && (
            <p className="text-micro text-ink-500">
              {group.isYourTrack ? "Part of your track — " : ""}
              {group.trackLabels.join(" · ")}
            </p>
          )}
        </div>

        {/*
         * The area-level statement. It says the clinic's care for this member
         * touches this area — never that a specific product below is theirs.
         * The distinction is enforced in lib/discover/available.ts; read the
         * note there before weakening this string.
         */}
        {group.planContext && (
          <p className="mt-2 text-micro leading-relaxed text-gold-300">{group.planContext}</p>
        )}

        {/*
         * Explicit base grid-cols-1. Without it the implicit single column is
         * sized to CONTENT and a long compounded product name pushes the page
         * into horizontal scroll at 390px.
         */}
        <Stagger className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {group.offerings.map((o) => (
            <StaggerItem key={o.sku} className="h-full">
              <OfferingCard offering={o} />
            </StaggerItem>
          ))}
        </Stagger>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The whole catalogue view
// ---------------------------------------------------------------------------

export function WhatsAvailable({ groups }: { groups: OfferingGroup[] }) {
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <OfferingGroupBlock key={g.key} group={g} />
      ))}
    </div>
  );
}

/**
 * The legend.
 *
 * Four chips appear on this screen and none of them are self-explanatory to
 * someone who has never seen them. Explaining the vocabulary once, up front, is
 * cheaper than a member guessing that "Available" means "we recommend it".
 */
export function StatusLegend() {
  const order: OfferingStatus[] = [
    "on your plan",
    "included in your membership",
    "available to you",
    "ask your provider",
  ];
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {order.map((s) => (
        <div key={s} className="hairline rounded-panel bg-ink-900/40 px-4 py-3">
          <dt>
            <StatusChip status={s} />
          </dt>
          <dd className="mt-2 text-micro leading-relaxed text-ink-400">{statusMeaning(s)}</dd>
        </div>
      ))}
    </dl>
  );
}
