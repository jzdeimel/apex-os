import { clients, clientName, getClient } from "@/lib/mock/clients";
import { biomarker } from "@/lib/mock/labs";
import { controlledSummary } from "@/lib/clinical/controlled";
import { zoneFor, CAUTION_HCT, HOLD_HCT } from "@/lib/clinical/hematocrit";
import { absolute } from "@/lib/utils";
import type { Client, LocationId } from "@/lib/types";

/**
 * Population-health risk radar — the whole clinic, across every location, in one
 * read.
 *
 * WHY IT IS ITS OWN THING AND NOT ANOTHER SAFETY WIDGET
 * -----------------------------------------------------
 * The clinic console already has SafetyWatch, but that is scoped to the persona
 * looking at it and framed per-member. What a medical director and an owner do
 * NOT have anywhere is the aggregate: every haematocrit past the caution line,
 * every out-of-range estradiol, every patient overdue for monitoring, every
 * lapsing prescriber credential — counted and listed ACROSS all four sites at
 * once. That is a different question ("where is my clinical risk concentrated")
 * from SafetyWatch's ("what should I know about this member"), and it is the one
 * a multi-site operator cannot answer from a spreadsheet.
 *
 * It reuses the same engines the per-member surfaces use — the HCT zones, the
 * biomarker store, the controlled-substance credential summary — so a number
 * here can never disagree with the number on the chart it came from.
 *
 * SCOPE IS HONOURED. Given the set of client ids a viewer may see (the owner
 * gets all; a medical director gets their locations), the radar only aggregates
 * within it. The credential list is clinic-wide because a lapsing DEA is not a
 * per-location fact.
 */

const TRT_CATEGORY = "Hormone optimization discussion";
/** On testosterone therapy — monitoring obligations attach to these members. */
function onTherapy(c: Client): boolean {
  return c.programs.some((p) => p.category === TRT_CATEGORY && p.status === "Active");
}

/** A member on therapy should have a panel at least this recently. */
export const LAB_OVERDUE_DAYS = 120;
const NOW = absolute("2026-06-12T09:00:00").getTime();

export type RiskSeverity = "urgent" | "action" | "watch";

export interface RiskItem {
  clientId: string;
  clientName: string;
  locationId: LocationId;
  value: string;
  detail: string;
  severity: RiskSeverity;
}

export interface CredentialItem {
  staffId: string;
  name: string;
  issue: string;
  date: string;
  severity: RiskSeverity;
}

export interface PopulationRisk {
  scopeSize: number;
  hematocrit: RiskItem[];
  estradiol: RiskItem[];
  overdueLabs: RiskItem[];
  credentials: CredentialItem[];
  counts: { hematocrit: number; estradiol: number; overdueLabs: number; credentials: number };
}

function daysSince(iso: string): number {
  return Math.floor((NOW - absolute(iso).getTime()) / 86_400_000);
}

/**
 * Aggregate clinical risk across a set of visible clients.
 *
 * @param visibleIds the client ids this viewer may see. Owner passes every id;
 *   a medical director passes their location's ids. Nothing outside the set is
 *   ever counted, so the radar can never leak a member the viewer could not open.
 */
export function populationRisk(visibleIds: Set<string>): PopulationRisk {
  const inScope = clients.filter((c) => visibleIds.has(c.id));

  const hematocrit: RiskItem[] = [];
  const estradiol: RiskItem[] = [];
  const overdueLabs: RiskItem[] = [];

  for (const c of inScope) {
    // Haematocrit past the caution line, anyone (therapy raises it, but a high
    // HCT matters regardless of why).
    const hct = biomarker(c.id, "hct");
    if (hct && hct.value >= CAUTION_HCT) {
      const zone = zoneFor(hct.value, hct.refHigh);
      hematocrit.push({
        clientId: c.id,
        clientName: clientName(c),
        locationId: c.locationId,
        value: `${hct.value}%`,
        detail: zone === "hold" ? "At/above the 54% hold line" : "In the 52%+ caution zone",
        severity: zone === "hold" ? "urgent" : "action",
      });
    }

    // Estradiol out of the optimal window, for members on therapy (where it is
    // being actively managed).
    const e2 = biomarker(c.id, "estradiol");
    if (e2 && onTherapy(c)) {
      const optLo = e2.optimalLow ?? e2.refLow;
      const optHi = e2.optimalHigh ?? e2.refHigh;
      if (e2.value > optHi || e2.value < optLo) {
        estradiol.push({
          clientId: c.id,
          clientName: clientName(c),
          locationId: c.locationId,
          value: `${e2.value} ${e2.unit}`,
          detail: e2.value > optHi ? "Above optimal — review symptoms, avoid reflexive AI" : "Below optimal — check for over-suppression",
          severity: "watch",
        });
      }
    }

    // Overdue monitoring: on therapy, and either no panel on file or one older
    // than the monitoring interval.
    if (onTherapy(c)) {
      if (!c.latestLabDate) {
        overdueLabs.push({
          clientId: c.id,
          clientName: clientName(c),
          locationId: c.locationId,
          value: "no panel",
          detail: "On therapy with no panel on file in Apex",
          severity: "action",
        });
      } else {
        const d = daysSince(c.latestLabDate);
        if (d > LAB_OVERDUE_DAYS) {
          overdueLabs.push({
            clientId: c.id,
            clientName: clientName(c),
            locationId: c.locationId,
            value: `${d}d`,
            detail: `Last panel ${d} days ago — past the ${LAB_OVERDUE_DAYS}-day monitoring interval`,
            severity: d > LAB_OVERDUE_DAYS * 1.5 ? "action" : "watch",
          });
        }
      }
    }
  }

  const sev = (s: RiskSeverity) => (s === "urgent" ? 0 : s === "action" ? 1 : 2);
  hematocrit.sort((a, b) => sev(a.severity) - sev(b.severity) || b.value.localeCompare(a.value));
  estradiol.sort((a, b) => sev(a.severity) - sev(b.severity));
  overdueLabs.sort((a, b) => sev(a.severity) - sev(b.severity));

  // Credentials are clinic-wide, from the controlled-substance summary.
  const credentials: CredentialItem[] = controlledSummary().credentialIssues.map((c) => ({
    staffId: c.staffId,
    name: c.name,
    issue: c.issue,
    date: c.date,
    severity: /expired/i.test(c.issue) ? "urgent" : "watch",
  }));

  return {
    scopeSize: inScope.length,
    hematocrit,
    estradiol,
    overdueLabs,
    credentials,
    counts: {
      hematocrit: hematocrit.length,
      estradiol: estradiol.length,
      overdueLabs: overdueLabs.length,
      credentials: credentials.length,
    },
  };
}
