"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Client } from "@/lib/types";
import type { AlphaScoreResult } from "@/lib/alphaScore";
import { clientName } from "@/lib/mock/clients";
import { alphaScore } from "@/lib/alphaScore";
import { Monogram } from "@/components/Monogram";
import { AlphaScoreChip } from "@/components/AlphaScoreRing";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * ClientRow — the one dense client row shared by Today and the Roster.
 *
 * Deliberately NOT a card. A coach working a queue is scanning a list, and
 * every pixel of card chrome is a pixel of name/status they cannot see. The
 * system we are replacing renders each client as a tile, which is why a book
 * of forty people takes four screens.
 *
 * The row is built to answer four questions without a click:
 *   who        — monogram + name + status
 *   why now    — `subtitle` (the action) and `note` (the signal behind it)
 *   how long   — `lastTouchDays`, its own fixed column so the eye can run down it
 *   what to do — `right`, exactly one primary control
 *
 * It renders standalone (Today) and inside a table cell (Roster), which is why
 * every visual affordance is opt-out rather than baked in.
 */

const STATUS_TONE: Record<Client["status"], React.ComponentProps<typeof Badge>["tone"]> = {
  Lead: "neutral",
  "Consult Booked": "info",
  "Labs Ordered": "info",
  "Results Ready": "high",
  "Plan Review": "watch",
  "Active Protocol": "optimal",
  "Follow-Up Due": "watch",
  Inactive: "neutral",
};

export function ClientStatusBadge({ status }: { status: Client["status"] }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

/**
 * Silence ages into a colour. 21d is the STALE_TOUCH_DAYS threshold the queue
 * uses, so the two surfaces agree on what "too long" means.
 */
function touchTone(days: number): string {
  if (days >= 21) return "text-high";
  if (days >= 10) return "text-watch";
  return "text-ink-400";
}

export interface ClientRowProps {
  client: Client;
  /** Secondary line under the name — usually the "what to do" text. */
  subtitle?: React.ReactNode;
  /** Third line: the signal that surfaced this row. Provenance, not a vibe. */
  note?: React.ReactNode;
  /** Right-hand cluster: actions, timestamps, chips. */
  right?: React.ReactNode;
  /** Wrap the identity block in a link to the client profile. */
  href?: string;
  /** Alpha Score is a lab-derived roll-up; hide it where it would be noise. */
  showScore?: boolean;
  showStatus?: boolean;
  /** Pass a precomputed score to skip the per-row labs walk (roster does this). */
  score?: AlphaScoreResult | null;
  /** Days since last human contact — rendered as its own scannable column. */
  lastTouchDays?: number;
  /** Keyboard/pointer focus. The caller owns focus state; the row only paints it. */
  selected?: boolean;
  /** Drop the row's own padding when the parent already provides it (table cells). */
  bare?: boolean;
  className?: string;
  /** Rendered between the subtitle and the right cluster on wide screens. */
  meta?: React.ReactNode;
}

export function ClientRow({
  client,
  subtitle,
  note,
  right,
  href,
  showScore = true,
  showStatus = true,
  score,
  lastTouchDays,
  selected = false,
  bare = false,
  className,
  meta,
}: ClientRowProps) {
  // alphaScore() walks labs + body scans, so memoize per row rather than per
  // render — and skip it entirely when the caller already did the work.
  const resolvedScore = React.useMemo(() => {
    if (!showScore) return null;
    return score ?? alphaScore(client);
  }, [client, showScore, score]);

  const identity = (
    <div className="flex min-w-0 items-center gap-2.5">
      <Monogram client={client} size="sm" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-detail font-medium leading-tight text-ink-50">
            {clientName(client)}
          </span>
          {showStatus && <ClientStatusBadge status={client.status} />}
        </div>
        {subtitle && (
          <div className="mt-0.5 truncate text-micro leading-tight text-ink-300">{subtitle}</div>
        )}
        {/* The why-line. Dimmer than the action on purpose: the coach reads the
            verb first and only drops to the evidence when they doubt it. */}
        {note && (
          <div className="mt-0.5 truncate text-micro leading-tight text-ink-500">{note}</div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "flex items-center gap-2.5",
        !bare && "px-3 py-2",
        // Left rule rather than a full ring: inside a queue card the card already
        // owns the ring, and two nested rings read as an error state.
        selected && "border-l-2 border-watch bg-watch/[0.04] pl-[10px]",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {href ? (
          <Link href={href} className="group block rounded-lg focus-ring">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">{identity}</div>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-600 transition-colors group-hover:text-ink-300" />
            </div>
          </Link>
        ) : (
          identity
        )}
      </div>

      {/* Age of silence survives every breakpoint — it is half the reason the
          row exists, so it never gets hidden behind a media query. */}
      {lastTouchDays !== undefined && (
        <div className="shrink-0 text-right">
          <span className={cn("stat-mono text-detail", touchTone(lastTouchDays))}>
            {lastTouchDays}d
          </span>
          <span className="block text-micro leading-tight text-ink-600">quiet</span>
        </div>
      )}

      {meta && <div className="hidden shrink-0 text-right text-detail text-ink-400 md:block">{meta}</div>}
      {resolvedScore && (
        <div className="hidden shrink-0 sm:block">
          <AlphaScoreChip result={resolvedScore} />
        </div>
      )}
      {right && <div className="flex shrink-0 items-center gap-1.5">{right}</div>}
    </div>
  );
}
