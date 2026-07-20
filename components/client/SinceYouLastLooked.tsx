"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  X,
  Eye,
  FlaskConical,
  ClipboardList,
  Syringe,
  MessageSquare,
  Package,
  AlertTriangle,
} from "lucide-react";
import {
  lastViewedBy,
  changesSince,
  groupChanges,
  elapsedPhrase,
  NOW,
  type ChangeItem,
  type ChangeKind,
} from "@/lib/changes/since";
import { getClient } from "@/lib/mock/clients";
import { staffName } from "@/lib/mock/staff";
import { Badge, Button } from "@/components/ui/primitives";
import { formatDate, formatDateTime, cn } from "@/lib/utils";

/**
 * "12 things changed since you last opened this chart, 3 weeks ago."
 *
 * The banner is the payoff for logging reads. Everything a clinician needs in
 * the first four seconds of opening a chart — did something happen, does any of
 * it need me before I speak, how far behind am I — resolves to one sentence and
 * one count, personalised to the reader.
 *
 * Three deliberate behaviours:
 *
 *  1. A FIRST LOOK IS NOT ZERO CHANGES. If this staff member has never opened
 *     this chart, we say that. Rendering "nothing changed" to someone seeing a
 *     member for the first time is an actively false statement, and the honest
 *     version is more useful anyway: it tells a covering provider that they are
 *     new here.
 *  2. HIGH-IMPORTANCE ITEMS ARE NEVER BEHIND A CLICK. Collapsed, the banner
 *     still names how many need attention; expanded, they are first.
 *  3. DISMISSAL IS PER-SESSION AND LOCAL. Dismissing hides the banner; it does
 *     not mark anything reviewed, and it writes nothing. A control that quietly
 *     changes the record is how "I dismissed it" becomes "you signed off on it".
 */

const KIND_ICON: Record<ChangeKind, typeof Eye> = {
  lab: FlaskConical,
  plan: ClipboardList,
  protocol: Syringe,
  consult: ClipboardList,
  order: Package,
  message: MessageSquare,
  escalation: AlertTriangle,
};

function ChangeRow({ item }: { item: ChangeItem }) {
  const Icon = KIND_ICON[item.kind];
  const high = item.importance === "high";

  const body = (
    <>
      <Icon
        className={cn("mt-0.5 h-4 w-4 shrink-0", high ? "text-high" : "text-ink-500")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p
            className={cn(
              "text-body font-medium",
              high ? "text-ink-50" : "text-ink-200",
            )}
          >
            {item.headline}
          </p>
          {high && <Badge tone="high">Needs attention</Badge>}
        </div>
        {/* line-clamp keeps a long message body from turning the banner into
            the message itself — the banner points, the tab reads. */}
        <p className="mt-1 line-clamp-2 text-detail leading-relaxed text-ink-400">{item.detail}</p>
        <p className="stat-mono mt-1 text-micro text-ink-500">{formatDateTime(item.at)}</p>
      </div>
    </>
  );

  const shell = cn(
    "flex w-full gap-3 rounded-xl border p-3 text-left transition-colors",
    high
      ? "border-high/30 bg-high/[0.06]"
      : "border-ink-700/70 bg-ink-900/40 hover:border-ink-600",
  );

  return item.href ? (
    <a href={item.href} className={cn(shell, "focus-ring")}>
      {body}
    </a>
  ) : (
    <div className={shell}>{body}</div>
  );
}

export function SinceYouLastLooked({
  clientId,
  staffId,
}: {
  clientId: string;
  staffId: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  const client = getClient(clientId);

  // The ledger scan is a full pass over the chain per source; memoise it so a
  // parent re-render (tab switch, filter change) does not redo it.
  const { since, items, highCount, groups } = useMemo(() => {
    const s = lastViewedBy(clientId, staffId);
    const list = s ? changesSince(clientId, s) : [];
    return {
      since: s,
      items: list,
      highCount: list.filter((i) => i.importance === "high").length,
      groups: groupChanges(list),
    };
  }, [clientId, staffId]);

  if (!client || dismissed) return null;

  // ---------------------------------------------------------------------
  // First look — a distinct state, not an empty one.
  // ---------------------------------------------------------------------
  if (!since) {
    return (
        <div className="card flex flex-col gap-3 border-gold-400/25 bg-gold-400/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" aria-hidden />
            <div className="min-w-0">
              <p className="text-body font-medium text-ink-50">
                First time you&rsquo;ve opened this chart
              </p>
              <p className="mt-1 text-detail leading-relaxed text-ink-400">
                {staffName(staffId)} has no prior view of {client.firstName}&rsquo;s record, so
                there is no &ldquo;since last time&rdquo; to compare against. Member since{" "}
                {formatDate(client.joinedOn)}.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="self-start sm:self-center"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
    );
  }

  // ---------------------------------------------------------------------
  // Seen it before, and genuinely nothing moved.
  // ---------------------------------------------------------------------
  if (!items.length) {
    return (
        <div className="card flex items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 gap-3">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden />
            <p className="text-body text-ink-300">
              Nothing has changed since you last opened this chart{" "}
              <span className="text-ink-400">{elapsedPhrase(since, NOW)}</span>.
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => setDismissed(true)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
    );
  }

  return (
      <div
        className={cn(
          "card overflow-hidden",
          highCount ? "border-high/30" : "border-gold-400/25",
        )}
      >
        <div className="flex items-start gap-3 p-4">
          <Eye
            className={cn("mt-0.5 h-4 w-4 shrink-0", highCount ? "text-high" : "text-gold-300")}
            aria-hidden
          />

          <div className="min-w-0 flex-1">
            <p className="text-body font-medium text-ink-50">
              <span className="stat-mono">{items.length}</span>{" "}
              {items.length === 1 ? "thing" : "things"} changed since you last opened this chart,{" "}
              {elapsedPhrase(since, NOW)}.
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {highCount > 0 && (
                <Badge tone="high">
                  <span className="stat-mono">{highCount}</span> need
                  {highCount === 1 ? "s" : ""} attention
                </Badge>
              )}
              {/* The timestamp is stated outright rather than only implied by
                  "3 weeks ago" — a clinician deciding whether to trust the list
                  wants the actual instant it is measured from. */}
              <span className="text-micro text-ink-500">
                Measured from your view on{" "}
                <span className="stat-mono">{formatDateTime(since)}</span>
              </span>
            </div>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg text-detail font-medium text-gold-300 hover:text-gold-400"
            >
              {open ? "Hide" : "Show what changed"}
              {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>

          <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => setDismissed(true)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {open && (
          <div className="space-y-5 border-t border-ink-700/70 p-4">
            {groups.map((group) => (
              <section key={group.kind}>
                <p className="label-eyebrow">
                  {group.label} &middot; <span className="stat-mono">{group.items.length}</span>
                </p>
                {/* Single column at every breakpoint by design: these are
                    ranked rows, and a two-column layout destroys the ranking
                    the whole feature is built on. */}
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {group.items.map((item) => (
                    <ChangeRow key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ))}

            <p className="text-micro leading-relaxed text-ink-500">
              This list is personal to you. It is built from the access log &mdash; Apex records
              chart <em>reads</em>, not just writes, which is what makes &ldquo;since{" "}
              <em>you</em> last looked&rdquo; answerable at all. Dismissing it changes nothing on
              the record.
            </p>
          </div>
        )}
      </div>
  );
}

export default SinceYouLastLooked;
