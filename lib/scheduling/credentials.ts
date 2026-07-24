/**
 * CLINICAL CREDENTIALS — the axis scheduling actually turns on.
 *
 * WHY THIS IS NOT `StaffRole`
 * ---------------------------
 * `StaffRole` is `"Admin" | "Coach" | "Medical"` and it answers an
 * AUTHORIZATION question: may this person write a prescription, sign an
 * encounter, read the ledger. That question has three answers and three is
 * right for it.
 *
 * Scheduling asks a different question — *what is this person licensed to
 * perform* — and three answers is catastrophically wrong for it. Under
 * `StaffRole` alone, the Myrtle Beach medical director and the Myrtle Beach
 * nurse are the same resource, so a booking engine picking "any Medical" for a
 * lab draw will happily consume an MD's afternoon drawing blood.
 *
 * Stephanie Butler's New Client Visit requirements (2026-07-21) state the
 * governing principle explicitly: *"Always utilize the lowest appropriate
 * clinical license capable of safely performing each task."* That sentence is
 * unimplementable against a three-value role, and implementing it backwards —
 * which is what happens today — burns exactly the provider capacity the rule
 * exists to protect.
 *
 * So: two orthogonal facts about a person. `StaffRole` decides what they may
 * WRITE. `CredentialClass` decides what they may PERFORM. Neither is derivable
 * from the other, and conflating them is the bug.
 */

/**
 * What a person is licensed to do, as a closed vocabulary.
 *
 * Mirrors `staff_credential.credential` in the schema, which already stores
 * "MD" | "DO" | "NP" | "PA-C" | "RN" | "MA" per state with licence numbers and
 * expiry. This is the same vocabulary with `PA-C` normalised to `PA` (the
 * certification suffix is a display detail, not a scheduling one) and the two
 * non-clinical classes the roster actually contains.
 */
export type CredentialClass =
  /** Physician. */
  | "MD"
  | "DO"
  /** Advanced practice provider. */
  | "NP"
  | "PA"
  /** Nursing. */
  | "RN"
  | "LPN"
  /** Medical assistant — clinical support, not a licensed provider. */
  | "MA"
  /** Performance coach. Not a clinical licence, and deliberately in the same
   *  vocabulary so a scheduling requirement can name it without a second type. */
  | "Coach"
  /** Front desk, operations, leadership. Performs no clinical component. */
  | "Admin";

/** Physicians. The priority-2 fallback for a physical. */
export const PHYSICIAN: readonly CredentialClass[] = ["MD", "DO"];

/** Advanced practice providers. Priority 1 for a physical, priority 2 for a draw. */
export const APP: readonly CredentialClass[] = ["NP", "PA"];

/** Nursing. Priority 1 for a lab draw. */
export const NURSING: readonly CredentialClass[] = ["RN", "LPN"];

/** Everyone who may sign a clinical record. Used to sanity-check role vs credential. */
export const PROVIDER_CLASSES: readonly CredentialClass[] = [...PHYSICIAN, ...APP];

/** Human-facing label. What a scheduler would say out loud. */
export const CREDENTIAL_LABEL: Record<CredentialClass, string> = {
  MD: "Physician (MD)",
  DO: "Physician (DO)",
  NP: "Nurse Practitioner",
  PA: "Physician Assistant",
  RN: "Registered Nurse",
  LPN: "Licensed Practical Nurse",
  MA: "Medical Assistant",
  Coach: "Performance Coach",
  Admin: "Operations",
};

/**
 * Parse the free-text `credentials` string carried on the seeded roster.
 *
 * The roster spreadsheet says "Nurse Practitioner", the seeded data says
 * "PA-C", and the schema says "PA". This is the one place that reconciles them,
 * and it returns null rather than guessing.
 *
 * NULL IS THE IMPORTANT RETURN VALUE. An unparseable credential must not
 * default to anything — defaulting to `MA` silently under-licenses someone and
 * defaulting to `NP` silently over-licenses them, and the second one puts an
 * unlicensed person in a physical exam. A null means "we do not know", and the
 * resolver treats not-knowing as not-schedulable for clinical components.
 */
export function parseCredential(text: string | null | undefined): CredentialClass | null {
  if (!text) return null;
  const t = text.trim().toUpperCase();

  if (t === "MD" || t.includes("PHYSICIAN") && !t.includes("ASSISTANT")) {
    // "Telehealth Physician" and "Medical Director" both land here only when
    // they do not also say "assistant" — "Physicians Assistant" is a PA.
    return t === "DO" ? "DO" : "MD";
  }
  if (t === "DO") return "DO";
  if (t.startsWith("NP") || t.includes("NURSE PRACTITIONER")) return "NP";
  if (t.startsWith("PA") || t.includes("PHYSICIAN ASSISTANT") || t.includes("PHYSICIANS ASSISTANT")) {
    return "PA";
  }
  if (t === "RN" || t.includes("REGISTERED NURSE")) return "RN";
  if (t === "LPN" || t.includes("LICENSED PRACTICAL")) return "LPN";
  // Bare "Nurse" is deliberately NOT resolved. RN and LPN differ in scope of
  // practice, that difference is state-specific, and Stephanie's spec makes LPN
  // lab draws conditional on it. Guessing here would encode a compliance
  // assumption in a string parser.
  if (t === "NURSE") return null;
  if (t === "MA" || t.includes("MEDICAL ASSISTANT")) return "MA";
  if (t.includes("COACH")) return "Coach";
  return null;
}

/** True when this credential may sign clinical records. */
export function isProvider(c: CredentialClass | null): boolean {
  return c !== null && PROVIDER_CLASSES.includes(c);
}
