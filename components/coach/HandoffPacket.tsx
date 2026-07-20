"use client";

import * as React from "react";
import {
  Printer,
  Copy,
  Check,
  FileSignature,
  AlertTriangle,
  CalendarClock,
  MessageSquare,
  Hash,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  EmptyState,
  Progress,
} from "@/components/ui/primitives";
import { Monogram } from "@/components/Monogram";
import { useToast } from "@/components/ui/Toast";
import { clientMap } from "@/lib/mock/clients";
import { coaches, staffName } from "@/lib/mock/staff";
import { shortHash } from "@/lib/trace/hash";
import type { LedgerRow } from "@/lib/trace/ledger";
import {
  buildPacket,
  commitPacket,
  packetToText,
  COVER_WINDOW_DAYS,
  type HandoffBrief,
  type HandoffPacket as Packet,
} from "@/lib/handoff/packet";
import { cn, formatDate } from "@/lib/utils";

/**
 * Coach handoff packet.
 *
 * A packet is built on demand and only *recorded* when the coach commits it,
 * because previewing your own roster is not a disclosure and should not be
 * written into the ledger as one. The moment it is generated for a named
 * covering coach, it becomes one — and the UI says so, plainly, before the
 * button is pressed. A staff member should never learn after the fact that an
 * action they took was auditable.
 */

/** How many briefs the screen shows before asking. Print/copy ignore this. */
const SCREEN_SLICE = 12;

function attentionTone(score: number): "high" | "watch" | "neutral" {
  if (score >= 60) return "high";
  if (score >= 35) return "watch";
  return "neutral";
}

function BriefCard({ brief }: { brief: HandoffBrief }) {
  const client = clientMap[brief.clientId];
  const urgent = brief.open.filter((o) => o.urgent);

  return (
    <article className="card break-inside-avoid p-4">
      <header className="flex items-start gap-3">
        {client && <Monogram client={client} />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-heading font-semibold text-ink-50">{brief.name}</p>
          <p className="truncate text-detail text-ink-400">
            {brief.age}
            {brief.sex === "male" ? "M" : "F"} · MRN {brief.mrn} · {brief.locationLabel}
          </p>
        </div>
        <Badge tone={attentionTone(brief.attention.score)}>
          <span className="stat-mono">{brief.attention.score}</span>
        </Badge>
      </header>

      <p className="mt-2 text-detail text-ink-400">{brief.journey}</p>

      {/* The one line the covering coach reads first. */}
      <div
        className={cn(
          "mt-3 rounded-xl border p-3",
          urgent.length
            ? "border-high/30 bg-high/[0.08]"
            : "border-gold-400/25 bg-gold-400/[0.06]",
        )}
      >
        <p className="label-eyebrow">MOST IMPORTANT</p>
        <p
          className={cn(
            "mt-1 text-body leading-relaxed",
            urgent.length ? "text-high" : "text-ink-100",
          )}
        >
          {brief.headline}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <section>
          <p className="label-eyebrow flex items-center gap-1.5">
            <MessageSquare className="h-3 w-3" /> LAST DISCUSSED
          </p>
          {brief.lastDiscussed ? (
            <>
              <p className="mt-1 text-detail text-ink-500">
                {formatDate(brief.lastDiscussed.at)} · {brief.lastDiscussed.kind} /{" "}
                {brief.lastDiscussed.channel}
                {!brief.lastDiscussed.signed && " · unsigned"}
              </p>
              <p className="mt-1 text-body leading-relaxed text-ink-200">
                {brief.lastDiscussed.headline}
              </p>
              {brief.lastDiscussed.actionItems.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {brief.lastDiscussed.actionItems.map((a, i) => (
                    <li key={i} className="text-detail leading-snug text-ink-400">
                      • committed: {a}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-1 text-detail text-ink-500">No consult on file.</p>
          )}
          {brief.lastTouch && (
            <p className="mt-2 text-micro text-ink-500">
              Last contact of any kind: {brief.lastTouch.channel},{" "}
              <span className="stat-mono">{brief.lastTouch.daysAgo}</span>d ago.
            </p>
          )}
        </section>

        <section>
          <p className="label-eyebrow flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" /> OPEN
          </p>
          {brief.open.length === 0 ? (
            <p className="mt-1 text-detail text-ink-500">Nothing outstanding.</p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {brief.open.map((o, i) => (
                <li key={i} className="rounded-lg bg-ink-900/70 px-2.5 py-2">
                  <p
                    className={cn(
                      "text-detail font-medium",
                      o.urgent ? "text-high" : "text-ink-200",
                    )}
                  >
                    {o.label}
                  </p>
                  <p className="mt-0.5 text-micro leading-snug text-ink-500">{o.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-3">
        <p className="label-eyebrow flex items-center gap-1.5">
          <CalendarClock className="h-3 w-3" /> DUE IN THE NEXT {COVER_WINDOW_DAYS} DAYS
        </p>
        {brief.dueNext.length === 0 ? (
          <p className="mt-1 text-detail text-ink-500">Nothing scheduled in the cover window.</p>
        ) : (
          <ul className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {brief.dueNext.map((d, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg bg-ink-900/70 px-2.5 py-1.5"
              >
                <span className="min-w-0 truncate text-detail text-ink-300">{d.label}</span>
                <span
                  className={cn(
                    "stat-mono shrink-0 text-micro",
                    d.overdue ? "text-high" : "text-ink-400",
                  )}
                >
                  {d.overdue ? `${Math.abs(d.inDays)}d ago` : `in ${d.inDays}d`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-3 border-t border-ink-800 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">triage {brief.attention.triage}</Badge>
          <Badge tone={brief.attention.churnLevel === "high" ? "high" : "neutral"}>
            churn {brief.attention.churn}
          </Badge>
          {brief.membershipTier && <Badge tone="gold">{brief.membershipTier}</Badge>}
        </div>
        <p className="mt-2 text-detail leading-relaxed text-ink-400">
          <span className="text-ink-200">Next action:</span> {brief.nextAction.action}{" "}
          <span className="text-ink-500">
            ({brief.nextAction.owner}) — {brief.nextAction.reason}
          </span>
        </p>
      </footer>
    </article>
  );
}

export function HandoffPacket() {
  const { toast } = useToast();
  const [coachId, setCoachId] = React.useState(coaches[0]?.id ?? "");
  const [coveringId, setCoveringId] = React.useState(coaches[1]?.id ?? coaches[0]?.id ?? "");
  const [committed, setCommitted] = React.useState<{ packet: Packet; rows: LedgerRow[] } | null>(
    null,
  );
  const [copied, setCopied] = React.useState(false);
  /**
   * Screen shows the priority slice; print and copy always take the whole
   * packet. A 90-member roster rendered as 90 cards is not a briefing document,
   * it is the roster again — and the covering coach would read the first three.
   * The paper and pasted forms stay complete because those get read once,
   * offline, in full.
   */
  const [showAll, setShowAll] = React.useState(false);

  // Preview is free and unrecorded — it is the coach's own roster.
  const preview = React.useMemo(() => buildPacket(coachId), [coachId]);
  const packet = committed?.packet ?? preview;
  const isCommitted = committed?.packet.coachId === coachId;

  const generate = () => {
    const result = commitPacket(buildPacket(coachId), coachId, coveringId);
    setCommitted(result);
    toast("Handoff packet generated", {
      desc: `${result.rows.length} disclosure rows appended to the ledger`,
      tone: "info",
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(packetToText(packet));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Could not copy", { desc: "Clipboard access was refused.", tone: "warn" });
    }
  };

  React.useEffect(() => {
    // Switching coaches invalidates a commit — the recorded packet belongs to
    // the coach it was generated for, and must not appear to cover another.
    setCommitted(null);
  }, [coachId]);

  if (coaches.length === 0) {
    return <EmptyState title="No coaches on file" />;
  }

  const t = packet.totals;

  return (
    <div className="space-y-5">
      {/* Print rules live in `print:` utilities rather than a global stylesheet:
          the controls and the ledger receipt are screen furniture, the briefs
          are the document. */}
      <Card className="print:hidden">
        <CardHeader className="flex flex-wrap items-center gap-2">
          <FileSignature className="h-4 w-4 text-gold-300" />
          <CardTitle>Generate a cover packet</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label-eyebrow">COACH GOING OUT</span>
              <Select className="mt-1" value={coachId} onChange={(e) => setCoachId(e.target.value)}>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="label-eyebrow">COVERING COACH</span>
              <Select
                className="mt-1"
                value={coveringId}
                onChange={(e) => setCoveringId(e.target.value)}
              >
                {coaches
                  .filter((c) => c.id !== coachId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </label>
          </div>

          <p className="mt-3 flex items-start gap-2 rounded-xl border border-ink-700/70 bg-ink-900/60 p-3 text-detail leading-relaxed text-ink-400">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-300" />
            <span>
              A handoff packet discloses protected health information to another staff member.
              Generating it appends one ledger row per member named in it — an accounting of
              disclosures is answered per patient, so one row for the whole packet would answer it
              for none of them.
            </span>
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={generate} className="h-10">
              <FileSignature className="h-4 w-4" />
              {isCommitted ? "Regenerate & record" : "Generate & record"}
            </Button>
            <Button variant="outline" onClick={copy} className="h-10">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy as text"}
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="h-10">
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        </CardContent>
      </Card>

      {isCommitted && committed && (
          <Card className="print:hidden border-optimal/30">
            <CardContent className="p-4">
              <p className="flex items-center gap-2 text-body font-medium text-optimal">
                <Check className="h-4 w-4" />
                Recorded — {committed.rows.length} disclosure row
                {committed.rows.length === 1 ? "" : "s"} to {staffName(coveringId)}
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-detail text-ink-400">
                <Hash className="h-3 w-3 shrink-0" />
                <span className="stat-mono">{committed.rows[0]?.id}</span>
                {committed.rows.length > 1 && (
                  <>
                    <span className="text-ink-600">…</span>
                    <span className="stat-mono">
                      {committed.rows[committed.rows.length - 1]?.id}
                    </span>
                  </>
                )}
                <span className="text-ink-600">·</span>
                <span className="stat-mono truncate">
                  {shortHash(committed.rows[committed.rows.length - 1]?.hash ?? "")}
                </span>
              </p>
            </CardContent>
          </Card>
      )}

      {/* The document itself. */}
      <header className="rounded-2xl border border-ink-700 bg-ink-850 p-4">
        <p className="label-eyebrow">COACH HANDOFF PACKET</p>
        <h2 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">
          {packet.coachName}
        </h2>
        <p className="mt-1 text-body text-ink-400">
          Cover window {formatDate(packet.coverFrom)} → {formatDate(packet.coverTo)} · covering
          coach {staffName(coveringId)}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "MEMBERS", value: t.clients },
            { label: "NEED ATTENTION", value: t.needsAttention },
            { label: "OPEN ESCALATIONS", value: t.openEscalations },
            { label: "OVERDUE / URGENT", value: t.overdueEscalations },
            { label: "OPEN ORDERS", value: t.openOrders },
            { label: `DUE IN ${COVER_WINDOW_DAYS}D`, value: t.dueInWindow },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-ink-900 p-3">
              <p className="stat-mono text-title text-ink-50">{s.value}</p>
              <p className="mt-0.5 text-micro uppercase tracking-wide text-ink-500">{s.label}</p>
            </div>
          ))}
        </div>

        {t.clients > 0 && (
          <>
            <Progress
              className="mt-4"
              tone={t.needsAttention / t.clients > 0.4 ? "high" : "gold"}
              value={(t.needsAttention / t.clients) * 100}
            />
            <p className="mt-1.5 text-detail text-ink-500">
              Ordered by how much attention each member is likely to need during cover — triage
              weighted, churn included, because cover periods lose people quietly.
            </p>
          </>
        )}
      </header>

      {packet.briefs.length === 0 ? (
        <EmptyState title="No members assigned" hint={`${packet.coachName} has no roster to hand off.`} />
      ) : (
        <>
          {packet.briefs.length > SCREEN_SLICE && (
            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
              <p className="text-detail text-ink-500">
                Showing the{" "}
                <span className="stat-mono">
                  {showAll ? packet.briefs.length : SCREEN_SLICE}
                </span>{" "}
                highest-attention of <span className="stat-mono">{packet.briefs.length}</span>{" "}
                members. Print and copy always include everyone.
              </p>
              <Button variant="outline" onClick={() => setShowAll((v) => !v)} className="h-9">
                {showAll ? `Show top ${SCREEN_SLICE}` : `Show all ${packet.briefs.length}`}
              </Button>
            </div>
          )}
          {/* Every brief is rendered; the ones past the slice are hidden on
              screen but restored for print, so the paper packet is complete
              without the reader having to remember to expand it first. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {packet.briefs.map((b, i) => (
              <div
                key={b.clientId}
                className={cn(
                  "break-inside-avoid",
                  !showAll && i >= SCREEN_SLICE && "hidden print:block",
                )}
              >
                <BriefCard brief={b} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
