import type { PlanItem } from "@/lib/planOfCare/types";

/**
 * Translation layer between the plan engine and the member.
 *
 * `PlanItem.because[]` and `PlanItem.detail` are STAFF artefacts. `because` is
 * rule-engine trace output — `"Lab: elevated A1C"`, `"Goal: Energy"`,
 * `"Hemoglobin A1c 5.9 — high"` — and `detail` is `suggestedNextStep`, a
 * third-person instruction addressed to a clinician ("Provider to review
 * sexual-wellness options").
 *
 * Rendering either one straight to a member does two bad things at once: it
 * shows them a debug string, and in the case of a bare `"high"` next to their
 * own lab number at 6am, it hands them an unexplained panic word with no
 * clinician attached to it.
 *
 * So the boundary is explicit and lives here. Staff surfaces keep reading the
 * raw fields; the member portal reads these.
 */

/** Raw BiomarkerStatus words a member should never see unaccompanied. */
const STATUS_WORDS: Record<string, string> = {
  optimal: "right where we want it",
  watch: "worth keeping an eye on",
  low: "below where we'd like it",
  high: "above where we'd like it",
};

/**
 * Turn one trace line into a sentence.
 *
 * Prefixes carry the meaning, so they become the sentence stem rather than
 * being stripped: a member should understand WHY something is evidence, not
 * just that it is.
 */
export function memberReason(line: string): string {
  const trimmed = line.trim();

  // "Hemoglobin A1c 5.9 — high" → "Your Hemoglobin A1c came back at 5.9, above where we'd like it."
  const labMatch = /^(.+?)\s+([\d.]+\s*\S*)\s+—\s+(optimal|watch|low|high)$/i.exec(trimmed);
  if (labMatch) {
    const [, marker, value, status] = labMatch;
    return `Your ${marker} came back at ${value} — ${STATUS_WORDS[status.toLowerCase()] ?? status}.`;
  }

  const prefixed = /^(Goal|Symptom|Lab|Body scan|Program|Risk):\s*(.+)$/i.exec(trimmed);
  if (prefixed) {
    const [, kind, rest] = prefixed;
    const body = rest.charAt(0).toLowerCase() + rest.slice(1);
    switch (kind.toLowerCase()) {
      case "goal":
        return `Because you told us ${body} is what you're working toward.`;
      case "symptom":
        return `Because you mentioned ${body}.`;
      case "lab":
        return `Because your panel showed ${body}.`;
      case "body scan":
        return `Because your body scan showed ${body}.`;
      case "program":
        return `Because you're on ${rest}.`;
      case "risk":
        return `Because we're watching ${body}.`;
    }
  }

  // Anything the engine emits that we have not taught this function about is
  // shown as-is rather than dropped — silently losing a member's evidence is
  // worse than showing them an imperfect sentence.
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

export function memberReasons(item: PlanItem): string[] {
  const seen = new Set<string>();
  return item.because
    .map(memberReason)
    .filter((r) => {
      const key = r.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * A member-facing description of what an item is FOR.
 *
 * Deliberately does not attempt to describe the substance — that is clinical
 * copy a clinician should write, not something to infer from a name. It answers
 * the question the member is actually asking, which is "why is this on my
 * plan and who decides it", and leaves the pharmacology to the consult.
 */
export function memberSummary(item: PlanItem): string {
  if (item.section === "nutrition" || item.section === "training") {
    return item.detail;
  }
  if (item.requiresProviderApproval) {
    return `Proposed as part of your plan. ${
      item.category ? `Aimed at ${item.category.toLowerCase()}. ` : ""
    }Your provider confirms whether it's right for you and sets the amount.`;
  }
  return item.detail;
}
