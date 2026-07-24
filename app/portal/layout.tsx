"use client";

import { MemberLogProvider } from "@/lib/member/logStore";
import { useMe } from "@/components/portal/PortalHeader";
import { CelebrationProvider } from "@/components/celebrate/CelebrationProvider";

/**
 * Everything under /portal shares one member log.
 *
 * AUDIT FINDING (docs/audit/ENGAGEMENT.md, friction inventory #1): this file did
 * not exist. `MemberLogProvider` was mounted on `app/portal/page.tsx` — a PAGE,
 * not a layout — so the context was scoped to the portal home and `useMemberLog`
 * threw on every other portal route. Logging was physically impossible anywhere
 * except `/portal`, which is why weight, feel and dose logging had all collected
 * onto a single screen: it was the only screen where they could work at all.
 *
 * Moving it here is what makes the habit loop addressable from the routes a
 * member actually visits — /portal/protocol, /portal/progress, /portal/journal —
 * without each of them standing up its own provider and its own private copy of
 * the day.
 *
 * WHY A CLIENT COMPONENT. The provider holds React state and reads localStorage,
 * and `useMe()` is a hook. Marking the boundary here rather than reaching across
 * it keeps the module graph honest; the layout renders nothing itself, so
 * nothing is lost to the client bundle that was not already going there.
 *
 * The subject comes from `useMe()`, not the `ME` constant, so switching the demo
 * member switches whose log is open. The store keys storage by client id and
 * refuses to write one member's log under another's key while that switch is in
 * flight — see the `owner` note in lib/member/logStore.tsx.
 */

/**
 * The pinned demo clock.
 *
 * Duplicated from `app/portal/page.tsx` rather than imported: a page's exports
 * are its own business and a layout importing a constant out of one of its
 * children is a dependency pointing the wrong way. Both values are the same
 * pinned instant, and it is pinned precisely so that "now" is never
 * `new Date()` — a real clock here would make the server and the client
 * disagree on the date at midnight and desynchronise every logged day.
 */
const NOW = "2026-06-12T09:00:00";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const meId = useMe();
  return (
    <MemberLogProvider clientId={meId} nowIso={NOW}>
      <CelebrationProvider>{children}</CelebrationProvider>
    </MemberLogProvider>
  );
}
