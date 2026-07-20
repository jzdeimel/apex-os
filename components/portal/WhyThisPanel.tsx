"use client";

import Link from "next/link";
import { FlaskConical, MessagesSquare, ShieldCheck, HelpCircle, ScanSearch } from "lucide-react";
import { NO_RECORDED_REASON, type WhyThis } from "@/lib/member/whyThis";
import { Badge } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

/**
 * "Why am I on this?" — the expandable body of one plan item.
 *
 * ══ READ lib/member/whyThis.ts BEFORE CHANGING ANY COPY HERE ══════════════
 *
 * This panel used to be four bullet points of `because[]`. The bullets are
 * still here — they are the *reasons* — but on their own they are assertions,
 * and a member has no way to check an assertion. What was added underneath is
 * the part that makes them checkable: the marker and the day it resulted, the
 * conversation and who was in it, the rule and what it looks for, the clinician
 * whose decision it is.
 *
 * Two rules the layout enforces rather than merely states:
 *
 *  1. THE GAP IS LOUDER THAN THE EVIDENCE. When `why.unexplained` is true the
 *     panel renders one block and nothing else — no rule name, no sign-off
 *     chip, no reassuring furniture around an empty middle. A member must be
 *     able to tell the difference between "here is the panel this came from"
 *     and "nobody wrote down why" at a glance, and the fastest way to blur that
 *     line is to keep the surrounding chrome identical in both cases.
 *
 *  2. NO NUMBER IS GRADED. Lab values render as value + unit + date. There is
 *     no status word, no colour coding by band, and no arrow. `/portal/labs`
 *     is where a member reads their results in context with both ranges drawn;
 *     a bare "5.9 — high" inside a protocol card is a panic word with no
 *     clinician attached to it.
 */
export function WhyThisPanel({ why }: { why?: WhyThis }) {
  /**
   * `why` is undefined when an item has no traceback computed at all — a plan
   * section this page renders that `whyThisAll` does not walk. Folded into the
   * same branch as `unexplained` rather than guarded separately, because from
   * the member's side the two are the same fact: nobody wrote down why. The
   * alternative, a non-null assertion, turns a future fourth plan section into
   * a blank member-facing crash on the page they trust most.
   */
  if (!why || why.unexplained) {
    return (
      <div className="rounded-2xl border border-watch/25 bg-watch/5 p-4">
        <div className="flex items-start gap-3">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-watch" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink-100">No reason on file</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">
              {why?.gap ?? NO_RECORDED_REASON}
            </p>
            <Link
              href="/portal/messages"
              className="focus-ring mt-3 inline-flex rounded-md text-[13px] font-medium text-watch hover:underline"
            >
              Ask your coach about this
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Reasons — the member-voice translation, unchanged. ---------------- */}
      {why.reasons.length > 0 && (
        <div>
          <p className="label-eyebrow">Why this is on your plan</p>
          <ul className="mt-2.5 space-y-2">
            {why.reasons.map((r, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-300">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-optimal" />
                <span className="min-w-0">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Traceback ---------------------------------------------------------- */}
      {(why.labs.length > 0 || why.consults.length > 0) && (
        <div>
          <p className="label-eyebrow">Where that came from</p>

          {/* One column at 390px throughout. Two provenance cards side by side
              on a phone turns a date into two lines and a marker name into
              three. */}
          <div className="mt-2.5 grid grid-cols-1 gap-2">
            {why.labs.map((l) => (
              <div key={l.markerKey} className="hairline rounded-xl bg-ink-950/40 p-3.5">
                <div className="flex items-start gap-2.5">
                  <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink-100">
                      {l.markerName}{" "}
                      <span className="stat-mono text-ink-200">
                        {l.value}
                        <span className="ml-0.5 text-[11px] font-normal text-ink-500">{l.unit}</span>
                      </span>
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                      Off your {l.panelName}. Blood taken {formatDate(l.collectedOn)}, result back{" "}
                      {formatDate(l.resultedOn)}.
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {why.consults.map((c) => (
              <div key={c.consultId} className="hairline rounded-xl bg-ink-950/40 p-3.5">
                <div className="flex items-start gap-2.5">
                  <MessagesSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink-100">
                      You raised {c.matchedOn.toLowerCase()} with {c.authorName}
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                      {c.what} · {c.channel.toLowerCase()} · {formatDate(c.at)}
                    </p>
                    {/* The member's own words, as the consult recorded them.
                        Shown verbatim rather than paraphrased — the whole point
                        is that they can recognise it. */}
                    {c.quote && (
                      <p className="mt-2 border-l-2 border-ink-700 pl-2.5 text-[12px] italic leading-relaxed text-ink-400">
                        {c.quote}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {why.labs.length > 0 && (
            <Link
              href="/portal/labs"
              className="focus-ring mt-2 inline-flex rounded-md text-[12px] text-ink-500 hover:text-ink-200"
            >
              See these results with their ranges
            </Link>
          )}
        </div>
      )}

      {/* The rule ----------------------------------------------------------- */}
      {why.rule && (
        <div className="hairline rounded-xl bg-ink-950/40 p-3.5">
          <div className="flex items-start gap-2.5">
            <ScanSearch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink-100">{why.rule.name}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                {/* `triggerSummary` is written for the rules editor, so it is
                    terse but it is not clinical shorthand — showing it verbatim
                    is more honest than paraphrasing a rule into prose that no
                    longer matches what actually ran. */}
                The check that flagged this looks for: {why.rule.looksFor}
                {why.decidedOn && <> · ran {formatDate(why.decidedOn)}</>}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sign-off ----------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 border-t border-ink-800 pt-3.5">
        <ShieldCheck className="h-4 w-4 shrink-0 text-ink-500" />
        <div className="min-w-0 flex-1">
          {why.signoff.state === "signed-off" && (
            <p className="text-[12px] leading-relaxed text-ink-400">
              <span className="text-ink-200">{why.signoff.who}</span> has approved this.{" "}
              {why.signoff.at ? (
                <>Signed {formatDate(why.signoff.at)}.</>
              ) : (
                /* The honest version of a missing timestamp. Printing today's
                   date here would be the single most damaging fabrication on
                   this screen — it is the one field a member might later rely
                   on. */
                <>
                  We don&rsquo;t have the date of that signature in this record — it&rsquo;s on the
                  signed order, and your provider can pull it up.
                </>
              )}
            </p>
          )}
          {why.signoff.state === "with-provider" && (
            <p className="text-[12px] leading-relaxed text-ink-400">
              Proposed, not confirmed. <span className="text-ink-200">{why.signoff.who}</span> decides
              whether this is right for you and sets the amount — nothing happens until they do.
            </p>
          )}
          {why.signoff.state === "coach-led" && (
            <p className="text-[12px] leading-relaxed text-ink-400">
              Set with <span className="text-ink-200">{why.signoff.who}</span>. This one is coaching,
              not a prescription — it is yours to negotiate.
            </p>
          )}
          {why.signoff.state === "not-going-ahead" && (
            <p className="text-[12px] leading-relaxed text-ink-400">
              <span className="text-ink-200">{why.signoff.who}</span> looked at this and decided
              against it. Ask them why at your next visit — a no is a clinical decision and it has a
              reason behind it.
            </p>
          )}
        </div>
        <Badge tone={why.signoff.state === "signed-off" ? "optimal" : "neutral"}>
          {why.signoff.role ?? "Care team"}
        </Badge>
      </div>
    </div>
  );
}
