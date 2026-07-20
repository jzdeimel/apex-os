/**
 * Reconstitution and draw maths — turning a prescribed dose into "how far up
 * the syringe do I pull".
 *
 * WHY THIS EXISTS
 * ---------------
 * Peptides ship as lyophilised powder. Somebody adds bacteriostatic water, and
 * the resulting concentration depends entirely on how much they added. The same
 * 5mg vial is 5mg/mL at 1mL of diluent and 1.67mg/mL at 3mL — so the SAME
 * prescribed dose is a different mark on the syringe depending on a step that
 * happens after dispensing.
 *
 * On top of that, a prescription is written in mcg or mg, a syringe is graduated
 * in insulin units, and the conversion between them runs through millilitres.
 * That is two unit changes and a concentration term between "what the provider
 * wrote" and "what the member pulls", done by hand, often late at night. A
 * decimal slip there is the most common serious error in this category of care.
 *
 * So Apex does the arithmetic once, shows every input it used, and refuses to
 * answer when an input is missing.
 *
 * WHAT THIS IS AND IS NOT
 * -----------------------
 * This is NOT dose selection. Nothing here decides how much anyone should take.
 * It converts an already-prescribed, provider-signed dose into the units the
 * member will actually read off a syringe, and shows its working.
 *
 * The distinction matters and the codebase holds it elsewhere too: the peptide
 * library carries no doses, and AI proposals carry no doses — a coach proposes a
 * compound and a rationale, and a licensed provider sets the amount and signs.
 * By the time a value reaches this module it has a signature behind it.
 */

/** A syringe's graduation standard. U-100 means 100 units per millilitre. */
export type SyringeStandard = "U-100" | "U-50" | "U-40";

export const UNITS_PER_ML: Record<SyringeStandard, number> = {
  "U-100": 100,
  "U-50": 100, // A U-50 barrel is still 100 units/mL; it simply holds 0.5mL.
  "U-40": 40,
};

/** Maximum volume the barrel holds, in millilitres. Drives "split the dose". */
export const BARREL_ML: Record<SyringeStandard, number> = {
  "U-100": 1,
  "U-50": 0.5,
  "U-40": 1,
};

export type MassUnit = "mg" | "mcg" | "iu";

/** Everything needed to turn a prescribed dose into a mark on a syringe. */
export interface Preparation {
  /** Total drug in the vial as supplied. */
  vialAmount: number;
  vialUnit: MassUnit;
  /** Millilitres of bacteriostatic water added. Null until someone records it. */
  diluentMl: number | null;
  syringe: SyringeStandard;
}

export interface PrescribedDose {
  amount: number;
  unit: MassUnit;
}

/** Normalise to micrograms so the arithmetic has one unit. IU is NOT mass. */
function toMcg(amount: number, unit: MassUnit): number | null {
  if (unit === "mg") return amount * 1000;
  if (unit === "mcg") return amount;
  // International units measure biological activity, not mass, and the
  // conversion factor is substance-specific. There is no general formula, so we
  // decline rather than invent one.
  return null;
}

export interface DrawResult {
  ok: boolean;
  /** Concentration of the reconstituted vial, mcg per mL. */
  concentrationMcgPerMl?: number;
  /** Volume to draw, in millilitres. */
  volumeMl?: number;
  /** The number a member reads off the barrel. */
  units?: number;
  /** Doses the vial yields at this dose and dilution. */
  dosesPerVial?: number;
  /** True when the draw exceeds one barrel and must be split. */
  exceedsBarrel?: boolean;
  /** Human-readable working, shown so the member can check us. */
  steps?: string[];
  /** Why we could not answer. Present only when ok is false. */
  reason?: string;
}

/**
 * Convert a prescribed dose into syringe units.
 *
 * Returns `ok: false` rather than a number whenever an input is missing or the
 * conversion is not defined. A confidently wrong syringe reading is far more
 * dangerous than a blank one that says what it needs.
 */
export function computeDraw(prep: Preparation, dose: PrescribedDose): DrawResult {
  if (prep.diluentMl === null || prep.diluentMl <= 0) {
    return {
      ok: false,
      reason:
        "No reconstitution volume on record. How much bacteriostatic water was added determines the concentration, so units cannot be calculated without it.",
    };
  }

  if (dose.unit === "iu" || prep.vialUnit === "iu") {
    return {
      ok: false,
      reason:
        "This is measured in international units, which describe biological activity rather than mass. There is no general IU-to-milligram conversion, so this one is read directly against the product's own labelling.",
    };
  }

  const vialMcg = toMcg(prep.vialAmount, prep.vialUnit);
  const doseMcg = toMcg(dose.amount, dose.unit);
  if (vialMcg === null || doseMcg === null || vialMcg <= 0 || doseMcg <= 0) {
    return { ok: false, reason: "Vial strength or prescribed dose is missing or not a usable amount." };
  }

  const concentrationMcgPerMl = vialMcg / prep.diluentMl;
  const volumeMl = doseMcg / concentrationMcgPerMl;
  const units = volumeMl * UNITS_PER_ML[prep.syringe];
  const dosesPerVial = Math.floor(vialMcg / doseMcg);
  const exceedsBarrel = volumeMl > BARREL_ML[prep.syringe];

  const fmtMass = (mcg: number) => (mcg >= 1000 ? `${(mcg / 1000).toFixed(mcg % 1000 === 0 ? 0 : 2)}mg` : `${mcg}mcg`);

  return {
    ok: true,
    concentrationMcgPerMl,
    volumeMl,
    units,
    dosesPerVial,
    exceedsBarrel,
    steps: [
      `${fmtMass(vialMcg)} vial + ${prep.diluentMl}mL bacteriostatic water = ${fmtMass(concentrationMcgPerMl)} per mL`,
      `${fmtMass(doseMcg)} ÷ ${fmtMass(concentrationMcgPerMl)}/mL = ${volumeMl.toFixed(3)}mL`,
      `${volumeMl.toFixed(3)}mL × ${UNITS_PER_ML[prep.syringe]} units/mL = ${formatUnits(units)} on a ${prep.syringe} syringe`,
    ],
  };
}

/**
 * Format a unit reading for display.
 *
 * Insulin syringes are graduated in whole units (and half-units on some U-100
 * barrels), so a reading of "10.37" is not something a person can actually pull.
 * We show one decimal at most and say plainly when the true value falls between
 * graduations, rather than rounding silently and letting the member believe they
 * hit the dose exactly.
 */
export function formatUnits(units: number): string {
  const rounded = Math.round(units * 2) / 2; // nearest half-unit
  const label = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
  return `${label} units`;
}

/** True when the exact draw does not land on a half-unit graduation. */
export function isBetweenGraduations(units: number): boolean {
  return Math.abs(units - Math.round(units * 2) / 2) > 0.05;
}

/** Millilitres, at the precision a syringe can actually resolve. */
export function formatMl(ml: number): string {
  return `${ml.toFixed(ml < 0.1 ? 3 : 2)} mL`;
}

/** Prescribed amount, formatted the way it was written. */
export function formatDose(dose: PrescribedDose): string {
  if (dose.unit === "iu") return `${dose.amount} IU`;
  return `${dose.amount}${dose.unit}`;
}
