"use client";

import * as React from "react";
import {
  Target,
  MessageCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Info,
  Copy,
  Check,
} from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { SourceChip, SourceChips } from "@/components/coach/SourceChip";
import { SinceLastVisitCard } from "@/components/coach/SinceLastVisitCard";
import { consultPrep, unkeptCount, type OpenLoop, type LoopVerdict } from "@/lib/coach/consultPrep";
import { staffMap, staffName } from "@/lib/mock/staff";
import { getClient } from "@/lib/mock/clients";
import { appendLedger } from "@/lib/trace/ledger";
import { cn, formatDate } from "@/lib/utils";

/**
 * The 60-second consult prep brief.
 *
 * ── Reading order is the design ───────────────────────────────────────────
 * Top to bottom: the one thing to raise, an opener, then the loops from last
 * time, then the diff. That is descending order of "what breaks if the coach
 * reads no further" — a brief whose most important line is fourth is a brief
 * that gets skimmed to the second.
 *
 * ── Every claim wears its source ──────────────────────────────────────────
 * Each assertion is followed by a chip the coach can open to see the record and,
 * where one exists, the verbatim text. Where the engine could not verify a
 * commitment, the row says so in the same visual language as a verified one —
 * an unknown is displayed, never hidden. See the `no evidence` verdict styling
 * below: it is deliberately not red. "We cannot check this" is not a failure by
 * the member, and colouring it like one would put a coach on the offensive over
 * a gap in the software.
 *
 * ── Why opening the brief writes to the ledger ────────────────────────────
 * A brief compiles a member's journal, labs, orders, adherence and consult
 * history into one screen. That is the same class of event as the handoff
 * packet in lib/handoff/packet.ts: a bulk read of PHI outside the normal
 * per-chart path. `view` is a first-class ledger action in this system
 * precisely so reads like this leave a trace.
 *
 * The row is appended on the coach's EXPLICIT expansion, never on render.
 * Writing during render would fire on every server pass, log views nobody
 * performed, and — because `appendLedger` mutates a module-level array — make
 * the server and client trees disagree. An audit log that records phantom
 * access is worse than none: it destroys the credibility of the real rows.
 */

const VERDICT_META: Record<
  LoopVerdict,
  { label: string; icon: React.ElementType; tone: "optimal" | "high" | "neutral"; cls: string }
> = {
  did: { label: "They did", icon: CheckCircle2, tone: "optimal", cls: "text-optimal" },
  "did not": { label: "They did not", icon: XCircle, tone: "high", cls: "text-high" },
  // Neutral on purpose — see the header note.
  "no evidence": { label: "Can't tell", icon: HelpCircle, tone: "neutral", cls: "text-ink-400" },
};

function LoopRow({ loop }: { loop: OpenLoop }) {
  const meta = VERDICT_META[loop.verdict];
  const Icon = meta.icon;

  return (
    <div className="flex min-w-0 gap-2.5 rounded-xl border border-ink-700/70 bg-ink-900/40 p-2.5">
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", meta.cls)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {/* The commitment verbatim, in quotes. The coach wrote this; seeing
              their own words is what makes the follow-up land. */}
          <p className="text-detail leading-snug text-ink-100">
            &ldquo;{loop.commitment}&rdquo;
          </p>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
        <p className="mt-1 text-detail leading-relaxed text-ink-400">{loop.verdictNote}</p>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
          <SourceChip source={loop.source} />
          {loop.evidence.length > 0 && (
            <>
              <span className="text-micro text-ink-500">evidence</span>
              <SourceChips sources={loop.evidence} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConsultPrepBrief({
  clientId,
  coachId,
  className,
}: {
  clientId: string;
  coachId: string;
  className?: string;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);
  const logged = React.useRef(false);

  const prep = React.useMemo(() => consultPrep(clientId, coachId), [clientId, coachId]);
  const unkept = unkeptCount(prep);

  /**
   * Record the compilation as a read of this member's chart.
   *
   * Guarded by a ref so a re-render (a toast, a copy click) does not append a
   * second row for one act of reading. The ledger should reflect what the coach
   * did, not how many times React reconciled.
   */
  React.useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    const client = getClient(clientId);
    const actor = staffMap[coachId];
    appendLedger({
      actorId: coachId,
      actorName: actor?.name ?? staffName(coachId),
      actorRole: actor?.role ?? "Coach",
      action: "view",
      entity: "chart",
      entityId: `prep-${clientId}`,
      subjectId: clientId,
      subjectName: prep.clientName,
      locationId: client?.locationId,
      reason: "Consult prep brief — pre-call compilation",
      after: {
        brief: "consult-prep",
        openLoops: prep.openLoops.length,
        sections: "last consult, open loops, most important, opener, changes since last visit",
      },
    });
  }, [clientId, coachId, prep.clientName, prep.openLoops.length]);

  const copyText = React.useCallback(() => {
    const lines = [
      `PREP — ${prep.clientName}`,
      prep.lastConsult
        ? `Last consult: ${prep.lastConsult.kind} ${formatDate(prep.lastConsult.at)} (${prep.lastConsult.elapsed}) — ${prep.lastConsult.headline}`
        : "Last consult: none on record.",
      "",
      prep.mostImportant ? `RAISE: ${prep.mostImportant.claim} [${prep.mostImportant.source.label}]` : "RAISE: nothing on record rises to a must-raise.",
      prep.opener ? `OPEN WITH: ${prep.opener.claim}` : "OPEN WITH: no recorded fact makes a natural opener.",
      "",
      "LOOPS FROM LAST TIME:",
      ...(prep.openLoops.length
        ? prep.openLoops.map((l) => `  - "${l.commitment}" → ${VERDICT_META[l.verdict].label}. ${l.verdictNote}`)
        : ["  - none recorded."]),
      "",
      `SINCE THEN: ${prep.changes.headline}`,
      ...prep.changes.items.slice(0, 8).map((i) => `  - ${i.headline} — ${i.detail}`),
      "",
      ...(prep.gaps.length ? ["NOT ON RECORD:", ...prep.gaps.map((g) => `  - ${g}`)] : []),
    ];
    void navigator.clipboard?.writeText(lines.join("\n"));
    setCopied(true);
    toast("Brief copied", { desc: "Including the gaps — what is missing travels with it." });
    window.setTimeout(() => setCopied(false), 2000);
  }, [prep, toast]);

  return (
    <div className={cn("space-y-2", className)}>
      {/* --- Header ------------------------------------------------------ */}
      <div className="card p-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="label-eyebrow">60-second prep</p>
            <h3 className="mt-0.5 font-display text-heading font-semibold text-ink-50">
              {prep.clientName}
            </h3>
            {prep.lastConsult ? (
              <p className="mt-1 text-detail leading-relaxed text-ink-400">
                Last spoke {prep.lastConsult.elapsed} · {prep.lastConsult.kind.toLowerCase()} with{" "}
                {prep.lastConsult.author}
                {!prep.lastConsult.signed && (
                  <span className="text-watch"> · that note is still unsigned</span>
                )}
              </p>
            ) : (
              <p className="mt-1 text-detail text-watch">
                No consult on record with this member — there is no previous call to build from.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {unkept > 0 && <Badge tone="high">{unkept} not done</Badge>}
            <Button size="sm" variant="outline" onClick={copyText}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copy
            </Button>
          </div>
        </div>

        {prep.lastConsult && (
          <div className="mt-2 rounded-xl border border-ink-700/70 bg-ink-900/40 p-2.5">
            <p className="text-detail leading-snug text-ink-200">{prep.lastConsult.headline}</p>
            <div className="mt-1.5">
              <SourceChip
                source={{
                  kind: "consult",
                  recordId: prep.lastConsult.id,
                  label: `${prep.lastConsult.kind} · ${formatDate(prep.lastConsult.at)}`,
                  at: prep.lastConsult.at,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* --- The one thing to raise -------------------------------------- */}
      <div
        className={cn(
          "card p-3",
          prep.mostImportant ? "border-gold-400/30 bg-gold-400/[0.05]" : "border-ink-700",
        )}
      >
        <p className="label-eyebrow flex items-center gap-1.5">
          <Target className="h-3 w-3 text-gold-300" />
          Raise this
        </p>
        {prep.mostImportant ? (
          <>
            <p className="mt-1 text-body font-medium leading-snug text-ink-50">
              {prep.mostImportant.claim}
            </p>
            <p className="mt-1 text-detail leading-relaxed text-ink-400">{prep.mostImportant.why}</p>
            <div className="mt-1.5">
              <SourceChip source={prep.mostImportant.source} />
            </div>
          </>
        ) : (
          <p className="mt-1 text-detail leading-relaxed text-ink-400">
            Nothing on the record rises to a must-raise: no open escalation, no supply problem, no
            flag in what changed. Treat this as an open check-in rather than a call with an agenda.
          </p>
        )}
      </div>

      {/* --- Suggested opener -------------------------------------------- */}
      <div className="card p-3">
        <p className="label-eyebrow flex items-center gap-1.5">
          <MessageCircle className="h-3 w-3 text-ink-500" />
          One way in
        </p>
        {prep.opener ? (
          <>
            <p className="mt-1 text-body italic leading-snug text-ink-100">{prep.opener.claim}</p>
            <p className="mt-1 text-detail leading-relaxed text-ink-400">{prep.opener.why}</p>
            <div className="mt-1.5">
              <SourceChip source={prep.opener.source} />
            </div>
          </>
        ) : (
          <p className="mt-1 text-detail leading-relaxed text-ink-400">
            No recorded fact makes a natural opener. Rather than suggest a pleasantry, this is blank
            — start wherever you like.
          </p>
        )}
      </div>

      {/* --- Open loops --------------------------------------------------- */}
      <div className="card p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="label-eyebrow">What they said they&apos;d do</p>
          <p className="text-micro text-ink-600">
            Cross-referenced against orders, appointments, labs, scans and journal
          </p>
        </div>

        {prep.openLoops.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-ink-700 px-3 py-4 text-center text-detail text-ink-500">
            No commitments were recorded at the last consult. Nothing is being withheld — the note
            simply contains none.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-1.5">
            {prep.openLoops.map((loop) => (
              <LoopRow key={loop.id} loop={loop} />
            ))}
          </div>
        )}
      </div>

      {/* --- Changes since ------------------------------------------------ */}
      <SinceLastVisitCard clientId={clientId} coachId={coachId} />

      {/* --- What is NOT on record ---------------------------------------- */}
      {prep.gaps.length > 0 && (
        <div className="card border-ink-700 p-3">
          <p className="label-eyebrow flex items-center gap-1.5">
            <Info className="h-3 w-3 text-ink-500" />
            Not on record
          </p>
          {/* The honesty section, and the one most likely to be cut for space.
              It is what stops a short brief reading as a clean bill of health:
              a coach must be able to tell "we looked and found nothing" from
              "we did not look". */}
          <ul className="mt-1.5 space-y-1">
            {prep.gaps.map((gap, i) => (
              <li key={i} className="flex gap-2 text-detail leading-relaxed text-ink-400">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-600" />
                <span className="min-w-0">{gap}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
