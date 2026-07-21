"use client";

/**
 * Sign-out, and the sensitive-data cleanup that must ride with it.
 *
 * Apex keeps some member data in localStorage at this stage — the daily health
 * log, the donation log, break-glass grants, coach reactions, and which member
 * the portal is viewing. On a SHARED clinic workstation that survives logout,
 * which means the next person at the keyboard could open the browser and read
 * the last member's data. So sign-out clears those keys before it hands off to
 * the identity provider's logout.
 *
 * Non-sensitive preferences (the persona choice, the motion toggle) are left
 * alone — they are not PHI and clearing them just makes the app feel forgetful.
 *
 * The right end state is that none of this is in localStorage at all (it moves
 * server-side with the write paths). Until then, clearing on sign-out is the
 * floor.
 */

/** localStorage keys that hold member/clinical data and must not outlive a session. */
const SENSITIVE_KEYS = [
  "apex_member_log_v2", // daily dose + symptom log
  "apex_donations_v1", // blood-donation log
  "apex_breakglass_v1", // emergency-access grants (carry clientId + reason)
  "apex_coach_reactions_v1", // coach reactions to member logs
  "apex_demo_member_v1", // which member the portal is acting as
];

/**
 * Dynamic key prefixes to sweep. Consult drafts USED to autosave to
 * `apex.consult.draft.${clientId}` — unsigned clinical PHI, one key per client,
 * so no fixed list could name them. Current builds write these server-side and
 * never create the key, but a workstation that ran an older build may still hold
 * drafts; this purges them at the next sign-out so they cannot outlive a session.
 */
const SENSITIVE_PREFIXES = ["apex.consult.draft."];

export function clearSensitiveStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of SENSITIVE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* private mode / quota — nothing to clear */
    }
  }
  // Prefix sweep for dynamic keys. Collect first, then remove — mutating
  // localStorage while iterating its indices skips entries.
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && SENSITIVE_PREFIXES.some((p) => k.startsWith(p))) doomed.push(k);
    }
    for (const k of doomed) window.localStorage.removeItem(k);
  } catch {
    /* private mode / quota — nothing to clear */
  }
}

/** Clear sensitive local data, then hand off to the EasyAuth logout endpoint. */
export function signOut(): void {
  clearSensitiveStorage();
  // Azure Container Apps EasyAuth logout — clears the auth cookie and the
  // provider session, then returns to the entry screen.
  window.location.href = "/.auth/logout?post_logout_redirect_uri=/";
}
