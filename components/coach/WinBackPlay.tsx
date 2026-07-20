"use client";

/**
 * The win-back play, rendered for a coach.
 *
 * The layout carries an argument: EVIDENCE SITS NEXT TO THE CLAIM, not behind a
 * disclosure. A coach who can only see the script will read the script. A coach
 * who can see that the "they left over cost" hypothesis rests on one failed card
 * charge will say something truer on the phone.
 *
 * So the opening line is offered as a draft the coach is expected to edit — it
 * is selectable text in a panel, not a "Send" button. There is no automated
 * send anywhere on this surface, deliberately: the entire failure this feature
 * replaces was automation that sent everyone the same sentence.
 */

import * as React from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  FileSearch,
  Quote,
  Tag,
  Trophy,
  X,
} from "lucide-react";

import { Card, CardContent, Badge, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { cn, currency, formatDate } from "@/lib/utils";
import { shortHash } from "@/lib/trace/hash";
import { locationName } from "@/lib/mock/locations";
import { buildPlay, recordPlayAction, type Evidence, type LapsedMember } from "@/lib/growth/winback";

const KIND_COPY: Record<LapsedMember["kind"], string> = {
  "billing-lapsed": "Billing lapsed",
  "went-cold": "Went quiet",
  "never-started": "Never started",
  paused: "Paused",
};

export function WinBackPlay({
  record,
  actor,
  onActed,
}: {
  record: LapsedMember;
  actor: { id: string; name: string; role: string };
  onActed?: (clientId: string) => void;
}) {
  const { toast } = useToast();
  const client = record.client;

  // Rebuilt from the record on every render. Pure and deterministic, so there
  // is no stale-play problem and nothing to invalidate.
  const play = React.useMemo(() => buildPlay(client), [client]);

  const [acted, setActed] = React.useState<"logged-outreach" | "dismissed" | null>(null);

  function act(action: "logged-outreach" | "dismissed") {
    const row = recordPlayAction(play, action, actor);
    setActed(action);
    onActed?.(client.id);
    toast(
      action === "logged-outreach" ? `Outreach logged for ${client.firstName}` : "Play dismissed",
      { desc: `Ledger ${row.id} · ${shortHash(row.hash)}`, tone: action === "dismissed" ? "info" : "success" },
    );
  }

  async function copyOpening() {
    try {
      await navigator.clipboard.writeText(play.openingLine);
      toast("Opening line copied", { desc: "Edit it. It's a draft, not a script." });
    } catch {
      toast("Couldn't copy automatically", { tone: "warn", desc: "Select the text and copy it." });
    }
  }

  return (
      <Card className={cn(acted && "opacity-60")}>
        <CardContent className="space-y-5 p-5 sm:p-6">
          {/* -------------------------------------------------------------- */}
          {/* Who, and how gone                                              */}
          {/* -------------------------------------------------------------- */}
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-heading font-semibold text-ink-50">{play.clientName}</h3>
                <Badge tone={record.kind === "billing-lapsed" ? "high" : "watch"}>
                  {KIND_COPY[record.kind]}
                </Badge>
                {acted && <Badge tone="optimal">{acted === "dismissed" ? "Dismissed" : "Logged"}</Badge>}
              </div>
              <p className="mt-1 text-body text-ink-400">{record.trigger}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-ink-500">
                <span className="stat-mono">{locationName(client.locationId)}</span>
                <span className="stat-mono">{currency(record.lifetimeValue)} lifetime</span>
                <span className="stat-mono">{record.tenureMonths} months tenure</span>
                <span className="stat-mono">
                  {Number.isFinite(record.daysDark) ? `${record.daysDark}d dark` : "never contacted"}
                </span>
              </div>
            </div>

            <div className="shrink-0 text-left sm:text-right">
              <p className="label-eyebrow">Winnability</p>
              <p
                className={cn(
                  "stat-mono text-title font-semibold",
                  play.winnability >= 60
                    ? "text-optimal"
                    : play.winnability >= 40
                      ? "text-watch"
                      : "text-ink-400",
                )}
              >
                {play.winnability}
              </p>
            </div>
          </header>

          {/* -------------------------------------------------------------- */}
          {/* What they got out of us — their own measured numbers            */}
          {/* -------------------------------------------------------------- */}
          {play.achievements.length > 0 && (
            <section>
              <div className="flex items-center gap-2">
                <Trophy className="h-3.5 w-3.5 text-optimal" />
                <p className="label-eyebrow">What they achieved here</p>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {play.achievements.map((a) => (
                  <div key={a.headline} className="hairline rounded-xl bg-ink-900/50 p-3">
                    <p className="text-body font-medium text-ink-50">{a.headline}</p>
                    <Cite e={a.evidence} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* -------------------------------------------------------------- */}
          {/* Hypotheses, labelled as such                                    */}
          {/* -------------------------------------------------------------- */}
          <section>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-watch" />
              <p className="label-eyebrow">Why they might have gone — unconfirmed</p>
            </div>
            <div className="mt-2 space-y-2">
              {play.likelyReasons.map((r) => (
                <div key={r.hypothesis} className="rounded-xl border border-watch/20 bg-watch/[0.04] p-3">
                  <p className="text-body leading-relaxed text-ink-100">{r.hypothesis}</p>
                  {r.evidence.map((e) => (
                    <Cite key={`${e.source}:${e.claim}`} e={e} />
                  ))}
                </div>
              ))}
            </div>
            <p className="mt-2 text-micro leading-relaxed text-ink-500">
              None of this is confirmed. Ask them; whatever they say is worth more than the whole
              panel above.
            </p>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* The draft opening                                               */}
          {/* -------------------------------------------------------------- */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Quote className="h-3.5 w-3.5 text-gold-300" />
                <p className="label-eyebrow">An opening — yours to change</p>
              </div>
              <Button variant="ghost" size="sm" onClick={copyOpening}>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
            <p className="mt-2 select-text rounded-xl border border-gold-400/20 bg-gold-400/[0.05] p-4 text-body leading-relaxed text-ink-100">
              {play.openingLine}
            </p>
            <p className="mt-2 text-micro text-ink-500">
              Every fact in that line is in the record above and the member can check all of it in
              their own portal.
            </p>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* The offer                                                       */}
          {/* -------------------------------------------------------------- */}
          <section>
            <div className="flex items-center gap-2">
              <Tag className="h-3.5 w-3.5 text-ink-400" />
              <p className="label-eyebrow">Offer that fits</p>
            </div>
            <div className="mt-2 hairline rounded-xl bg-ink-900/50 p-4">
              <p className="text-body font-medium text-ink-50">{play.offer.title}</p>
              <p className="mt-1 text-detail leading-relaxed text-ink-400">{play.offer.detail}</p>
              <Cite e={play.offer.evidence} />
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* Sources                                                         */}
          {/* -------------------------------------------------------------- */}
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-micro text-ink-500 hover:text-ink-300">
              <FileSearch className="h-3.5 w-3.5" />
              Everything this play read ({play.evidence.length} records)
            </summary>
            <div className="mt-2 space-y-1.5">
              {play.evidence.map((e) => (
                <div key={`${e.source}:${e.claim}`} className="flex flex-wrap gap-x-2 text-micro">
                  <span className="shrink-0 text-ink-500">{e.source}</span>
                  <span className="text-ink-300">{e.claim}</span>
                  {e.recordedOn && (
                    <span className="stat-mono text-ink-600">{formatDate(e.recordedOn)}</span>
                  )}
                </div>
              ))}
            </div>
          </details>

          {/* -------------------------------------------------------------- */}
          {/* Actions — both write to the ledger                              */}
          {/* -------------------------------------------------------------- */}
          <div className="flex flex-wrap items-center gap-2 border-t border-ink-800 pt-4">
            <Button variant="primary" size="sm" disabled={acted !== null} onClick={() => act("logged-outreach")}>
              <Check className="h-3.5 w-3.5" />
              Log the outreach
            </Button>
            <Button variant="ghost" size="sm" disabled={acted !== null} onClick={() => act("dismissed")}>
              <X className="h-3.5 w-3.5" />
              Not appropriate
            </Button>
            <span className="text-micro text-ink-500">
              Both write an audit row. A member asking who looked at their file gets the whole
              answer, including this.
            </span>
          </div>
        </CardContent>
      </Card>
  );
}

/** A citation line. Same shape everywhere so a claim without one is obvious. */
function Cite({ e }: { e: Evidence }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-micro leading-relaxed text-ink-500">
      <span className="shrink-0 rounded bg-ink-800 px-1.5 py-0.5 text-micro text-ink-400">
        {e.source}
      </span>
      <span>{e.claim}</span>
      {e.recordedOn && <span className="stat-mono text-ink-600">{formatDate(e.recordedOn)}</span>}
    </p>
  );
}

export default WinBackPlay;
