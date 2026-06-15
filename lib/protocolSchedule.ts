// =============================================================================
// Apex — Client protocol SCHEDULE builder (cadence/timing only)
// IMPORTANT: This generates a dose-free scheduling scaffold. It NEVER produces
// dosing. Frequency, dose, and route are confirmed/completed by the provider.
// =============================================================================

import type { Client } from "@/lib/types";
import { recommendationsForClient } from "@/lib/mock/recommendations";

export type Cadence = "Daily" | "5x / week" | "3x / week" | "2x / week" | "Weekly" | "Provider-defined";

export const CADENCE_OPTIONS: Cadence[] = [
  "Daily",
  "5x / week",
  "3x / week",
  "2x / week",
  "Weekly",
  "Provider-defined",
];

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Which weekdays a cadence lands on (sample pattern — provider confirms).
export function cadenceDays(c: Cadence): boolean[] {
  switch (c) {
    case "Daily":
      return [true, true, true, true, true, true, true];
    case "5x / week":
      return [true, true, true, true, true, false, false];
    case "3x / week":
      return [true, false, true, false, true, false, false];
    case "2x / week":
      return [true, false, false, true, false, false, false];
    case "Weekly":
      return [true, false, false, false, false, false, false];
    default:
      return [false, false, false, false, false, false, false];
  }
}

// Informational route + a SAMPLE cadence for a candidate (no dose).
const ROUTE: Record<string, { route: string; sampleCadence: Cadence; timing: string[] }> = {
  "BPC-157": { route: "SC injection", sampleCadence: "Daily", timing: ["AM"] },
  "GHK-Cu": { route: "SC injection", sampleCadence: "5x / week", timing: ["PM"] },
  "NAD+": { route: "IV / SC", sampleCadence: "Weekly", timing: ["AM"] },
  "PT-141": { route: "SC injection", sampleCadence: "Provider-defined", timing: ["PM"] },
  "VIP nasal spray": { route: "Nasal spray", sampleCadence: "Daily", timing: ["AM", "PM"] },
  "Ibutamoren / MK-677": { route: "Oral", sampleCadence: "Daily", timing: ["PM"] },
  Semaglutide: { route: "SC injection", sampleCadence: "Weekly", timing: ["AM"] },
  Tirzepatide: { route: "SC injection", sampleCadence: "Weekly", timing: ["AM"] },
  Tesofensine: { route: "Oral", sampleCadence: "Daily", timing: ["AM"] },
  "Testosterone / hormone optimization discussion": { route: "IM / SC injection", sampleCadence: "Weekly", timing: ["AM"] },
  "Thyroid optimization discussion": { route: "In-clinic review", sampleCadence: "Provider-defined", timing: ["AM"] },
  "Nutrition coaching": { route: "Coaching session", sampleCadence: "Weekly", timing: ["Midday"] },
  "Body scan follow-up": { route: "In-clinic scan", sampleCadence: "Provider-defined", timing: ["Midday"] },
  "Aesthetics consult": { route: "In-clinic consult", sampleCadence: "Provider-defined", timing: ["Midday"] },
};

export interface ScheduleItem {
  name: string;
  category: string;
  route: string;
  sampleCadence: Cadence;
  timing: string[];
  source: "approved" | "candidate" | "program";
}

export function buildScheduleItems(client: Client): ScheduleItem[] {
  const recs = recommendationsForClient(client.id);
  const seen = new Set<string>();
  const items: ScheduleItem[] = [];

  // Approved recommendations first, then their candidate options, then programs.
  const ordered = [...recs].sort((a, b) =>
    a.status === "provider approved" ? -1 : b.status === "provider approved" ? 1 : 0,
  );

  for (const r of ordered) {
    for (const cand of r.candidates) {
      if (seen.has(cand.name)) continue;
      seen.add(cand.name);
      const meta = ROUTE[cand.name] ?? { route: "Provider-defined", sampleCadence: "Provider-defined" as Cadence, timing: ["AM"] };
      items.push({
        name: cand.name,
        category: r.category,
        route: meta.route,
        sampleCadence: meta.sampleCadence,
        timing: meta.timing,
        source: r.status === "provider approved" ? "approved" : "candidate",
      });
    }
  }

  // Always include programs the client is already on.
  for (const p of client.programs) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    items.push({
      name: p.name,
      category: p.category,
      route: "Program",
      sampleCadence: "Weekly",
      timing: ["Midday"],
      source: "program",
    });
  }

  return items;
}

export interface Checkpoint {
  week: number;
  label: string;
}
export const DEFAULT_CHECKPOINTS: Checkpoint[] = [
  { week: 0, label: "Protocol start — provider confirms dose, frequency & route" },
  { week: 4, label: "Coach check-in (tolerance, adherence, goals)" },
  { week: 6, label: "Follow-up labs (Alpha Base Panel)" },
  { week: 8, label: "Body composition re-scan" },
  { week: 12, label: "Provider review & protocol adjustment" },
];
