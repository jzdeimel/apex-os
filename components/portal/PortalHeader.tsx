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

import { useEffect, useState } from "react";
import type { Client } from "@/lib/types";
import { getClient } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";
import { isDemoMemberId } from "@/lib/viewer";
import { IS_DEMO_UI } from "@/lib/publicConfig";

/**
 * The DEFAULT demo member.
 *
 * In production this is the session's subject id, resolved server-side, and
 * nothing under /portal can change it — a member portal has exactly one
 * subject. That is still the shape of the code: every page asks for "the
 * subject" and never for "a subject of my choosing".
 *
 * What changed, and why: the audit (GAP_ANALYSIS.md, CLIENT table, "Portal
 * renderable as a woman", P0) found this constant was the only subject the
 * portal could ever have, which made the entire women's track — female lab
 * reference windows, the perimenopause education shelf, the female care-track
 * copy — unreachable in every demo ever given. The constant survives as the
 * default so all ~50 historic call sites keep resolving to Jake Morrison; the
 * selection lives beside it and is a DEMO AFFORDANCE only (see DEMO_MEMBERS in
 * lib/viewer.ts, and the picker in components/layout/PersonaSwitcher.tsx).
 */
export const ME = "c-001";

// ---------------------------------------------------------------------------
// Selected demo member — a tiny external store, deliberately not a context
// ---------------------------------------------------------------------------

/**
 * Why a module store rather than a React context like lib/portalStore.tsx.
 *
 * The two readers of this value sit on opposite sides of the tree: the portal
 * pages under /portal, and the persona switcher inside the app topbar. A
 * context would have to be provided above BOTH, i.e. in app/layout.tsx — a file
 * that half the app renders through and that this change has no other business
 * touching. A module-scoped store with explicit subscribers is reachable from
 * anywhere without adding a provider, and the trade it makes (no automatic
 * re-render for non-subscribers) is handled at the two call sites that care.
 */
const STORAGE_KEY = "apex_demo_member_v1";

let selectedMemberId: string = ME;
let restored = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

/**
 * Read persisted choice exactly once, from an effect — never during render.
 *
 * Reading localStorage while rendering would make the first client render
 * disagree with the server-rendered HTML and trip a hydration mismatch, which
 * in this app manifests as a blanked subtree rather than a console warning.
 * Same discipline as PortalProvider in lib/portalStore.tsx: hydrate in an
 * effect, guard it so it happens once, and validate what came back — a stale
 * id from an older build must not resolve to `undefined` and crash a page.
 */
function restoreOnce() {
  if (restored) return;
  restored = true;
  if (!IS_DEMO_UI) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isDemoMemberId(raw) && getClient(raw)) {
      selectedMemberId = raw;
      notify();
    }
  } catch {
    /* storage unavailable — the picker still works, it just won't persist */
  }
}

/** Switch the portal's subject. Demo only. */
export function setDemoMember(id: string) {
  if (!IS_DEMO_UI) return;
  if (!isDemoMemberId(id) || !getClient(id)) return;
  selectedMemberId = id;
  try {
    if (id === ME) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* no-op */
  }
  notify();
}

/**
 * The subject id every portal surface should render.
 *
 * Returns `ME` on the server and on the first client render, which is what
 * keeps hydration honest; the stored choice arrives one commit later via the
 * effect below. `sync()` runs again after subscribing so it does not matter
 * whether this component's effect ran before or after whichever one happened to
 * perform the restore — effects fire child-first and the order between siblings
 * is not something to rely on.
 */
export function useMe(): string {
  const [id, setId] = useState(ME);
  useEffect(() => {
    const sync = () => setId(selectedMemberId);
    listeners.add(sync);
    restoreOnce();
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return id;
}

/** The subject record. Convenience so pages don't repeat the non-null assertion. */
export function useMeClient(): Client {
  const id = useMe();
  // Falls back rather than asserting: a persisted id whose seed record was
  // renamed or removed would otherwise take a whole portal page down with an
  // undefined dereference, and a demo that crashes teaches nothing.
  return getClient(id) ?? getClient(ME)!;
}

/**
 * Non-reactive accessor, kept for the handful of callers outside /portal that
 * are not in a position to subscribe (components/layout/Topbar.tsx). It reads
 * the live selection, so it is correct on any render that happens after a
 * switch — the picker forces one — but it will not re-render a component on its
 * own. Prefer `useMeClient()` inside the portal.
 */
export function me(): Client {
  return getClient(selectedMemberId) ?? getClient(ME)!;
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
      <h1 className="mt-2 font-display text-display leading-[1.05] tracking-tight text-ink-50">
        {title}
      </h1>
      {/* max-w-prose rather than full-bleed: long measure is the fastest way to
          make a phone screen feel like paperwork.
          mt-4, not mt-3: the title owns the screen, and the gap under it is the
          main thing that says so. */}
      <p className="mt-4 max-w-prose text-body leading-relaxed text-ink-400">{subtitle}</p>
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

/**
 * The thread for whichever member the demo is currently rendering.
 *
 * The array above is written for Jake specifically — it names him, and three of
 * its messages quote HIS A1C. Find-and-replacing the first name would have been
 * the cheap fix and it would have been a lie: it would put "your A1C moved the
 * right direction… the 5.9 is the one I care about" into a thread belonging to
 * a member whose panel has no such value. So the tuned thread stays bound to
 * the member it was written about, and every other subject gets a shorter one
 * that asserts no numbers at all — it references their real coach and their
 * real next-visit date and stops there.
 *
 * Static timestamps, consistent with the pinned demo clock. No Date.now().
 */
export function threadFor(client: Client): PortalMessage[] {
  if (client.id === ME) return MEMBER_THREAD;

  const coach = staffMap[client.coachId];
  const coachName = coach?.name ?? "Your coach";
  const first = client.firstName;

  return [
    {
      id: "msg-g1",
      at: "2026-06-02T08:15:00",
      who: "team",
      from: coachName,
      role: "Your coach",
      body: `Morning ${first} — your panel is back and ${
        staffMap[client.providerId]?.name ?? "your provider"
      } has reviewed it. Everything worth talking about is on your Labs page, and we'll go through it together rather than you having to decode it alone.`,
      channel: "Portal",
      readAt: "2026-06-02T08:52:00",
    },
    {
      id: "msg-g2",
      at: "2026-06-02T09:03:00",
      who: "me",
      from: first,
      body: "Had a look. A couple of the markers I don't recognise — can we cover those?",
      channel: "Portal",
    },
    {
      id: "msg-g3",
      at: "2026-06-02T09:40:00",
      who: "team",
      from: coachName,
      role: "Your coach",
      body: "Absolutely — that's what the follow-up is for. Tap any marker on the Labs page and it explains itself in plain language, so bring whichever ones are still bothering you after that.",
      channel: "Portal",
      readAt: "2026-06-02T10:11:00",
    },
    {
      id: "msg-g4",
      at: "2026-06-09T12:20:00",
      who: "team",
      from: "Alpha Health",
      role: "Front desk",
      body: "Reminder that your next visit is on the calendar — it's on your home page, and it updates itself if anything moves.",
      channel: "SMS",
      readAt: "2026-06-09T12:44:00",
    },
    {
      id: "msg-g5",
      at: "2026-06-10T19:02:00",
      who: "me",
      from: first,
      body: "Got it, thanks. I'll write down the questions before I come in.",
      channel: "Portal",
    },
  ];
}
