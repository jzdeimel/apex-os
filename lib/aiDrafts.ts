// =============================================================================
// Apex — AI draft generators (deterministic, mock-data only)
// SOAP-style visit summaries + client follow-up messages.
// PROVIDER REVIEW REQUIRED. No dosing. No medical advice.
// =============================================================================

import type { Client } from "@/lib/types";
import { clientName } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { recommendationsForClient } from "@/lib/mock/recommendations";
import { staffName } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { formatDate } from "@/lib/utils";

const REVIEW = "DRAFT — AI-assisted. Requires review & finalization by a licensed provider. Not medical advice.";

export interface VisitSummary {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  disclaimer: string;
}

export function generateVisitSummary(client: Client): VisitSummary {
  const labs = getLabsForClient(client.id);
  const scan = getScanForClient(client.id);
  const recs = recommendationsForClient(client.id);
  const flagged = labs?.biomarkers.filter((b) => b.status !== "optimal") ?? [];

  const subjective =
    `${clientName(client)}, ${client.age}${client.sex === "male" ? "M" : "F"}, presents at ${locationName(client.locationId)} ` +
    `with goals of ${client.goals.join(", ").toLowerCase()}. ` +
    (client.symptoms.length
      ? `Reports ${client.symptoms.map((s) => s.toLowerCase()).join(", ")}.`
      : "No active symptoms reported.");

  const objectiveParts: string[] = [];
  if (labs) {
    objectiveParts.push(
      `Alpha Base Panel (${formatDate(labs.collectedOn)}): ${flagged.length} of ${labs.biomarkers.length} markers outside optimal` +
        (flagged.length
          ? ` — ${flagged.slice(0, 5).map((b) => `${b.name} ${b.value}${b.unit} (${b.status})`).join(", ")}.`
          : "."),
    );
  } else {
    objectiveParts.push("No labs currently on file.");
  }
  if (scan) {
    objectiveParts.push(
      `Body composition: ${scan.weightKg}kg, ${scan.bodyFatPct}% body fat, ${scan.skeletalMuscleKg}kg skeletal muscle, visceral fat level ${scan.visceralFatLevel}.`,
    );
  }
  const objective = objectiveParts.join(" ");

  const assessment =
    (client.riskFlags.length
      ? `Active considerations: ${client.riskFlags.map((f) => `${f.label} (${f.level}) — ${f.detail}`).join("; ")}. `
      : "No significant risk flags on file. ") +
    (recs.length
      ? `${recs.length} AI-assisted recommendation${recs.length > 1 ? "s" : ""} generated across ${new Set(recs.map((r) => r.category)).size} categories for provider review.`
      : "No recommendations currently generated.");

  const planLines = recs.slice(0, 4).map((r) => `• ${r.category}: ${r.suggestedNextStep}`);
  const plan =
    (planLines.length ? planLines.join("\n") : "• Continue current program; routine follow-up.") +
    `\n• Care team: ${staffName(client.providerId)} (provider), ${staffName(client.coachId)} (coach).` +
    `\n• Protocol details, dosing, and any prescribing to be added and approved by provider.`;

  return { subjective, objective, assessment, plan, disclaimer: REVIEW };
}

export function visitSummaryToText(s: VisitSummary): string {
  return [
    "VISIT SUMMARY (AI-assisted draft)",
    "",
    `S: ${s.subjective}`,
    "",
    `O: ${s.objective}`,
    "",
    `A: ${s.assessment}`,
    "",
    "P:",
    s.plan,
    "",
    s.disclaimer,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Follow-up message drafts (generic, non-medical, friendly)
// ---------------------------------------------------------------------------
export type MessageTone = "Check-in" | "Re-engagement" | "Results ready" | "Booking nudge";

export function generateFollowUpMessage(client: Client, tone: MessageTone): string {
  const first = client.firstName;
  switch (tone) {
    case "Results ready":
      return `Hi ${first}, great news — your latest results are in and your Alpha Health care team is reviewing them now. We'd love to walk you through what they mean and your next steps. Reply here or book a plan review whenever works for you.`;
    case "Re-engagement":
      return `Hi ${first}, we've been thinking about your goals (${client.goals.slice(0, 2).join(" & ").toLowerCase()}) and we're here whenever you're ready to pick things back up. Want me to set up a quick check-in to map out a simple next step?`;
    case "Booking nudge":
      return `Hi ${first}, it's been a little while since your last visit. Staying consistent is where the real progress happens — can we get your next ${client.locationId === "telehealth" ? "telehealth visit" : "appointment"} on the calendar this week?`;
    case "Check-in":
    default:
      return `Hi ${first}, checking in on how you're feeling and how things are going with your goals. Anything you'd like to focus on at your next visit? Your coach ${staffName(client.coachId).split(" ")[0]} is here to help.`;
  }
}
