"use client";

/**
 * Refer a friend — the member's own view of who they've sent us.
 *
 * Tone rule for this component: warm, not salesy. The member is a patient
 * first. Nothing here counts down, nothing nags, nothing implies they owe us
 * introductions, and the reward rules are stated in full on screen rather than
 * hidden behind "terms apply" — a clinic that is coy about money with the
 * people it takes blood from has already lost the plot.
 *
 * Every row renders through `refereeLabel` / `referralStatusLine`. Those two
 * functions are the privacy boundary; this component never reads
 * `refereeName` directly.
 */

import * as React from "react";
import { Check, Copy, Gift, Link2, Share2 } from "lucide-react";

import { Card, CardContent, Badge, Button, Progress, EmptyState } from "@/components/ui/primitives";
import { Stagger, StaggerItem, FadeIn } from "@/components/portal/still";
import { useToast } from "@/components/ui/Toast";
import { cn, currency, formatDate } from "@/lib/utils";
import { ME } from "@/components/portal/PortalHeader";
import {
  REWARD_RULES,
  REFERRER_REWARD_CENTS,
  REFEREE_REWARD_CENTS,
  earningsFor,
  funnelFor,
  referralCodeFor,
  referralLinkFor,
  referralsFor,
  refereeLabel,
  referralStatusLine,
  stageRank,
} from "@/lib/growth/referrals";

const dollars = (cents: number) => currency(cents / 100);

export function ReferAFriend({ clientId = ME }: { clientId?: string }) {
  const { toast } = useToast();

  const code = referralCodeFor(clientId);
  const link = referralLinkFor(clientId);
  const rows = referralsFor(clientId);
  const funnel = funnelFor(clientId);
  const earnings = earningsFor(clientId);

  const [copied, setCopied] = React.useState<"code" | "link" | null>(null);

  async function copy(what: "code" | "link") {
    const text = what === "code" ? code : link;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard is permission-gated and refuses in plenty of real contexts.
      // The code is on screen in full either way, so a failure here is a
      // non-event — we just don't claim success we didn't get.
      toast("Couldn't copy automatically", { tone: "warn", desc: text });
      return;
    }
    setCopied(what);
    toast(what === "code" ? "Code copied" : "Link copied", { desc: text });
  }

  /**
   * Native share sheet where the browser has one — on a phone this is the
   * difference between a share affordance and a decoration. Falls back to copy.
   */
  async function share() {
    const payload = {
      title: "Alpha Health",
      text: `Use my code ${code} and you'll get ${dollars(REFEREE_REWARD_CENTS)} off your first visit at Alpha Health.`,
      url: `https://${link}`,
    };
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share(payload);
        return;
      } catch {
        // User dismissed the sheet, or the browser refused. Fall through.
      }
    }
    await copy("link");
  }

  const sent = funnel[0]?.count ?? 0;

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/* The code. One job, big, first.                                   */}
      {/* ---------------------------------------------------------------- */}
      <FadeIn>
        <div className="relative overflow-hidden rounded-panel border border-gold-400/25 bg-gradient-to-br from-gold-500/12 via-gold-500/[0.04] to-transparent px-5 py-7 sm:px-8 sm:py-9">
          <p className="label-eyebrow">Your code</p>
          <p className="stat-mono mt-3 break-all text-display font-semibold tracking-tight text-ink-50 sm:text-display">
            {code}
          </p>
          <p className="mt-3 max-w-prose text-body leading-relaxed text-ink-300">
            Give it to anyone you think we could actually help. They get{" "}
            <span className="stat-mono text-ink-100">{dollars(REFEREE_REWARD_CENTS)}</span> off their
            first visit, you get{" "}
            <span className="stat-mono text-ink-100">{dollars(REFERRER_REWARD_CENTS)}</span> in
            credit when they join.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button variant="primary" size="md" onClick={share}>
              <Share2 className="h-4 w-4" />
              Share
            </Button>
            <Button variant="outline" size="md" onClick={() => copy("code")}>
              {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy code
            </Button>
            <Button variant="ghost" size="md" onClick={() => copy("link")}>
              <Link2 className="h-4 w-4" />
              <span className="stat-mono text-micro">{link}</span>
            </Button>
          </div>
        </div>
      </FadeIn>

      {/* ---------------------------------------------------------------- */}
      {/* Credit + funnel                                                  */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-panel bg-gold-400/15 text-gold-300">
                <Gift className="h-4 w-4" />
              </span>
              <h2 className="font-display text-heading font-semibold text-ink-50">Your credit</h2>
            </div>

            <p className="stat-mono mt-4 text-display font-semibold text-ink-50">
              {dollars(earnings.earnedCents)}
            </p>
            <p className="mt-1 text-detail text-ink-400">applied to your account</p>

            {earnings.pendingCents > 0 && (
              <p className="mt-3 rounded-panel border border-gold-400/20 bg-gold-400/[0.06] p-3 text-detail leading-relaxed text-ink-300">
                <span className="stat-mono text-gold-300">{dollars(earnings.pendingCents)}</span> more
                is on its way — someone you invited has joined and we&rsquo;re applying it at your next
                bill. You don&rsquo;t need to do anything.
              </p>
            )}

            <div className="mt-5 space-y-2">
              <p className="label-eyebrow">How it works</p>
              <ul className="space-y-1.5">
                {REWARD_RULES.map((rule) => (
                  <li key={rule} className="flex gap-2 text-detail leading-relaxed text-ink-400">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-600" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-5 sm:p-6">
            <h2 className="font-display text-heading font-semibold text-ink-50">Where your invites got to</h2>
            <p className="mt-1 text-detail text-ink-400">
              {sent === 0
                ? "Nothing sent yet — this fills in on its own once you share your code."
                : "Yours only. We don't show you anything about their care, and we never will."}
            </p>

            <div className="mt-5 space-y-3">
              {funnel.map((stage) => (
                <div key={stage.stage}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-detail text-ink-300">{stage.label}</span>
                    <span className="stat-mono text-detail text-ink-100">{stage.count}</span>
                  </div>
                  <Progress
                    className="mt-1.5"
                    tone={stage.stage === "Rewarded" ? "optimal" : "gold"}
                    value={sent === 0 ? 0 : (stage.count / sent) * 100}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* The rows                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="font-display text-heading font-semibold text-ink-50">Everyone you&rsquo;ve invited</h2>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Share2 className="h-6 w-6" />}
            title="No invites yet"
            hint={`Share your code and they'll get ${dollars(REFEREE_REWARD_CENTS)} off their first visit.`}
          />
        ) : (
          <Stagger className="space-y-2">
            {rows.map((r) => {
              const joined = stageRank(r.status) >= stageRank("Joined");
              return (
                <StaggerItem key={r.id}>
                  <Card className={cn(joined && "border-optimal/25")}>
                    <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* refereeLabel is the only path to a name. */}
                          <p className="truncate text-detail font-medium text-ink-50">{refereeLabel(r)}</p>
                          <Badge tone={joined ? "optimal" : "neutral"}>{r.status}</Badge>
                        </div>
                        <p className="mt-1 text-detail leading-relaxed text-ink-400">
                          {referralStatusLine(r)}
                        </p>
                      </div>
                      <div className="shrink-0 text-left sm:text-right">
                        <p className="stat-mono text-detail text-ink-100">
                          {r.rewardCents ? dollars(r.rewardCents) : "—"}
                        </p>
                        <p className="stat-mono text-micro text-ink-500">
                          shared {formatDate(r.sharedAt.slice(0, 10))}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
              );
            })}
          </Stagger>
        )}

        <p className="max-w-prose text-micro leading-relaxed text-ink-500">
          Some of these say &ldquo;someone you invited&rdquo; rather than a name. That&rsquo;s because
          they asked us not to say — whether a person is a patient here is theirs to tell, not ours.
          Your credit isn&rsquo;t affected either way.
        </p>
      </section>
    </div>
  );
}

export default ReferAFriend;
