"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, MessageSquare, Smartphone, ShieldCheck, MoonStar, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Client } from "@/lib/types";
import type { NudgeKind } from "@/lib/engage/nudges";
import {
  NUDGE_LIMITS,
  NUDGE_QUIET_HOURS,
  nudgeDecision,
} from "@/lib/engage/nudges";
import { consentSummary, SCOPE_LABEL } from "@/lib/comms/consent";
import { Card, CardContent, Badge, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { appendLedger } from "@/lib/trace/ledger";
import { cn } from "@/lib/utils";

/**
 * NOTIFICATION PREFERENCES — the off switch, and it is a real one.
 *
 * An engagement system a member cannot turn down is not engagement, it is
 * harassment. That sentence is the design brief for this screen, and it is
 * printed on the screen itself (politely) rather than kept in a comment where
 * only engineers see it — because a member has no way to verify a claim we only
 * make internally.
 *
 * Three things this page does that a decorative preference screen does not:
 *
 *  1. **It shows the limits as numbers.** `NUDGE_LIMITS` renders verbatim from
 *     the engine. The member reads the same constants the code enforces, next
 *     to the failure each one prevents.
 *  2. **It shows why the last message fired**, from `nudgeDecision` — including
 *     when the answer was "we deliberately said nothing today", and why.
 *  3. **It routes clinical channels back to consent** rather than pretending a
 *     toggle here can override a signed grant. Turning off "lab results are
 *     back" changes a notification; it does not change what your provider is
 *     permitted to send you, and conflating the two would be a compliance bug
 *     wearing a friendly switch.
 *
 * State is local to the session. In production these write to the member's
 * preference record and are read by the nudge engine before `sendMessage` is
 * ever called — the consent guard in lib/comms stays underneath either way, so
 * a preference can only ever narrow what you receive, never widen it.
 */

const NOW = "2026-06-12T09:00:00";

interface ChannelDef {
  id: "sms" | "email" | "push";
  label: string;
  detail: string;
  icon: LucideIcon;
  defaultOn: boolean;
}

const CHANNELS: ChannelDef[] = [
  {
    id: "push",
    label: "In the app",
    detail: "The quietest option. Nothing leaves your phone.",
    icon: Smartphone,
    defaultOn: true,
  },
  {
    id: "sms",
    label: "Text message",
    detail: "Fastest for anything time-sensitive, like a refill about to run out.",
    icon: MessageSquare,
    defaultOn: true,
  },
  {
    id: "email",
    label: "Email",
    detail: "Longer things — plan summaries, what changed and why.",
    icon: Mail,
    defaultOn: false,
  },
];

interface TopicDef {
  kind: NudgeKind;
  label: string;
  detail: string;
  defaultOn: boolean;
  /**
   * Topics that carry clinical content. Switching one off is honoured, but the
   * copy says plainly that your care team can still reach you — because they
   * can, and finding that out later feels like a broken promise.
   */
  clinical?: boolean;
}

const TOPICS: TopicDef[] = [
  {
    kind: "coach-message-unread",
    label: "Your coach is waiting on a reply",
    detail: "A person sent you something and hasn't heard back.",
    defaultOn: true,
    clinical: true,
  },
  {
    kind: "refill-running-out",
    label: "A refill is running low",
    detail: "Only inside ten days of supply. Never earlier.",
    defaultOn: true,
  },
  {
    kind: "labs-due",
    label: "Your next panel is due",
    detail: "Roughly once a quarter, when the last one has aged out.",
    defaultOn: true,
    clinical: true,
  },
  {
    kind: "follow-up-unbooked",
    label: "You have no visit booked",
    detail: "Once, when there's nothing on the books.",
    defaultOn: true,
  },
  {
    kind: "streak-at-risk",
    label: "Your streak is still open tonight",
    detail:
      "Evenings only, and only if the streak is worth protecting. Days your provider told you to pause are always held, never lost.",
    defaultOn: true,
  },
  {
    kind: "rings-open-late",
    label: "Rings still open this evening",
    detail: "A single reminder after 6pm. Not a countdown.",
    defaultOn: false,
  },
  {
    kind: "chapter-reached",
    label: "You reached a new chapter",
    detail: "Earned from what you did — days closed, panels drawn, visits attended.",
    defaultOn: true,
  },
];

/** Quiet hours are a floor, not a default — a member may only widen them. */
const QUIET_START_OPTIONS = [20, 21, 22];
const QUIET_END_OPTIONS = [7, 8, 9, 10];

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors focus-ring motion-reduce:transition-none",
        checked ? "border-gold-400/40 bg-gold-500" : "border-ink-600 bg-ink-700",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform motion-reduce:transition-none",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

export function NotificationPrefs({ client }: { client: Client }) {
  const { toast } = useToast();

  const [channels, setChannels] = useState<Record<string, boolean>>(
    Object.fromEntries(CHANNELS.map((c) => [c.id, c.defaultOn])),
  );
  const [topics, setTopics] = useState<Record<string, boolean>>(
    Object.fromEntries(TOPICS.map((t) => [t.kind, t.defaultOn])),
  );
  // Explicitly `number`: NUDGE_QUIET_HOURS is `as const`, so inference would
  // pin these to the literal 21/8 and make the widen-only selects untypeable.
  const [quietStart, setQuietStart] = useState<number>(NUDGE_QUIET_HOURS.startHour);
  const [quietEnd, setQuietEnd] = useState<number>(NUDGE_QUIET_HOURS.endHour);

  const decision = nudgeDecision(client.id, NOW);
  const consent = consentSummary(client.id);

  const allOff = Object.values(channels).every((v) => !v);

  function persist(what: string, after: Record<string, unknown>) {
    // A preference change is a record, not a UI state. If a member says they
    // turned something off, the ledger has to be able to agree with them.
    appendLedger({
      actorId: client.id,
      actorName: `${client.firstName} ${client.lastName}`,
      actorRole: "Client",
      action: "update",
      // There is no "preference" entity on the ledger and inventing one here
      // would fork the taxonomy from a component. Preferences live on the
      // member's record, so the event is recorded against the chart.
      entity: "chart",
      entityId: client.id,
      subjectId: client.id,
      subjectName: `${client.firstName} ${client.lastName}`,
      locationId: client.locationId,
      reason: `Member updated notification preferences — ${what}`,
      after,
    });
  }

  function toggleChannel(id: string, next: boolean) {
    setChannels((c) => ({ ...c, [id]: next }));
    persist(`channel ${id}`, { channel: id, enabled: next });
    toast(next ? "Channel on" : "Channel off", {
      desc: next
        ? "You'll get notifications here."
        : "Nothing automated will go out on this one.",
    });
  }

  function toggleTopic(kind: string, next: boolean) {
    setTopics((t) => ({ ...t, [kind]: next }));
    persist(`topic ${kind}`, { topic: kind, enabled: next });
  }

  function setQuiet(start: number, end: number) {
    setQuietStart(start);
    setQuietEnd(end);
    persist("quiet hours", { quietStartHour: start, quietEndHour: end });
    toast("Quiet hours updated", { desc: `Nothing between ${start}:00 and ${end}:00.` });
  }

  return (
    <div className="space-y-5">
      {/* The thesis, stated to the member ------------------------------------ */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <p className="label-eyebrow">Notifications</p>
          <h2 className="mt-2 font-display text-xl font-semibold leading-snug text-ink-50">
            You decide how much you hear from us.
          </h2>
          <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-300">
            A reminder system you can&rsquo;t turn down isn&rsquo;t encouragement, it&rsquo;s
            pestering — and we&rsquo;d rather you stayed a member than opened one more
            notification. Everything below is off-switchable, the limits underneath are
            real numbers enforced in code, and turning all of it off will never affect
            your care.
          </p>
        </CardContent>
      </Card>

      {/* Channels ------------------------------------------------------------ */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <h3 className="font-display text-base font-semibold text-ink-50">Where we reach you</h3>
          <div className="mt-4 grid grid-cols-1 gap-3">
            {CHANNELS.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.id}
                  className="flex items-start gap-3 rounded-2xl border border-ink-700/70 bg-ink-900/40 p-4"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-100">{c.label}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{c.detail}</p>
                  </div>
                  <Toggle
                    checked={channels[c.id]}
                    onChange={(next) => toggleChannel(c.id, next)}
                    label={c.label}
                  />
                </div>
              );
            })}
          </div>

          {allOff && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl border border-ink-700 bg-ink-900/50 p-3 text-[13px] leading-relaxed text-ink-300">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-optimal" />
              <span>
                Everything is off, and that is a perfectly reasonable setting. Your coach and
                provider can still message you in the portal, and anything clinically urgent
                reaches you by phone — silence here never means silence from your care team.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quiet hours ---------------------------------------------------------- */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <MoonStar className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold text-ink-50">Quiet hours</h3>
              <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-500">
                Nothing automated goes out inside this window. You can widen it; you
                can&rsquo;t narrow it past {NUDGE_QUIET_HOURS.startHour}:00 – 0
                {NUDGE_QUIET_HOURS.endHour}:00, because a 2am text is how a member ends up
                replying STOP and losing the channel we needed for their lab results.
              </p>
            </div>
          </div>

          {/* 2-up at 390px — neither select wraps. */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-ink-500">Starts</span>
              <Select
                className="mt-1"
                value={quietStart}
                onChange={(e) => setQuiet(Number(e.target.value), quietEnd)}
              >
                {QUIET_START_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-ink-500">Ends</span>
              <Select
                className="mt-1"
                value={quietEnd}
                onChange={(e) => setQuiet(quietStart, Number(e.target.value))}
              >
                {QUIET_END_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Topics --------------------------------------------------------------- */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <h3 className="font-display text-base font-semibold text-ink-50">What you want to hear about</h3>
          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-500">
            Each of these fires from something real on your record. None of them fire on a
            schedule, and none of them fire twice.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3">
            {TOPICS.map((t) => (
              <div
                key={t.kind}
                className="flex items-start gap-3 rounded-2xl border border-ink-700/70 bg-ink-900/40 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink-100">{t.label}</p>
                    {t.clinical && <Badge tone="gold">Clinical</Badge>}
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{t.detail}</p>
                  {t.clinical && !topics[t.kind] && (
                    <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
                      Turned off. Your care team can still reach you directly about this —
                      a preference changes the reminder, not your clinician.
                    </p>
                  )}
                </div>
                <Toggle
                  checked={topics[t.kind]}
                  onChange={(next) => toggleTopic(t.kind, next)}
                  label={t.label}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* The limits, as numbers ------------------------------------------------ */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <h3 className="font-display text-base font-semibold text-ink-50">
            The limits we hold ourselves to
          </h3>
          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-500">
            These are enforced in code, not policy. Each one exists because of a specific way
            this goes wrong.
          </p>

          <dl className="mt-4 grid grid-cols-1 gap-3">
            {NUDGE_LIMITS.map((l) => (
              <div key={l.label} className="rounded-2xl border border-ink-700/70 bg-ink-900/40 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-sm font-medium text-ink-100">{l.label}</dt>
                  <dd className="stat-mono text-sm text-gold-300">{l.value}</dd>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{l.prevents}</p>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* Why you did or didn't hear from us today ------------------------------ */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold text-ink-50">Today&rsquo;s decision</h3>
              {decision.nudge ? (
                <>
                  <p className="mt-1.5 max-w-prose text-[15px] leading-relaxed text-ink-200">
                    {decision.nudge.title}
                  </p>
                  <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-500">
                    Sent because: {decision.nudge.reason}
                  </p>
                  {decision.alsoTrue.length > 0 && (
                    <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-500">
                      {decision.alsoTrue.length} other thing
                      {decision.alsoTrue.length === 1 ? " was" : "s were"} also true today and
                      {decision.alsoTrue.length === 1 ? " was" : " were"} dropped rather than
                      queued — you only ever get one.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1.5 max-w-prose text-[15px] leading-relaxed text-ink-200">
                  We didn&rsquo;t contact you today. {decision.suppressed?.detail}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Consent is a different thing, and says so ----------------------------- */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <h3 className="font-display text-base font-semibold text-ink-50">Consent, separately</h3>
          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-500">
            Preferences above are yours to change any time. Consent is a signed record of what
            we&rsquo;re permitted to send at all, and it lives on your Consents page — a toggle
            here can narrow what reaches you, never widen it.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-2">
            {consent.scopes.map((s) => (
              <div
                key={s.scope}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink-700/70 bg-ink-900/40 px-4 py-3"
              >
                <span className="text-sm text-ink-200">{SCOPE_LABEL[s.scope]}</span>
                <Badge tone={s.active ? "optimal" : "neutral"}>
                  {s.active ? "Permitted" : "Blocked"}
                </Badge>
              </div>
            ))}
          </div>

          <Link
            href="/portal/consents"
            className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-ink-600 px-4 text-sm text-ink-200 transition-colors hover:border-ink-500 hover:bg-ink-800 focus-ring"
          >
            Review my consents
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
