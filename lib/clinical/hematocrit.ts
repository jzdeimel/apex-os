import { biomarker } from "@/lib/mock/labs";
import { getClient } from "@/lib/mock/clients";

/**
 * Haematocrit management + blood-donation tracking.
 *
 * WHY IT IS ITS OWN SURFACE
 * -------------------------
 * Erythrocytosis — the blood thickening as red-cell mass climbs — is the single
 * most common real complication of testosterone therapy, and it is the one the
 * whole titration loop is gated on. It also has a specific, non-drug lever that
 * nothing else in the protocol has: giving blood. A therapeutic phlebotomy, or
 * an ordinary Red Cross donation, drops haematocrit by roughly three points and
 * buys room to keep the member on an effective dose. That lever needs its own
 * place to live: the trend, the thresholds a provider acts on, and a log of
 * donations with the next eligible date.
 *
 * THE THRESHOLDS ARE THE STANDARD ONES, STATED PLAINLY
 * ----------------------------------------------------
 * Reference ceiling around 48–49%, a caution zone as it climbs past ~52%, and a
 * hold-and-evaluate line at 54% — the figure the Endocrine Society uses to say
 * testosterone should be held and the cause evaluated. Apex draws the lines and
 * shows where the member sits against them. It does not hold the dose itself;
 * that is the titration assistant's gate and the provider's decision.
 */

/** Red Cross whole-blood interval. Therapeutic phlebotomy can be more frequent. */
export const DONATION_INTERVAL_DAYS = 56;
export const CAUTION_HCT = 52;
export const HOLD_HCT = 54;
/** A donation drops haematocrit by roughly this much — a rule of thumb, not a promise. */
export const DROP_PER_DONATION = 3;

export type HctZone = "in-range" | "watch" | "caution" | "hold";

export function zoneFor(hct: number, refHigh: number): HctZone {
  if (hct >= HOLD_HCT) return "hold";
  if (hct >= CAUTION_HCT) return "caution";
  if (hct > refHigh) return "watch";
  return "in-range";
}

export const ZONE_COPY: Record<HctZone, { label: string; clinical: string }> = {
  "in-range": {
    label: "In range",
    clinical: "Haematocrit is within the reference range. Standard monitoring on the protocol interval.",
  },
  watch: {
    label: "Above reference",
    clinical:
      "Above the reference ceiling but below the caution line. Confirm hydration and sleep before acting — both move this number — and recheck.",
  },
  caution: {
    label: "Caution — 52%+",
    clinical:
      "In the range where a provider commonly recommends a blood donation and holds dose increases. Not yet the hold line, but trending there.",
  },
  hold: {
    label: "Hold line — 54%+",
    clinical:
      "At or above the 54% line where guidance is to hold testosterone and evaluate the cause. Therapeutic phlebotomy is the usual next step. Provider decision.",
  },
};

export interface HctView {
  hasData: boolean;
  value: number | null;
  unit: string;
  refHigh: number;
  refLow: number;
  zone: HctZone;
  trend: "rising" | "falling" | "flat" | null;
  delta: number | null;
  series: { date: string; value: number }[];
}

export function hematocritView(clientId: string): HctView {
  const b = biomarker(clientId, "hct");
  if (!b) {
    return { hasData: false, value: null, unit: "%", refHigh: 48.6, refLow: 38.3, zone: "in-range", trend: null, delta: null, series: [] };
  }
  const series = [...(b.history ?? [])];
  if (!series.length || series[series.length - 1].value !== b.value) {
    series.push({ date: "now", value: b.value });
  }
  const first = series[0]?.value;
  const delta = series.length >= 2 && first !== undefined ? Math.round((b.value - first) * 10) / 10 : null;
  const trend = delta === null ? null : delta > 0.1 ? "rising" : delta < -0.1 ? "falling" : "flat";
  return {
    hasData: true,
    value: b.value,
    unit: b.unit,
    refHigh: b.refHigh,
    refLow: b.refLow,
    zone: zoneFor(b.value, b.refHigh),
    trend,
    delta,
    series,
  };
}

/** Days from a donation to the next eligible whole-blood donation. */
export function nextEligible(lastDonationIso: string, nowIso: string): { eligible: boolean; days: number } {
  const last = new Date(lastDonationIso).getTime();
  const now = new Date(nowIso).getTime();
  const elapsedDays = Math.floor((now - last) / 86_400_000);
  const remaining = DONATION_INTERVAL_DAYS - elapsedDays;
  return { eligible: remaining <= 0, days: Math.max(0, remaining) };
}

export function clientOnTherapy(clientId: string): boolean {
  const c = getClient(clientId);
  return !!c?.programs.some((p) => p.category === "Hormone optimization discussion" && p.status === "Active");
}
