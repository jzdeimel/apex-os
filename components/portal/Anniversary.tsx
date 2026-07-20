"use client";

/**
 * Anniversary — the celebration screen.
 *
 * Built to be dropped in by someone else: it takes a member id, defaults to the
 * portal's subject, renders nothing at all when there is nothing to celebrate,
 * and owns no routing. `<Anniversary />` on the progress or home surface is the
 * whole integration.
 *
 * `compact` exists for exactly that embed: the full version is a screen, the
 * compact version is a card that sits above whatever else that page is for.
 *
 * Everything shown is the member's own record measured against their own
 * earlier record. There is no comparison to another member anywhere in here,
 * by construction — the engine never receives another member's data.
 */

import * as React from "react";
import { Award, Check, Copy, PartyPopper, Share2 } from "lucide-react";

import { Card, CardContent, Badge, Button } from "@/components/ui/primitives";
import { Stagger, StaggerItem, FadeIn } from "@/components/portal/still";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";
import { getClient } from "@/lib/mock/clients";
import { useMe } from "@/components/portal/PortalHeader";
import {
  headlineMilestone,
  milestonesFor,
  shareCardFor,
  type Milestone,
} from "@/lib/growth/milestones";

const KIND_TONE: Record<Milestone["kind"], "gold" | "optimal" | "info" | "neutral"> = {
  tenure: "gold",
  protocol: "info",
  streak: "optimal",
  body: "neutral",
};

const KIND_LABEL: Record<Milestone["kind"], string> = {
  tenure: "Time with us",
  protocol: "Program",
  streak: "Consistency",
  body: "Measured",
};

export function Anniversary({
  clientId: clientIdProp,
  compact = false,
}: {
  clientId?: string;
  compact?: boolean;
}) {
  // Audit fix (GAP_ANALYSIS.md, "Portal renderable as a woman"): the default
  // used to be the ME constant, so this card kept rendering the one hardcoded
  // male member even once the portal around it was rendering someone else.
  // Resolved in the body rather than as a default parameter — a default
  // parameter cannot call a hook, and `prop ?? useMe()` would short-circuit
  // the hook away on any render where the prop is supplied.
  const meId = useMe();
  const clientId = clientIdProp ?? meId;
  const { toast } = useToast();
  const client = getClient(clientId);

  const milestones = React.useMemo(() => (client ? milestonesFor(client) : []), [client]);
  const headline = headlineMilestone(milestones);

  const [sharing, setSharing] = React.useState<Milestone | null>(null);

  // Nothing to celebrate is a legitimate state. A congratulations screen that
  // fires on week one teaches the member to ignore the next one.
  if (!client || !headline) return null;

  const card = sharing ? shareCardFor(sharing, client) : null;

  async function copyCaption() {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.caption);
      toast("Caption copied", { desc: card.caption });
    } catch {
      toast("Couldn't copy automatically", { tone: "warn", desc: card.caption });
    }
  }

  const shown = compact ? milestones.slice(0, 3) : milestones;

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------------------- */}
      {/* The moment                                                        */}
      {/* ---------------------------------------------------------------- */}
      <FadeIn>
        <div className="relative overflow-hidden rounded-panel border border-gold-400/25 bg-gradient-to-br from-gold-500/12 via-gold-500/[0.04] to-transparent px-5 py-7 sm:px-8 sm:py-9">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-4 w-4 text-gold-300" />
            <p className="label-eyebrow">{formatDate(headline.achievedOn)}</p>
          </div>
          <p className="mt-3 font-display text-display font-semibold leading-[1.15] tracking-tight text-ink-50 sm:text-display">
            {headline.title}
          </p>
          <p className="mt-3 max-w-prose text-body leading-relaxed text-ink-300">
            {headline.detail}
          </p>

          {headline.shareable && (
            <Button className="mt-5" variant="primary" size="md" onClick={() => setSharing(headline)}>
              <Share2 className="h-4 w-4" />
              Make a card
            </Button>
          )}
        </div>
      </FadeIn>

      {/* ---------------------------------------------------------------- */}
      {/* Everything they've hit — their numbers, their earlier numbers.    */}
      {/* ---------------------------------------------------------------- */}
      <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shown.map((m) => (
          <StaggerItem key={m.id}>
            <Card className="card-hover h-full">
              <CardContent className="flex h-full flex-col p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-body font-medium leading-snug text-ink-50">{m.title}</p>
                  <Badge tone={KIND_TONE[m.kind]}>{KIND_LABEL[m.kind]}</Badge>
                </div>

                {m.metric && (
                  // Their own before and after, on the same measurement. This
                  // row is the entire point of the screen.
                  <div className="mt-3 flex items-center gap-2 rounded-panel bg-ink-900/60 p-3">
                    <div className="min-w-0">
                      <p className="text-micro uppercase tracking-wide text-ink-500">
                        {m.metric.label} then
                      </p>
                      <p className="stat-mono text-detail text-ink-300">{m.metric.from}</p>
                    </div>
                    <span className="text-ink-600">→</span>
                    <div className="min-w-0">
                      <p className="text-micro uppercase tracking-wide text-ink-500">now</p>
                      <p className="stat-mono text-detail font-semibold text-ink-50">{m.metric.to}</p>
                    </div>
                  </div>
                )}

                <p className="mt-3 text-detail leading-relaxed text-ink-400">{m.detail}</p>

                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                  <span className="stat-mono text-micro text-ink-500">
                    {formatDate(m.achievedOn)}
                  </span>
                  {m.shareable ? (
                    <Button variant="ghost" size="sm" onClick={() => setSharing(m)}>
                      <Share2 className="h-3.5 w-3.5" />
                      Card
                    </Button>
                  ) : (
                    // Stated, not silently omitted — a missing button reads as
                    // a bug, a one-line reason reads as a decision.
                    <span className="text-micro text-ink-500">Yours to share, not ours to package</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      {compact && milestones.length > shown.length && (
        <p className="text-detail text-ink-500">
          <span className="stat-mono">{milestones.length - shown.length}</span> more on your progress
          page.
        </p>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Share card                                                        */}
      {/* ---------------------------------------------------------------- */}
      {sharing && card && (
        <FadeIn>
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display text-heading font-semibold text-ink-50">Your card</h3>
                  <p className="mt-1 max-w-prose text-detail leading-relaxed text-ink-400">
                    A milestone, and nothing else. No measurements, no results, no program name — a
                    post about a year of showing up is yours forever, and a post with a number from
                    your chart in it is a disclosure you can&rsquo;t take back.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSharing(null)}>
                  Close
                </Button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,20rem)_1fr]">
                {/* Image-shaped on purpose — 4:5 is what a story crop expects. */}
                <div
                  className={cn(
                    "relative flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-panel p-6",
                    "border border-gold-400/30 bg-gradient-to-br from-gold-500/25 via-ink-900 to-ink-950",
                  )}
                >
                  <Award className="h-6 w-6 text-gold-300" />
                  <div>
                    <p className="font-display text-title font-semibold leading-tight tracking-tight text-ink-50">
                      {card.headline}
                    </p>
                    <p className="mt-2 text-detail text-ink-300">{card.subline}</p>
                  </div>
                  <p className="stat-mono text-micro text-ink-500">{card.footer}</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="label-eyebrow">Caption</p>
                    <p className="mt-1.5 rounded-panel bg-ink-900/60 p-3 text-detail text-ink-200">
                      {card.caption}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={copyCaption}>
                      <Copy className="h-3.5 w-3.5" />
                      Copy caption
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        toast("Nothing was posted", {
                          tone: "info",
                          desc: "Cards are yours to save and share yourself. We never post on your behalf.",
                        })
                      }
                    >
                      <Check className="h-3.5 w-3.5" />
                      Where does this go?
                    </Button>
                  </div>
                  <p className="text-micro leading-relaxed text-ink-500">
                    We don&rsquo;t post anything, anywhere, on your behalf — and we don&rsquo;t know
                    whether you share this.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}
    </div>
  );
}

export default Anniversary;
