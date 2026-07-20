import { absolute, seededRandom } from "@/lib/utils";
import { clients } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";
import {
  computeDraw,
  computeDrawFromSolution,
  type DrawResult,
  type MassUnit,
  type SyringeStandard,
} from "@/lib/dosing/reconstitution";

/**
 * Signed prescriptions — the only place in Apex where a dose exists.
 *
 * WHY THIS IS ALLOWED TO CARRY A DOSE WHEN NOTHING ELSE IS
 * --------------------------------------------------------
 * The rest of the system is deliberately dose-free. The peptide library carries
 * none, `PlanItem` says "Route/cadence WITHOUT dose" in its own type, and an AI
 * proposal names a compound and a rationale and stops there. That is not
 * squeamishness — a dose asserted by software nobody signed is a fabrication
 * with a needle on the end of it.
 *
 * A prescription is the opposite case. A licensed provider decided an amount and
 * put their name on it. Displaying that back is not the system making a clinical
 * claim; it is the system reporting one, and reporting it clearly is a safety
 * win rather than a risk. Every record here therefore REQUIRES `signedByStaffId`
 * and `signedAt` — the type will not let an unsigned dose exist.
 *
 * WHAT A MEMBER ACTUALLY NEEDS
 * ----------------------------
 * Not "0.25mg". A member holds a vial of powder and an insulin syringe, and the
 * distance between the prescription and the syringe is a reconstitution step and
 * two unit conversions. So each record carries how the vial was prepared, and
 * the draw is computed rather than transcribed. See lib/dosing/reconstitution.ts.
 *
 * DEMO DATA. The amounts below are the seeded orders of a fictional provider for
 * synthetic members. They are internally consistent so the arithmetic
 * demonstrates properly. They are not guidance, and every surface that renders
 * them names the signing clinician.
 */

/** How the product is supplied, which decides whether there is a mixing step. */
export type Supply =
  | {
      kind: "lyophilised";
      vialAmount: number;
      vialUnit: MassUnit;
      /** Millilitres of bacteriostatic water added. Null when nobody recorded it. */
      diluentMl: number | null;
    }
  | {
      kind: "solution";
      /** Strength as printed on the vial, per millilitre. */
      amountPerMl: number;
      unit: MassUnit;
    };

export interface Prescription {
  id: string;
  clientId: string;
  /** Catalogue SKU, so this joins to inventory, orders and lot history. */
  sku: string;
  /** Peptide-library key where one exists, so the member can read up on it. */
  libraryKey?: string;
  name: string;
  supply: Supply;
  doseAmount: number;
  doseUnit: MassUnit;
  syringe: SyringeStandard;
  /** Which weekdays it is taken. 0 = Sunday, matching Date#getUTCDay. */
  days: number[];
  timeOfDay: "Morning" | "Evening";
  /** A dose exists only with a signature behind it. Both fields are required. */
  signedByStaffId: string;
  signedAt: string;
  /** Site rotation applies to subcutaneous injections. */
  rotateSites: boolean;
}

/**
 * Per-compound supply and dose templates.
 *
 * Chosen so the reconstitution arithmetic lands on readable syringe marks, which
 * is what a demo needs to show the feature working. Testosterone cypionate is
 * the deliberate odd one out: it is an oil supplied at strength, with no mixing
 * step, and modelling it as a powder would invent a step that does not exist.
 */
const TEMPLATES: {
  sku: string;
  libraryKey?: string;
  name: string;
  supply: Supply;
  doseAmount: number;
  doseUnit: MassUnit;
  days: number[];
  timeOfDay: "Morning" | "Evening";
  rotateSites: boolean;
}[] = [
  {
    sku: "PEP-BPC-5MG",
    libraryKey: "bpc-157",
    name: "BPC-157",
    supply: { kind: "lyophilised", vialAmount: 5, vialUnit: "mg", diluentMl: 2 },
    doseAmount: 250,
    doseUnit: "mcg",
    days: [1, 2, 3, 4, 5],
    timeOfDay: "Morning",
    rotateSites: true,
  },
  {
    sku: "GLP-SEMA-2.5",
    libraryKey: "semaglutide",
    name: "Semaglutide",
    supply: { kind: "lyophilised", vialAmount: 2.5, vialUnit: "mg", diluentMl: 1 },
    doseAmount: 0.25,
    doseUnit: "mg",
    days: [0],
    timeOfDay: "Morning",
    rotateSites: true,
  },
  {
    sku: "GLP-TIRZ-5",
    libraryKey: "tirzepatide",
    name: "Tirzepatide",
    supply: { kind: "lyophilised", vialAmount: 5, vialUnit: "mg", diluentMl: 2 },
    doseAmount: 2.5,
    doseUnit: "mg",
    days: [3],
    timeOfDay: "Evening",
    rotateSites: true,
  },
  {
    sku: "PEP-IPACJC-10",
    libraryKey: "ipamorelin",
    name: "Ipamorelin / CJC-1295",
    supply: { kind: "lyophilised", vialAmount: 10, vialUnit: "mg", diluentMl: 2 },
    doseAmount: 200,
    doseUnit: "mcg",
    days: [1, 2, 3, 4, 5],
    timeOfDay: "Evening",
    rotateSites: true,
  },
  {
    sku: "HRT-TCYP-200",
    libraryKey: "testosterone-cypionate",
    name: "Testosterone cypionate",
    // Supplied as an oil at strength. No mixing step, and the UI must not
    // suggest one.
    supply: { kind: "solution", amountPerMl: 200, unit: "mg" },
    doseAmount: 100,
    doseUnit: "mg",
    days: [1, 4],
    timeOfDay: "Morning",
    rotateSites: true,
  },
  {
    sku: "PEP-SERM-15",
    libraryKey: "sermorelin",
    name: "Sermorelin",
    supply: { kind: "lyophilised", vialAmount: 15, vialUnit: "mg", diluentMl: 3 },
    doseAmount: 300,
    doseUnit: "mcg",
    days: [1, 2, 3, 4, 5, 6],
    timeOfDay: "Evening",
    rotateSites: true,
  },
];

/** The demo clinician whose signature sits behind every seeded dose. */
const SIGNING_PROVIDER = "st-001"; // Dr. Marcus Vale

function providerId(): string {
  // Fall back to any Medical staff member if the expected id is not present, so
  // a roster change cannot leave prescriptions attributed to nobody.
  if (staffMap[SIGNING_PROVIDER]) return SIGNING_PROVIDER;
  const medical = Object.values(staffMap).find((s) => s.role === "Medical");
  return medical?.id ?? Object.keys(staffMap)[0];
}

export const prescriptions: Prescription[] = clients.flatMap((c) => {
  // Only members actually on a protocol carry one.
  if (c.status !== "Active Protocol" && c.status !== "Follow-Up Due") return [];

  const rand = seededRandom(c.id + "rx");
  const count = 1 + Math.floor(rand() * 2); // one or two concurrent items
  const start = Math.floor(rand() * TEMPLATES.length);
  const signer = providerId();

  return Array.from({ length: count }, (_, i) => {
    const t = TEMPLATES[(start + i) % TEMPLATES.length];
    // Signed some weeks back, so "time on therapy" is meaningful in the demo.
    const signedDaysAgo = 14 + Math.floor(rand() * 90);
    const signedAt = absolute(
      absolute("2026-06-12T09:00:00").getTime() - signedDaysAgo * 86_400_000,
    ).toISOString();

    return {
      id: `rx-${c.id.slice(-3)}-${i + 1}`,
      clientId: c.id,
      sku: t.sku,
      libraryKey: t.libraryKey,
      name: t.name,
      supply: t.supply,
      doseAmount: t.doseAmount,
      doseUnit: t.doseUnit,
      syringe: "U-100" as SyringeStandard,
      days: t.days,
      timeOfDay: t.timeOfDay,
      signedByStaffId: signer,
      signedAt,
      rotateSites: t.rotateSites,
    };
  });
});

const byClient = prescriptions.reduce<Record<string, Prescription[]>>((acc, p) => {
  (acc[p.clientId] ??= []).push(p);
  return acc;
}, {});

export function prescriptionsForClient(clientId: string): Prescription[] {
  return byClient[clientId] ?? [];
}

/** The draw for one prescription, routed by how the product is supplied. */
export function drawFor(rx: Prescription): DrawResult {
  const dose = { amount: rx.doseAmount, unit: rx.doseUnit };
  if (rx.supply.kind === "solution") {
    return computeDrawFromSolution(
      { amountPerMl: rx.supply.amountPerMl, unit: rx.supply.unit, syringe: rx.syringe },
      dose,
    );
  }
  return computeDraw(
    {
      vialAmount: rx.supply.vialAmount,
      vialUnit: rx.supply.vialUnit,
      diluentMl: rx.supply.diluentMl,
      syringe: rx.syringe,
    },
    dose,
  );
}

export interface DueDose {
  rx: Prescription;
  draw: DrawResult;
  timeOfDay: "Morning" | "Evening";
}

/**
 * What is actually due on a given day.
 *
 * The weekday is read in UTC via `absolute`, matching the rest of the app: a
 * zoneless pinned timestamp parsed as local would put a member in Tokyo on a
 * different day from the server and silently change what the screen says is due.
 */
export function dosesDueOn(clientId: string, iso: string): DueDose[] {
  const day = absolute(iso).getUTCDay();
  return prescriptionsForClient(clientId)
    .filter((rx) => rx.days.includes(day))
    .map((rx) => ({ rx, draw: drawFor(rx), timeOfDay: rx.timeOfDay }))
    .sort((a, b) => (a.timeOfDay === b.timeOfDay ? 0 : a.timeOfDay === "Morning" ? -1 : 1));
}

/** Human label for a cadence, derived from the days rather than restated. */
export function cadenceLabel(days: number[]): string {
  if (days.length === 7) return "Every day";
  if (days.length === 1) return `Weekly on ${DAY_NAMES[days[0]]}`;
  if (days.length === 5 && !days.includes(0) && !days.includes(6)) return "Weekdays";
  if (days.length === 6) return "Six days a week";
  return days.map((d) => DAY_NAMES[d].slice(0, 3)).join(", ");
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
