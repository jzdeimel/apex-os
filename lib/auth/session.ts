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

export function clearSensitiveStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of SENSITIVE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* private mode / quota — nothing to clear */
    }
  }
}

/** Clear sensitive local data, then hand off to the EasyAuth logout endpoint. */
export function signOut(): void {
  clearSensitiveStorage();
  // Azure Container Apps EasyAuth logout — clears the auth cookie and the
  // provider session, then returns to the entry screen.
  window.location.href = "/.auth/logout?post_logout_redirect_uri=/";
}
