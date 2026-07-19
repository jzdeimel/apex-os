"use client";

/**
 * Shared bits for the seven /portal pages.
 *
 * Deliberately thin. The portal is a *member*-facing surface but it is not a
 * second design system — it reuses every primitive the clinic and coach
 * consoles use. The only things that genuinely belong to all seven pages are
 * (a) who "I" am, (b) the page header block, and (c) the message thread, which
 * is shared because the home page shows a preview of the same conversation the
 * messages page renders in full.
 */

import type { Client } from "@/lib/types";
import { getClient } from "@/lib/mock/clients";

/**
 * The demo member. Held constant across every portal page on purpose: a member
 * portal has exactly one subject, and a picker at the top would quietly
 * re-teach the viewer that this is a staff tool. It is not.
 *
 * In production this is the session's subject id, resolved server-side. There
 * is no route or control anywhere under /portal that can change it.
 */
export const ME = "c-001";

/** Convenience accessor so pages don't repeat the non-null assertion. */
export function me(): Client {
  return getClient(ME)!;
}

/**
 * Page header.
 *
 * Signature is deliberately unchanged — four portal pages import it — but the
 * proportions are consumer-app, not console: the title carries the screen and
 * the subtitle is allowed to be a real sentence at a readable size. Dense
 * 12px sub-copy is what makes a member close the tab; the eyebrow shrinks so
 * the title has room to grow instead.
 */
export function PortalPageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="pt-1">
      <p className="label-eyebrow">{eyebrow}</p>
      <h1 className="mt-2 font-display text-[1.75rem] font-semibold leading-[1.1] tracking-tight text-ink-50 sm:text-4xl">
        {title}
      </h1>
      {/* max-w-prose rather than full-bleed: long measure is the fastest way to
          make a phone screen feel like paperwork. */}
      <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-400">{subtitle}</p>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * `who` is relative to the MEMBER, not the clinic.
 *
 * The system we are replacing stores a single `direction` field written from
 * the staff point of view and then renders every bubble with the outbound
 * style, so a member reading their own history sees their coach's replies
 * styled as if the member had sent them. Anchoring the field to the reader
 * makes that class of bug structurally hard to write.
 */
export interface PortalMessage {
  id: string;
  at: string;
  who: "me" | "team";
  /** Display name of the sender. For `me` this is the member's first name. */
  from: string;
  /** Sender's role, shown on team messages so "who is this?" is never a question. */
  role?: string;
  body: string;
  channel: "Portal" | "SMS";
  /** Team messages only — set once the member has opened the thread. */
  readAt?: string;
}

/**
 * Fallback thread.
 *
 * The brief points at `contactLogForClient` from `lib/mock/contactLog.ts`; that
 * module does not exist in the tree yet, and a portal page that fails to
 * compile because a sibling module is late is a worse outcome than a local
 * array. When contactLog lands, delete this and map its rows into
 * `PortalMessage` — keep the `who` field member-relative.
 *
 * Fully static (no Date.now, no random) so the demo reads identically forever.
 */
export const MEMBER_THREAD: PortalMessage[] = [
  {
    id: "msg-01",
    at: "2026-05-28T08:12:00",
    who: "team",
    from: "Tyler Brooks",
    role: "Your coach",
    body:
      "Morning Jake — your June panel is booked for the 1st. Fast from 10pm the night before, water is fine. I'll have the results in front of me before our follow-up.",
    channel: "Portal",
    readAt: "2026-05-28T08:40:00",
  },
  {
    id: "msg-02",
    at: "2026-05-28T08:41:00",
    who: "me",
    from: "Jake",
    body: "Got it. Can I still do my morning lift before the draw or should I skip it?",
    channel: "Portal",
  },
  {
    id: "msg-03",
    at: "2026-05-28T09:05:00",
    who: "team",
    from: "Tyler Brooks",
    role: "Your coach",
    body:
      "Skip it that morning. Training moves a few of the markers around and I'd rather compare a clean number to your March panel.",
    channel: "Portal",
    readAt: "2026-05-28T09:20:00",
  },
  {
    id: "msg-04",
    at: "2026-06-02T16:30:00",
    who: "team",
    from: "Tyler Brooks",
    role: "Your coach",
    body:
      "Results are in and Dr. Vale has reviewed them. Short version: your A1C moved the right direction and your energy markers are steady. Full detail is on your Labs page whenever you want it.",
    channel: "Portal",
    readAt: "2026-06-02T18:02:00",
  },
  {
    id: "msg-05",
    at: "2026-06-02T18:04:00",
    who: "me",
    from: "Jake",
    body: "Nice. The 5.9 is the one I care about — is that still the thing we're chasing?",
    channel: "Portal",
  },
  {
    id: "msg-06",
    at: "2026-06-03T07:55:00",
    who: "team",
    from: "Tyler Brooks",
    role: "Your coach",
    body:
      "It is. That single number is why your protein target went up and why we added the two easy-pace walks. Tap it on your Protocol page and you'll see it listed as the reason.",
    channel: "Portal",
    readAt: "2026-06-03T08:10:00",
  },
  {
    id: "msg-07",
    at: "2026-06-09T12:20:00",
    who: "team",
    from: "Alpha Health Raleigh",
    role: "Front desk",
    body:
      "Your refill shipped this morning — tracking is on your home page and it updates on its own, so you won't need to ask us where it is.",
    channel: "SMS",
    readAt: "2026-06-09T12:41:00",
  },
  {
    id: "msg-08",
    at: "2026-06-10T19:14:00",
    who: "me",
    from: "Jake",
    body: "Sleep has been rough this week — worth mentioning at the follow-up on the 15th?",
    channel: "Portal",
  },
  {
    id: "msg-09",
    at: "2026-06-11T08:02:00",
    who: "team",
    from: "Tyler Brooks",
    role: "Your coach",
    body:
      "Definitely. I've flagged it on the visit so Dr. Vale sees it before you walk in. Jot down roughly what time you're waking up — that detail usually decides what we change.",
    channel: "Portal",
    readAt: "2026-06-11T08:15:00",
  },
];
