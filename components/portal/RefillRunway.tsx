"use client";

import { useState } from "react";
import { PackageCheck, Truck, Store, AlertTriangle, Clock, Check } from "lucide-react";
import type { Client } from "@/lib/types";
import {
  REORDER_SOON_DAYS,
  formatDay,
  SHIP_TRANSIT_DAYS,
  STATUS_LABEL,
  runwayFor,
  type RunwayLine,
  type RunwayStatus,
} from "@/lib/protocol/runway";
import { appendLedger } from "@/lib/trace/ledger";
import { Card, CardContent, Badge, Button, Progress } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

/**
 * REFILL RUNWAY — "how many days have I got?"
 *
 * The member's version of the subscriptions board. Same dates, same engine,
 * different question: staff ask "what is due today", a member asks "am I about
 * to run out, and do I have to do anything about it?"
 *
 * The second half of that question matters more than the first. A countdown
 * without "this ships on its own" produces a member who orders a duplicate, or
 * who assumes it is handled when it is held. Every line here states the days
 * left AND what happens automatically.
 */

const NOW = "2026-06-12T09:00:00";

const STATUS_TONE: Record<RunwayStatus, "optimal" | "watch" | "high"> = {
  comfortable: "optimal",
  "reorder soon": "watch",
  "at risk": "high",
  out: "high",
};

const BAR_TONE: Record<RunwayStatus, "optimal" | "gold" | "high"> = {
  comfortable: "optimal",
  "reorder soon": "gold",
  "at risk": "high",
  out: "high",
};

/**
 * Fill is days left against one full cadence, so the bar means the same thing
 * on a 28-day item and an 84-day one: how much of this cycle is left.
 */
function fillPct(line: RunwayLine): number {
  if (line.daysLeft <= 0) return 0;
  return Math.max(2, Math.min(100, Math.round((line.daysLeft / line.cadenceDays) * 100)));
}

export function RefillRunway({ client }: { client: Client }) {
  const { toast } = useToast();
  const runway = runwayFor(client.id, NOW);
  /** Subscription ids the member has asked us to chase this session. */
  const [requested, setRequested] = useState<string[]>([]);

  function handleReorder(line: RunwayLine) {
    // This records a REQUEST, not a shipment. Saying "reordered" for something
    // a human still has to place is the kind of small overclaim that ends with
    // a member waiting on a box nobody picked.
    appendLedger({
      actorId: client.id,
      actorName: `${client.firstName} ${client.lastName}`,
      actorRole: "Client",
      action: "create",
      entity: "order",
      entityId: `reorder-${line.subscriptionId}`,
      subjectId: client.id,
      subjectName: `${client.firstName} ${client.lastName}`,
      locationId: client.locationId,
      reason: "Member requested an early refill from the portal",
      after: {
        subscriptionId: line.subscriptionId,
        sku: line.sku,
        item: line.itemName,
        daysLeft: line.daysLeft,
        scheduledFor: line.nextRefillOn,
      },
    });

    setRequested((r) => (r.includes(line.subscriptionId) ? r : [...r, line.subscriptionId]));
    toast("Reorder requested", {
      desc: `Your coach can see the request for ${line.itemName} now.`,
    });
  }

  if (runway.lines.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold text-ink-50">Refills</h2>
          <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-300">{runway.headline}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Headline ---------------------------------------------------------- */}
      <Card
        className={cn(
          runway.worst === "out" || runway.worst === "at risk"
            ? "border-high/30 bg-high/[0.05]"
            : runway.worst === "reorder soon"
              ? "border-watch/25 bg-watch/[0.04]"
              : undefined,
        )}
      >
        <CardContent className="flex items-start gap-3 p-5 sm:p-6">
          {runway.worst === "comfortable" ? (
            <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-optimal" />
          ) : (
            <AlertTriangle
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0",
                runway.worst === "reorder soon" ? "text-watch" : "text-high",
              )}
            />
          )}
          <div className="min-w-0">
            <p className="label-eyebrow">Supply</p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-100">{runway.headline}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
              Running out is the most common reason a protocol stops working, and it is almost always
              avoidable. We flag anything under {REORDER_SOON_DAYS} days, and anything under{" "}
              {SHIP_TRANSIT_DAYS} — because that is roughly how long a shipment takes to reach you.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Lines --------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4">
        {runway.lines.map((line) => {
          const asked = requested.includes(line.subscriptionId);
          return (
            <Card key={line.subscriptionId}>
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold leading-snug text-ink-50">
                      {line.itemName}
                    </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-500">
                      {line.shipping === "ship" ? (
                        <Truck className="h-3.5 w-3.5" />
                      ) : (
                        <Store className="h-3.5 w-3.5" />
                      )}
                      {line.shipping === "ship" ? "Shipped to you" : "Collected at the clinic"} · every{" "}
                      <span className="stat-mono">{line.cadenceDays}</span> days
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[line.status]}>{STATUS_LABEL[line.status]}</Badge>
                </div>

                {/* The sentence. Big, because it is the answer. */}
                <p className="stat-mono mt-4 font-display text-2xl font-semibold tracking-tight text-ink-50">
                  {line.memberLine}
                </p>

                <Progress value={fillPct(line)} tone={BAR_TONE[line.status]} className="mt-3" />

                <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-300">
                  {line.automatic}
                </p>

                {/* Facts. 2-up at 390px so neither value wraps to two lines. */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="hairline rounded-2xl bg-ink-900/50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-ink-500">Next one due</p>
                    <p className="stat-mono mt-1 text-sm text-ink-100">{formatDay(line.nextRefillOn)}</p>
                  </div>
                  <div className="hairline rounded-2xl bg-ink-900/50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-ink-500">
                      {line.shipping === "ship" ? "Expected with you" : "Ready to collect"}
                    </p>
                    <p className="stat-mono mt-1 text-sm text-ink-100">
                      {formatDay(line.expectedArrivalOn)}
                    </p>
                  </div>
                </div>

                {line.held && (
                  <p className="mt-3 flex items-start gap-2 rounded-2xl border border-high/25 bg-high/5 p-3 text-[13px] leading-relaxed text-ink-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-high" />
                    <span>{line.held.reason}</span>
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {asked ? (
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-optimal">
                      <Check className="h-4 w-4" />
                      Requested — your coach has it
                    </span>
                  ) : (
                    <Button
                      variant={line.status === "comfortable" ? "outline" : "primary"}
                      onClick={() => handleReorder(line)}
                      disabled={!line.canReorder}
                    >
                      <Clock className="h-4 w-4" />
                      {line.daysLeft <= 0 ? "Chase this one" : "Reorder early"}
                    </Button>
                  )}
                  {!line.canReorder && (
                    <span className="text-[13px] text-ink-500">
                      Reordering is paused while this is on hold — a call sorts it faster than a form.
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
