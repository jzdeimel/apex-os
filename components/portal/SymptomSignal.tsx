"use client";

import * as React from "react";
import Link from "next/link";
import { Link2, NotebookPen, Send, Check } from "lucide-react";
import type { Client } from "@/lib/types";
import {
  MIN_ENTRIES,
  SIGNAL_DISCLAIMER,
  flagForProviderEvent,
  symptomSignals,
  type SymptomSignal as Signal,
} from "@/lib/member/symptomSignal";
import { appendLedger } from "@/lib/trace/ledger";
import { Card, CardContent, Button, Progress } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

/**
 * SYMPTOM ↔ LAB — "what you logged, and the number that sits next to it".
 *
 * ══ READ lib/member/symptomSignal.ts BEFORE CHANGING ANY COPY HERE ════════
 *
 * This is the most dangerous card in the member portal, for the same reason it
 * is the most valuable: it puts a symptom and a lab value on one line, and a
 * member will read a causal claim into that arrangement unless the screen works
 * hard to prevent it. Everything below is shaped by that.
 *
 *  - `SIGNAL_DISCLAIMER` renders ABOVE the cards, at body size, in full. Not a
 *    tooltip, not a footnote, not behind an info icon.
 *  - NEUTRAL STYLING THROUGHOUT. No red, no amber, no severity ordering that
 *    could be mistaken for a clinical grade, and no colour that varies with a
 *    value. Colour applied to a number is a verdict about that number.
 *  - THE NUMBER IS NOT GRADED. Value, unit, the lab's own printed range and the
 *    date. No status word, no band, no arrow, no "within range" chip.
 *  - THE HEDGE AND THE HAND-OFF ARE ON EVERY CARD, not on the section. A member
 *    screenshots one card, not a page.
 *  - THE PRIMARY ACTION ROUTES TO A HUMAN. "Send this to my provider" is the
 *    only button, because the module's refusal to interpret is only defensible
 *    if there is a one-tap way to reach someone who can.
 *
 * The "not enough yet" state is a first-class render rather than a null return:
 * a member who is three days short of the floor should be told they are three
 * days short, which is the most motivating thing this feature can honestly say.
 */
export function SymptomSignal({ client }: { client: Client }) {
  const result = symptomSignals(client);
  const { toast } = useToast();
  /** Signal ids the member has routed to their provider this session. */
  const [sent, setSent] = React.useState<string[]>([]);

  function handleSend(signal: Signal) {
    appendLedger(flagForProviderEvent(client, signal));
    setSent((s) => (s.includes(signal.id) ? s : [...s, signal.id]));
    toast("Sent to your provider", {
      desc: `Your ${signal.label.toLowerCase()} log and the related results are on their list for your next visit.`,
    });
  }

  // ── Not enough logged yet ───────────────────────────────────────────────
  if (!result.ok && result.reason === "not-enough-entries") {
    const pct = Math.round((result.daysLogged / MIN_ENTRIES) * 100);
    return (
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <NotebookPen className="h-5 w-5 text-ink-400" />
            <h2 className="font-display text-lg font-semibold text-ink-50 sm:text-xl">
              Not enough yet
            </h2>
          </div>
          <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-300">
            {result.message}
          </p>
          <div className="mt-4 max-w-sm">
            <Progress value={pct} tone="gold" />
            <p className="mt-2 text-[12px] text-ink-500">
              <span className="stat-mono text-ink-300">{result.daysLogged}</span> of{" "}
              <span className="stat-mono text-ink-300">{MIN_ENTRIES}</span> days
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Logged plenty, nothing to raise / no panel on file ──────────────────
  if (!result.ok) {
    return (
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-ink-400" />
            <h2 className="font-display text-lg font-semibold text-ink-50 sm:text-xl">
              Nothing to line up this month
            </h2>
          </div>
          <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-300">
            {result.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── The pairings ────────────────────────────────────────────────────────
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-ink-400" />
          <h2 className="font-display text-lg font-semibold text-ink-50 sm:text-xl">
            What you logged, and what&rsquo;s on your panel
          </h2>
        </div>

        {/* The disclaimer, at body size, above everything. Not collapsible. */}
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-400">
          {SIGNAL_DISCLAIMER}
        </p>

        <div className="mt-5 space-y-3">
          {result.signals.map((s) => {
            const isSent = sent.includes(s.id);
            return (
              <div key={s.id} className="hairline rounded-2xl bg-ink-900/50 p-4 sm:p-5">
                {/* What you logged ------------------------------------------ */}
                <p className="label-eyebrow">What you logged</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-100">{s.logged}</p>

                {/* The numbers -------------------------------------------- */}
                {s.markers.length > 0 && (
                  <>
                    <p className="label-eyebrow mt-5">What&rsquo;s on your panel</p>
                    {/* One column at 390px, two from sm. Three lab values in a
                        row on a phone wraps the unit onto its own line and the
                        range onto a third. */}
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {s.markers.map((m) => (
                        <div key={m.key} className="hairline min-w-0 rounded-xl bg-ink-950/40 p-3.5">
                          <p className="truncate text-[12px] text-ink-400">{m.name}</p>
                          {/* Deliberately monochrome. Colouring this by band
                              would be this component telling the member whether
                              the number is good, which is exactly the thing
                              neither it nor the module underneath may do. */}
                          <p className="stat-mono mt-1 text-xl font-semibold text-ink-50">
                            {m.value}
                            <span className="ml-1 text-[11px] font-normal text-ink-500">{m.unit}</span>
                          </p>
                          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
                            Lab&rsquo;s printed range{" "}
                            <span className="stat-mono">
                              {m.refLow}&ndash;{m.refHigh}
                            </span>{" "}
                            · {formatDate(m.resultedOn)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <p className="mt-3 text-[12px] leading-relaxed text-ink-500">{s.whyTheseMarkers}</p>

                {/* The hedge, on the card face ---------------------------- */}
                <p className="mt-3 rounded-xl border border-ink-700/60 bg-ink-950/30 p-3.5 text-[12px] leading-relaxed text-ink-400">
                  {s.notAConclusion}
                </p>

                {/* The hand-off ------------------------------------------- */}
                <p className="mt-3 text-[13px] leading-relaxed text-ink-300">{s.bringThis}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    variant={isSent ? "success" : "outline"}
                    size="sm"
                    onClick={() => handleSend(s)}
                    disabled={isSent}
                  >
                    {isSent ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                    {isSent ? "On your provider's list" : "Send this to my provider"}
                  </Button>
                  <Link
                    href="/portal/labs"
                    className="focus-ring rounded-md px-1 text-[12px] text-ink-500 hover:text-ink-200"
                  >
                    See the full panel
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[12px] leading-relaxed text-ink-500">
          Only the two things you logged most often show up here. A longer list would be a longer
          list of things to worry about, and the third-most-common one is never the one worth your
          provider&rsquo;s time.
        </p>
      </CardContent>
    </Card>
  );
}
