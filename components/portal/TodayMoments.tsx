"use client";

import Link from "next/link";
import {
  MessageSquare,
  Stethoscope,
  FlaskConical,
  ClipboardList,
  Package,
  TrendingUp,
  CalendarDays,
  Repeat,
  Sunrise,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { momentsFor, isQuietDay, type Moment, type MomentIcon } from "@/lib/engage/moments";
import { Card, CardContent } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/portal/still";
import { cn, relativeDays } from "@/lib/utils";

/**
 * TODAY'S MOMENTS — the top of the member's day.
 *
 * Duolingo's owl is fake. Apex has two hooks it does not: a REAL HUMAN who
 * notices, and the member's OWN BODY CHANGING. This component's only job is to
 * make sure those two never get rendered as though they were push
 * notifications.
 *
 * Hence the one rule that shapes the whole file: a coach's message renders with
 * their NAME and their FACE, in their own words, at a readable size. A shipment
 * update renders as a small system row. They are not the same kind of event and
 * they must not look like the same kind of event — the moment a person's
 * sentence gets the same grey chip as a carrier scan, the product has told the
 * member that the person was automated too.
 *
 * Two moments, three at the outside. A list of eight is a feed, and a feed is
 * something you scroll past.
 */

const ICONS: Record<MomentIcon, LucideIcon> = {
  message: MessageSquare,
  stethoscope: Stethoscope,
  flask: FlaskConical,
  clipboard: ClipboardList,
  package: Package,
  trend: TrendingUp,
  calendar: CalendarDays,
  refill: Repeat,
  calm: Sunrise,
};

/** Which kinds are a person doing something. Everything else is a system. */
const HUMAN_KINDS = new Set<Moment["kind"]>(["coach-message", "provider-answer"]);

/** Accent per kind. Brand red is reserved for the human moments. */
const ACCENT: Record<Moment["kind"], string> = {
  "coach-message": "text-gold-300",
  "provider-answer": "text-gold-300",
  "labs-back": "text-low",
  "plan-change": "text-watch",
  "order-moving": "text-ink-300",
  milestone: "text-optimal",
  "visit-soon": "text-ink-300",
  "refill-soon": "text-watch",
  "quiet-day": "text-ink-400",
};

/**
 * The human card.
 *
 * Monogram, full name, role, and the message body set as prose rather than as a
 * notification string. The avatar is initials on a tinted disc — the staff
 * record carries `avatarInitials`, not a photograph, and inventing a stock
 * headshot for a named clinician is a worse lie than showing letters.
 */
function HumanMoment({ moment }: { moment: Moment }) {
  const Icon = ICONS[moment.icon];
  return (
    <Link href={moment.href} className="block focus-ring rounded-panel">
      <Card className="border-gold-400/25 bg-gold-400/[0.04] transition-colors hover:border-gold-400/40">
        <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold-400/30 bg-gold-400/10 font-display text-detail font-semibold text-gold-300"
            >
              {moment.from?.initials ?? <Icon className="h-5 w-5" />}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="font-display text-heading font-semibold leading-snug text-ink-50">
                  {moment.headline}
                </p>
                <span className="stat-mono text-micro text-ink-500">
                  {relativeDays(moment.at)}
                </span>
              </div>

              {moment.from && (
                <p className="mt-0.5 text-detail text-ink-400">
                  {moment.from.name} · {moment.from.role}
                </p>
              )}

              {/* Their words, set as a quote. Not a preview string. */}
              <p className="mt-3 max-w-prose border-l-2 border-gold-400/30 pl-3 text-body leading-relaxed text-ink-200">
                {moment.detail}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Everything automated. Deliberately quieter than the card above it. */
function SystemMoment({ moment }: { moment: Moment }) {
  const Icon = ICONS[moment.icon];
  return (
    <Link href={moment.href} className="block focus-ring rounded-panel">
      <Card className="transition-colors hover:border-ink-600">
        <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-800"
            >
              <Icon className={cn("h-4 w-4", ACCENT[moment.kind])} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="font-display text-body font-semibold leading-snug text-ink-50">
                  {moment.headline}
                </p>
                <span className="stat-mono text-micro text-ink-500">
                  {relativeDays(moment.at)}
                </span>
              </div>
              <p className="mt-1.5 max-w-prose text-detail leading-relaxed text-ink-400">
                {moment.detail}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * The quiet day.
 *
 * Warm, short, and honest. It points at exactly one useful thing and then stops
 * talking. A product that treats a normal Tuesday as an emergency is a product
 * that will eventually invent one.
 */
function QuietMoment({ moment }: { moment: Moment }) {
  return (
    <Link href={moment.href} className="block focus-ring rounded-panel">
      <Card className="transition-colors hover:border-ink-600">
        <CardContent className="flex items-start gap-3 p-5 sm:gap-4 sm:p-6">
          <Sunrise aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" />
          <div className="min-w-0">
            <p className="font-display text-body font-semibold text-ink-100">
              {moment.headline}
            </p>
            <p className="mt-1.5 max-w-prose text-detail leading-relaxed text-ink-400">
              {moment.detail}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Routes a moment to the presentation its source deserves. */
function MomentCard({ moment }: { moment: Moment }) {
  if (moment.kind === "quiet-day") return <QuietMoment moment={moment} />;
  if (HUMAN_KINDS.has(moment.kind)) return <HumanMoment moment={moment} />;
  return <SystemMoment moment={moment} />;
}

export function TodayMoments({
  clientId,
  nowIso,
  limit = 3,
  className,
}: {
  clientId: string;
  /** Pinned clock is the default; the prop exists for stories and tests. */
  nowIso?: string;
  /** Hard-capped at 3 regardless of what a caller asks for. */
  limit?: number;
  className?: string;
}) {
  // `Stagger` animates unconditionally, so the opt-out is decided here rather
  // than assumed of the library. Under reduced motion the same markup renders
  // in a plain grid — identical layout, no entrance.
  const reduceMotion = useReducedMotion();
  const all = momentsFor(clientId, nowIso);
  const moments = all.slice(0, Math.min(3, Math.max(1, limit)));
  if (moments.length === 0) return null;

  const quiet = isQuietDay(all);

  return (
    <section className={cn("space-y-3", className)} aria-label="New today">
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-eyebrow">{quiet ? "Today" : "New since you last looked"}</p>
        {!quiet && all.length > moments.length && (
          <span className="stat-mono text-micro text-ink-500">
            +{all.length - moments.length} more
          </span>
        )}
      </div>

      {reduceMotion ? (
        <div className="grid grid-cols-1 gap-3">
          {moments.map((m) => (
            <div key={m.id}>
              <MomentCard moment={m} />
            </div>
          ))}
        </div>
      ) : (
        <Stagger className="grid grid-cols-1 gap-3">
          {moments.map((m) => (
            <StaggerItem key={m.id}>
              <MomentCard moment={m} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </section>
  );
}
