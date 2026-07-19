"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Client } from "@/lib/types";
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

export interface ClientRowProps {
  client: Client;
  /** Secondary line under the name — usually the "why am I looking at this" text. */
  subtitle?: React.ReactNode;
  /** Right-hand cluster: actions, timestamps, chips. */
  right?: React.ReactNode;
  /** Wrap the identity block in a link to the client profile. */
  href?: string;
  /** Alpha Score is a lab-derived roll-up; hide it where it would be noise. */
  showScore?: boolean;
  showStatus?: boolean;
  className?: string;
  /** Rendered between the subtitle and the right cluster on wide screens. */
  meta?: React.ReactNode;
}

export function ClientRow({
  client,
  subtitle,
  right,
  href,
  showScore = true,
  showStatus = true,
  className,
  meta,
}: ClientRowProps) {
  // alphaScore() walks labs + body scans, so memoize per row rather than per render.
  const score = React.useMemo(() => (showScore ? alphaScore(client) : null), [client, showScore]);

  const identity = (
    <div className="flex min-w-0 items-center gap-3">
      <Monogram client={client} size="sm" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink-50">{clientName(client)}</span>
          {showStatus && <ClientStatusBadge status={client.status} />}
        </div>
        {subtitle && <div className="mt-0.5 truncate text-xs text-ink-400">{subtitle}</div>}
      </div>
    </div>
  );

  return (
    <div className={cn("flex items-center gap-3 px-3 py-2.5", className)}>
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

      {meta && <div className="hidden shrink-0 text-right text-xs text-ink-400 md:block">{meta}</div>}
      {score && (
        <div className="hidden shrink-0 sm:block">
          <AlphaScoreChip result={score} />
        </div>
      )}
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}
