"use client";

/**
 * Member library — "what are these things, really?"
 *
 * The system Apex replaces answers this question with a laminated card at the
 * front desk and whatever a member finds on a forum at 11pm. That is the actual
 * competition for this page, and it loses on two axes we can win on: the forum
 * does not know what is on your plan, and the clinic brochure never says
 * "the human evidence for this is thin".
 *
 * So this page does exactly two things the alternatives cannot:
 *
 *  1. IT IS PERSONAL. Compounds proposed on this member's plan of care are
 *     chipped and pulled to the top. The moment a member sees their own
 *     compound in an encyclopaedia is the moment the encyclopaedia becomes
 *     theirs.
 *
 *  2. IT IS HONEST. Every entry carries an evidence tier, and several of them
 *     say "mostly animal data" out loud. Underselling costs a little trust
 *     once; overselling costs all of it the first time a member reads a paper.
 *
 * NO DOSES ANYWHERE. `lib/peptides/library.ts` has no field for one and this
 * page adds nothing the library did not state. Everything actionable lives on
 * the signed plan, and the provider line below is rendered on every screen size
 * rather than tucked into a footer.
 *
 * Client component (like the other portal pages) because `useMeClient()` and
 * the gallery's filter state both live on the client.
 */

import { BookOpen, ShieldCheck, Stethoscope } from "lucide-react";
import { PeptideGallery } from "@/components/peptides/PeptideGallery";
import { Badge } from "@/components/ui/primitives";
import { FadeIn } from "@/components/portal/still";
import { useMeClient, PortalPageHeader } from "@/components/portal/PortalHeader";
import type { Client } from "@/lib/types";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import {
  LIBRARY_DISCLAIMER,
  PROVIDER_LINE,
  findPeptide,
  peptideLibrary,
} from "@/lib/peptides/library";

/**
 * Resolve which library entries this member's plan actually touches.
 *
 * Wording is load-bearing. Every protocol item the engine emits carries
 * `requiresProviderApproval`, and several seeded members' plans sit at
 * "Awaiting provider" — so calling those compounds "on your plan" would tell a
 * member something has been decided when it has not. The chip only says "On
 * your plan" once the plan itself is Active; before that it says "Proposed for
 * you", which is the true statement and, usefully, the one that prompts the
 * conversation.
 *
 * Takes the subject as an argument rather than reaching for it. This function
 * runs outside a component, so it cannot call `useMe()` — and it used to call
 * the non-reactive accessor, which is precisely how the portal ended up pinned
 * to one member in the first place.
 */
function planChipsFor(client: Client): Record<string, string | null> {
  const plan = buildPlanOfCare(client);
  const label = plan.status === "Active" ? "On your plan" : "Proposed for you";

  const chips: Record<string, string | null> = {};
  for (const item of plan.protocol) {
    // `modality` is the candidate's name ("Semaglutide"); `title` is the rule
    // category and occasionally names a compound too. Search both.
    const hit = findPeptide([item.modality, item.title].filter(Boolean).join(" "));
    if (hit) chips[hit.key] = label;
  }
  return chips;
}

export default function LibraryPage() {
  // Audit fix (GAP_ANALYSIS.md, "Portal renderable as a woman"): this was the
  // module constant ME, which pinned the portal to one male member.
  const client = useMeClient();
  const chips = planChipsFor(client);
  const chipKeys = Object.keys(chips);

  // Personal entries first — the rest of the library keeps its curated order.
  const ordered = [
    ...peptideLibrary.filter((p) => chips[p.key]),
    ...peptideLibrary.filter((p) => !chips[p.key]),
  ];

  const established = peptideLibrary.filter((p) => p.evidenceTier === "established").length;

  return (
    <div className="space-y-8 pb-16">
      <PortalPageHeader
        eyebrow="Library"
        title="What these actually are"
        subtitle={`Plain-language explanations of every compound Alpha Health works with, ${client.firstName} — including an honest note on how much human evidence sits behind each one. No doses, no instructions: those come from your provider.`}
      />

      {/* ------------------------------------------------------------------ */}
      {/* The permanent provider line. Rendered before the content, not after, */}
      {/* because a caveat under 13 cards is a caveat nobody reads.            */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn>
        <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:gap-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-panel border border-gold-400/30 bg-gold-400/10 text-gold-300">
            <Stethoscope className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-2">
            <p className="text-detail leading-relaxed text-ink-200">{PROVIDER_LINE}</p>
            <p className="text-detail leading-relaxed text-ink-400">{LIBRARY_DISCLAIMER}</p>
          </div>
        </div>
      </FadeIn>

      {/* ------------------------------------------------------------------ */}
      {/* Personal hook                                                        */}
      {/* ------------------------------------------------------------------ */}
      {chipKeys.length > 0 && (
        <FadeIn delay={0.05}>
          <div className="card border-gold-400/30 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <BookOpen className="h-4 w-4 text-gold-300" />
              <h2 className="font-display text-body font-semibold text-ink-50">
                Start with yours
              </h2>
            </div>
            <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
              {chipKeys.length === 1
                ? "One compound in this library appears on your plan of care. It is marked and listed first."
                : `${chipKeys.length} compounds in this library appear on your plan of care. They are marked and listed first.`}{" "}
              Reading up before your next visit is the single best thing you can do with this page —
              the questions you bring are what make the appointment useful.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chipKeys.map((k) => {
                const entry = peptideLibrary.find((p) => p.key === k)!;
                return (
                  <Badge key={k} tone="gold">
                    {entry.name}
                  </Badge>
                );
              })}
            </div>
          </div>
        </FadeIn>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* How to read the evidence chips                                       */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn delay={0.1}>
        <div className="card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-ink-300" />
            <h2 className="font-display text-body font-semibold text-ink-50">
              How to read the evidence label
            </h2>
          </div>
          <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
            Not everything on this page is equally proven, and pretending otherwise would not serve
            you. {established} of {peptideLibrary.length} entries have large human trials behind
            them. The rest range from promising to genuinely preliminary, and each one says which.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <EvidenceKey
              tone="optimal"
              label="Well established"
              body="Large randomised human trials and regulatory approval."
            />
            <EvidenceKey
              tone="watch"
              label="Emerging evidence"
              body="Real human trials, but smaller, newer or narrower in scope."
            />
            <EvidenceKey
              tone="neutral"
              label="Early evidence"
              body="Mostly laboratory, animal or very small human studies so far."
            />
          </div>
        </div>
      </FadeIn>

      {/* ------------------------------------------------------------------ */}
      {/* The library                                                          */}
      {/* ------------------------------------------------------------------ */}
      <PeptideGallery entries={ordered} planChips={chips} />

      <p className="max-w-prose text-micro leading-relaxed text-ink-500">
        {PROVIDER_LINE} Nothing on this page is a prescription, a recommendation, or a statement
        that any of these compounds is suitable for you. If something here raises a question, send
        it to your care team — that is what the Messages page is for.
      </p>
    </div>
  );
}

function EvidenceKey({
  tone,
  label,
  body,
}: {
  tone: "optimal" | "watch" | "neutral";
  label: string;
  body: string;
}) {
  return (
    <div className="rounded-panel border border-ink-700/70 bg-ink-900/40 p-3">
      <Badge tone={tone}>{label}</Badge>
      <p className="mt-2 text-micro leading-relaxed text-ink-400">{body}</p>
    </div>
  );
}
