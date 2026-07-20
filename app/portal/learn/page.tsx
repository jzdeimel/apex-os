"use client";

/**
 * Learn — the member-facing Education Centre.
 *
 * Alpha Health already runs an Education Center and a YouTube channel, and
 * publishes six FAQ questions people ask before they book. This page is the
 * in-app version of both, and the reason it exists inside the portal rather
 * than as a marketing page is proximity: the same reader is two taps from
 * their own thyroid panel, so an article about reading a thyroid panel stops
 * being general interest and starts being about them.
 *
 * Order on the page mirrors the order of a member's actual questions. First
 * "what should I read about my situation" (the recommended shelf inside
 * EducationCentre), then the topic library, and only then the FAQ — because
 * the six questions are pre-booking questions, and a member already in the
 * portal has mostly answered them by being here. They are kept anyway: "how
 * soon can someone expect results" is asked far more often after joining than
 * before, and the honest answer to it belongs somewhere a member can find it
 * without calling.
 */

import { ME, me, PortalPageHeader } from "@/components/portal/PortalHeader";
import { EducationCentre } from "@/components/portal/EducationCentre";
import { FaqAccordion } from "@/components/portal/FaqAccordion";
import { PROOF, BRAND, journeyStepFor, JOURNEY } from "@/lib/brand";
import { FadeIn } from "@/components/portal/still";
import { GraduationCap } from "lucide-react";

export default function PortalLearnPage() {
  const client = me();
  const step = journeyStepFor(client.status);

  return (
    <div className="space-y-10">
      <PortalPageHeader
        eyebrow="Education centre"
        title="Learn"
        subtitle={`The clinic's own teaching, in the app and next to your own numbers. Written to be read once and used at your next visit — not to sell you anything.`}
      />

      {/* Context strip. Three facts that frame the library without making a
          claim: where the member is in the clinic's four-step process, how
          many markers the panel covers, and who writes this. */}
      <FadeIn>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="hairline rounded-panel bg-ink-850/60 p-4">
            <p className="label-eyebrow">Where you are</p>
            <p className="mt-2 text-detail font-medium leading-snug text-ink-100">
              Step <span className="stat-mono">{step.step}</span> of{" "}
              <span className="stat-mono">{JOURNEY.length}</span> — {step.title}
            </p>
          </div>
          <div className="hairline rounded-panel bg-ink-850/60 p-4">
            <p className="label-eyebrow">Your panel</p>
            <p className="mt-2 text-detail font-medium leading-snug text-ink-100">
              <span className="stat-mono">{PROOF.markers}</span> markers, read against an optimal
              range
            </p>
          </div>
          <div className="hairline rounded-panel bg-ink-850/60 p-4">
            <p className="label-eyebrow">Who writes this</p>
            <p className="mt-2 text-detail font-medium leading-snug text-ink-100">
              {PROOF.credential} at {BRAND.name}
            </p>
          </div>
        </div>
      </FadeIn>

      <EducationCentre clientId={ME} />

      {/* ------------------------------------------------------------------ */}
      {/* The clinic's published FAQ, verbatim.                              */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4 border-t border-ink-800 pt-10">
        <div>
          <p className="label-eyebrow">Frequently asked questions</p>
          <h2 className="mt-2 flex items-center gap-2.5 font-display text-title font-semibold text-ink-50 sm:text-title">
            <GraduationCap aria-hidden className="h-5 w-5 text-gold-300" />
            What people usually want to know before they book
          </h2>
          <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
            The six questions {BRAND.name} publishes, answered in full. They are worth a read even
            once you are a member — a few of them get asked more often after joining than before.
          </p>
        </div>

        <FaqAccordion headingLevel={3} />
      </section>
    </div>
  );
}
