"use client";

import { motion } from "framer-motion";
import { Swords, Flame, Clock, HandHeart, Check, UserPlus } from "lucide-react";
import { Card, CardContent, Badge, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useBuddy } from "@/lib/community/buddies";

/**
 * The battle-buddy card.
 *
 * Two states: not yet matched (one tap to get a partner) and matched (their
 * momentum, and the nudge). Deliberately warm, not competitive — a buddy is
 * someone in your corner, not someone you are beating. The nudge is the whole
 * point: the one moment a health app can actually move a person is when their
 * partner, not the software, reaches out.
 */
export function BattleBuddy({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const { buddy, accepted, nudgedToday, hydrated, accept, nudge } = useBuddy(clientId);

  if (!buddy) return null;

  if (!hydrated) {
    return <div className="h-40 animate-pulse rounded-panel border border-ink-800 bg-ink-900/40" />;
  }

  if (!accepted) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gold-500/15 text-gold-300">
            <Swords className="h-5 w-5" />
          </span>
          <h3 className="text-heading text-ink-50">Get a battle buddy</h3>
          <p className="max-w-md text-detail leading-relaxed text-ink-400">
            One other member on a path like yours. You&apos;ll see each other&apos;s momentum and can
            send a nudge when one of you goes quiet — because the thing that actually keeps people
            going is another person noticing.
          </p>
          <Button variant="primary" onClick={() => { accept(); toast("Matched", { desc: `You're paired with ${buddy.handle}` }); }}>
            <UserPlus className="h-4 w-4" /> Match me with {buddy.handle}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-micro uppercase tracking-[0.14em] text-ink-500">
          <Swords className="h-3.5 w-3.5 text-gold-400" /> Your battle buddy
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-title font-semibold tracking-tight text-ink-50">{buddy.handle}</p>
            <p className="mt-0.5 text-detail text-ink-500">
              Level {buddy.level} · {buddy.title} · {buddy.sharedFocus}
            </p>
          </div>
          <Badge tone={buddy.needsNudge ? "watch" : "optimal"}>
            {buddy.needsNudge ? "Gone quiet" : "On a roll"}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-control border border-ink-800 bg-ink-900/40 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-micro uppercase tracking-wide text-ink-500">
              <Flame className="h-3.5 w-3.5 text-gold-400" /> Streak
            </p>
            <p className="stat-mono mt-0.5 text-heading text-ink-50">{buddy.streak}d</p>
          </div>
          <div className="rounded-control border border-ink-800 bg-ink-900/40 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-micro uppercase tracking-wide text-ink-500">
              <Clock className="h-3.5 w-3.5" /> Last active
            </p>
            <p className="stat-mono mt-0.5 text-heading text-ink-50">
              {buddy.lastActiveDays === 0 ? "Today" : `${buddy.lastActiveDays}d ago`}
            </p>
          </div>
        </div>

        <div className="mt-4">
          {nudgedToday ? (
            <p className="flex items-center justify-center gap-1.5 rounded-control border border-emerald/25 bg-emerald/5 px-3 py-2.5 text-detail text-emerald">
              <Check className="h-4 w-4" /> Nudge sent — {buddy.handle} will see it
            </p>
          ) : (
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button
                variant={buddy.needsNudge ? "primary" : "outline"}
                className="w-full"
                onClick={() => { nudge(); toast("Nudge sent", { desc: `You've got ${buddy.handle}'s back` }); }}
              >
                <HandHeart className="h-4 w-4" />
                {buddy.needsNudge ? `Nudge ${buddy.handle} — they've gone quiet` : `Send ${buddy.handle} some encouragement`}
              </Button>
            </motion.div>
          )}
          <p className="mt-2 text-center text-micro text-ink-600">
            One nudge a day. It&apos;s a tap on the shoulder, not a whistle.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
