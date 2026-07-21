"use client";

import { useState } from "react";
import { Check, Crown, ArrowRight, ShieldCheck } from "lucide-react";
import { Card, CardContent, Badge, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { TIER_PRICE, TIER_BENEFITS, membershipForClient } from "@/lib/mock/memberships";
import type { MembershipTier } from "@/lib/types";
import { cn } from "@/lib/utils";

// The ladder, cheapest to richest — the insertion order of the price table.
const MEMBERSHIP_TIERS = Object.keys(TIER_PRICE) as MembershipTier[];

/**
 * Membership tiers — compare, and (in the demo) request an upgrade.
 *
 * The clinic sells membership, so the member should be able to see the whole
 * ladder, what each rung includes, and where they sit — not just their own line
 * on a bill. Prices and benefits come straight from lib/mock/memberships so this
 * can never drift from what billing charges. HSA/FSA eligibility is stated
 * because the clinic advertises it and it changes the real cost of a rung.
 *
 * Upgrading is demo-shaped: it records the intent and toasts. In production this
 * is the point where the payment processor and a plan change take over — the
 * seam is here, not faked into a "success".
 */
export function MembershipTiers({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const current = membershipForClient(clientId)?.tier ?? "Single Visit";
  const [requested, setRequested] = useState<MembershipTier | null>(null);

  const rank = (t: MembershipTier) => MEMBERSHIP_TIERS.indexOf(t);

  return (
    <section className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800/70 px-5 py-4">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-gold-400" aria-hidden />
          <h2 className="text-heading text-ink-50">Membership</h2>
        </div>
        <span className="flex items-center gap-1.5 text-micro text-emerald">
          <ShieldCheck className="h-3.5 w-3.5" /> HSA / FSA eligible
        </span>
      </header>

      <div className="grid gap-3 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
        {MEMBERSHIP_TIERS.map((tier) => {
          const isCurrent = tier === current;
          const isUpgrade = rank(tier) > rank(current);
          const price = TIER_PRICE[tier];
          return (
            <Card key={tier} className={cn("flex flex-col", isCurrent && "border-gold-400/40")}>
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-body font-semibold text-ink-50">{tier}</p>
                    <p className="stat-mono mt-0.5 text-title font-semibold text-ink-50">
                      {price === 0 ? "Pay per visit" : `$${price}`}
                      {price > 0 && <span className="text-micro text-ink-500">/mo</span>}
                    </p>
                  </div>
                  {isCurrent && <Badge tone="gold">Current</Badge>}
                </div>

                <ul className="flex-1 space-y-1.5">
                  {TIER_BENEFITS[tier].map((b) => (
                    <li key={b} className="flex gap-2 text-micro leading-relaxed text-ink-300">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald" />
                      {b}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="rounded-control border border-gold-400/20 bg-gold-400/5 px-3 py-2 text-center text-micro text-gold-200">
                    Your plan
                  </div>
                ) : isUpgrade ? (
                  <Button
                    size="sm"
                    variant={requested === tier ? "success" : "primary"}
                    onClick={() => {
                      setRequested(tier);
                      toast(`Upgrade to ${tier} requested`, { desc: "The front desk will confirm and set up billing." });
                    }}
                  >
                    {requested === tier ? <><Check className="h-3.5 w-3.5" /> Requested</> : <>Upgrade <ArrowRight className="h-3.5 w-3.5" /></>}
                  </Button>
                ) : (
                  <div className="text-center text-micro text-ink-600">Lower tier</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="border-t border-ink-800/70 px-5 py-3 text-micro leading-relaxed text-ink-600">
        Prices and inclusions are the clinic&apos;s real tiers. Membership dues and most clinical
        services are typically HSA/FSA eligible — keep your receipts (they&apos;re in your vault).
        Demo build: upgrading records the request; billing is set up with the front desk.
      </p>
    </section>
  );
}
