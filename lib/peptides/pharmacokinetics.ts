/**
 * Elimination half-life per compound, and the maths that follows from it.
 *
 * WHY THIS IS THE HONEST FEATURE
 * ------------------------------
 * Half-life is the single number that explains why one compound is injected
 * weekly and another daily, why levels keep climbing for a month before they
 * settle, and what a missed dose actually costs. It is also the number that
 * cleanly separates the well-studied compounds in this catalogue from the
 * research ones.
 *
 * That separation is the point. Semaglutide's ~7-day half-life comes from
 * registrational trials. BPC-157's human half-life has not been characterised
 * at all — there are no human pharmacokinetic studies to draw on. A platform
 * that quietly invented a plausible number for both would be lying about the
 * second one. So `characterised: false` is a first-class state here, it renders
 * as "not characterised in humans", and every curve that would depend on it is
 * withheld rather than faked.
 *
 * NOT A DOSING TOOL. Everything below describes how a molecule behaves once it
 * is in the body. Nothing here recommends an amount, an interval or a schedule;
 * those live on a member's signed plan and come from their provider.
 */

export interface PharmacokineticProfile {
  /**
   * Terminal elimination half-life in hours. Null when it has not been
   * characterised in humans — which is a real answer, not missing data.
   */
  halfLifeHours: number | null;
  characterised: boolean;
  /** How the figure should be read on screen, e.g. "≈7 days". */
  display: string;
  /** Where the number comes from, so the UI can cite rather than assert. */
  basis: string;
  /**
   * Typical administration interval in hours, used only to illustrate
   * accumulation toward steady state. Null where no typical interval applies.
   * This is a property of how the compound is studied, NOT a recommendation.
   */
  typicalIntervalHours: number | null;
}

const HOUR = 1;
const DAY = 24 * HOUR;

export const PHARMACOKINETICS: Record<string, PharmacokineticProfile> = {
  semaglutide: {
    halfLifeHours: 7 * DAY,
    characterised: true,
    display: "≈7 days",
    basis: "Registrational human pharmacokinetic studies. The long half-life comes from albumin binding via the C18 diacid chain.",
    typicalIntervalHours: 7 * DAY,
  },
  tirzepatide: {
    halfLifeHours: 5 * DAY,
    characterised: true,
    display: "≈5 days",
    basis: "Registrational human pharmacokinetic studies. Albumin binding via the C20 diacid chain drives the duration.",
    typicalIntervalHours: 7 * DAY,
  },
  "testosterone-cypionate": {
    halfLifeHours: 8 * DAY,
    characterised: true,
    display: "≈8 days",
    basis: "Well-characterised for the cypionate ester. The ester is cleaved after injection; the ester chain length is what sets the duration.",
    typicalIntervalHours: 7 * DAY,
  },
  hcg: {
    halfLifeHours: 36 * HOUR,
    characterised: true,
    display: "≈36 hours",
    basis: "Human pharmacokinetic data for the terminal phase. Clearance is biphasic, with a faster initial phase.",
    typicalIntervalHours: 72 * HOUR,
  },
  "pt-141": {
    halfLifeHours: 2.7 * HOUR,
    characterised: true,
    display: "≈2.7 hours",
    basis: "Human pharmacokinetic data from approval studies for bremelanotide.",
    typicalIntervalHours: null,
  },
  sermorelin: {
    halfLifeHours: 0.2 * HOUR,
    characterised: true,
    display: "≈11–12 minutes",
    basis: "Human data for GRF(1-29). It is cleared extremely fast; the biological effect outlasts the molecule because it triggers a downstream hormone pulse.",
    typicalIntervalHours: 24 * HOUR,
  },
  ipamorelin: {
    halfLifeHours: 2 * HOUR,
    characterised: true,
    display: "≈2 hours",
    basis: "Reported human pharmacokinetic data. Its non-standard residues resist the enzymes that would clear an ordinary short peptide.",
    typicalIntervalHours: 24 * HOUR,
  },
  glutathione: {
    halfLifeHours: 0.17 * HOUR,
    characterised: true,
    display: "≈10 minutes",
    basis: "Human data for intravenous administration. Plasma clearance is very rapid.",
    typicalIntervalHours: null,
  },

  // --- Not characterised in humans -----------------------------------------
  // These are the honest gaps. Each one is a compound the clinic works with
  // where no human pharmacokinetic study exists to quote, so no curve is drawn.
  "bpc-157": {
    halfLifeHours: null,
    characterised: false,
    display: "Not characterised",
    basis: "No published human pharmacokinetic studies. Animal work exists, but animal half-lives do not transfer reliably to people.",
    typicalIntervalHours: null,
  },
  "tb-500": {
    halfLifeHours: null,
    characterised: false,
    display: "Not characterised",
    basis: "No published human pharmacokinetic studies for the fragment as supplied.",
    typicalIntervalHours: null,
  },
  "cjc-1295": {
    halfLifeHours: null,
    characterised: false,
    display: "Depends on formulation",
    basis: "Half-life differs by roughly two orders of magnitude depending on whether the drug-affinity complex is present. Without knowing which formulation was dispensed, quoting a single number would be misleading.",
    typicalIntervalHours: null,
  },
  retatrutide: {
    halfLifeHours: null,
    characterised: false,
    display: "Investigational",
    basis: "Still in clinical development. Published pharmacokinetics are preliminary and not settled enough to quote as fact.",
    typicalIntervalHours: null,
  },
  nad: {
    halfLifeHours: null,
    characterised: false,
    display: "Not characterised",
    basis: "Intravenous NAD+ pharmacokinetics in humans are poorly described, and it is a coenzyme rather than a peptide.",
    typicalIntervalHours: null,
  },
};

export function pkFor(key: string): PharmacokineticProfile | undefined {
  return PHARMACOKINETICS[key];
}

/* -------------------------------------------------------------------------- */
/* First-order kinetics                                                        */
/* -------------------------------------------------------------------------- */

/** Elimination constant k = ln2 / t½. */
export function eliminationConstant(halfLifeHours: number): number {
  return Math.LN2 / halfLifeHours;
}

/** Fraction of a single dose remaining after `hours`. */
export function fractionRemaining(halfLifeHours: number, hours: number): number {
  return Math.exp(-eliminationConstant(halfLifeHours) * hours);
}

/**
 * Time to reach a given fraction of steady state, in hours.
 *
 * The familiar "about five half-lives to steady state" is this function at
 * 0.97 — worth showing as a derived number rather than a slogan.
 */
export function timeToSteadyState(halfLifeHours: number, fraction = 0.97): number {
  return (-Math.log(1 - fraction) / Math.LN2) * halfLifeHours;
}

/**
 * Accumulation ratio at steady state for repeated dosing at a fixed interval.
 * R = 1 / (1 - e^(-k·τ)). This is why a weekly compound with a 7-day half-life
 * plateaus at roughly twice its first-dose peak.
 */
export function accumulationRatio(halfLifeHours: number, intervalHours: number): number {
  return 1 / (1 - Math.exp(-eliminationConstant(halfLifeHours) * intervalHours));
}

export interface CurvePoint {
  /** Hours since the first dose. */
  hour: number;
  /** Relative concentration, where 1.0 is the peak of a single first dose. */
  level: number;
  /** True at an administration time. */
  dose: boolean;
}

/**
 * Superposition curve for repeated dosing.
 *
 * Each dose decays independently and the levels add — which is exactly how
 * accumulation works, and why the curve climbs for several intervals before it
 * settles into a repeating saw-tooth.
 *
 * `skip` lists 0-based dose indices to omit, which is what powers the
 * "what a missed dose actually costs" view: the same maths, one term removed.
 */
export function concentrationCurve(opts: {
  halfLifeHours: number;
  intervalHours: number;
  doses: number;
  /** Samples per interval. */
  resolution?: number;
  skip?: number[];
  /** Extra intervals of washout to render after the last dose. */
  tailIntervals?: number;
}): CurvePoint[] {
  const { halfLifeHours, intervalHours, doses, resolution = 24, skip = [], tailIntervals = 1 } = opts;
  const k = eliminationConstant(halfLifeHours);
  const skipped = new Set(skip);
  const totalHours = intervalHours * (doses + tailIntervals);
  const step = intervalHours / resolution;

  const points: CurvePoint[] = [];
  for (let h = 0; h <= totalHours; h += step) {
    let level = 0;
    for (let d = 0; d < doses; d++) {
      if (skipped.has(d)) continue;
      const t = h - d * intervalHours;
      if (t >= 0) level += Math.exp(-k * t);
    }
    // A dose lands when h sits within half a step of an administration time.
    const idx = Math.round(h / intervalHours);
    const dose =
      Math.abs(h - idx * intervalHours) < step / 2 && idx < doses && !skipped.has(idx);
    points.push({ hour: h, level, dose });
  }
  return points;
}

/* -------------------------------------------------------------------------- */
/* PERSONALISED kinetics — from a member's ACTUAL logged doses                 */
/* -------------------------------------------------------------------------- */

/**
 * Blood level at time `t`, computed from the exact times a member took their
 * doses — not an idealised schedule.
 *
 * This is the difference between the demo curve and a real one. The schedule
 * curve above assumes a perfect interval; this sums a decay term for every dose
 * the member actually logged, at the actual hour they logged it. Miss Saturday
 * and log Sunday twelve hours late, and this curve dips and recovers exactly
 * where that happened. It is the member's own adherence made visible.
 *
 * All times are hours on a common axis (the component converts ISO → hours).
 * Level is relative to a single first-dose peak of 1.0, the same scale the
 * schedule curve uses, so the two overlay honestly.
 */
export function levelAt(halfLifeHours: number, doseHours: number[], t: number): number {
  const k = eliminationConstant(halfLifeHours);
  let level = 0;
  for (const d of doseHours) {
    if (d <= t) level += Math.exp(-k * (t - d));
  }
  return level;
}

export interface PersonalCurve {
  points: CurvePoint[];
  /** Where "now" sits on the axis, so the UI can mark it. */
  nowHour: number;
  /** The member's blood level right now, on the single-first-dose scale. */
  levelNow: number;
  /**
   * Fraction of the level that consistent dosing at the nominal interval would
   * hold — the accumulation ratio is exactly that steady-state peak. 1.0 means
   * "right where steady dosing would keep you". Null when there is no nominal
   * interval to compare against.
   */
  pctOfSteadyState: number | null;
  /** True once the member has logged enough to draw an honest personal line. */
  hasEnough: boolean;
}

/**
 * Build the personalised curve.
 *
 * `doseHours` are the actual administration times, ascending, in hours relative
 * to the window start. `nowHour` is the present on the same axis. The curve runs
 * from the first dose to a short projection past now, so the member sees where
 * their level is heading if nothing changes.
 *
 * REFUSES rather than guesses. One dose is not a curve — a single point cannot
 * show accumulation or a trend — so below two logged doses this returns
 * `hasEnough: false` and the UI shows the schedule curve with an invitation to
 * log, not a fabricated personal line over one data point.
 */
export function personalCurve(opts: {
  halfLifeHours: number;
  doseHours: number[];
  nowHour: number;
  /** Hours to project past now. Defaults to one half-life, capped for readability. */
  projectHours?: number;
  /** Nominal interval, for the steady-state reference. Null to omit it. */
  intervalHours?: number | null;
  resolution?: number;
}): PersonalCurve {
  const { halfLifeHours, doseHours, nowHour, intervalHours = null, resolution = 240 } = opts;
  const sorted = [...doseHours].sort((a, b) => a - b);
  const hasEnough = sorted.length >= 2;

  const project = opts.projectHours ?? Math.min(halfLifeHours * 2, 96);
  const startHour = sorted.length ? sorted[0] : nowHour;
  const endHour = Math.max(nowHour + project, (sorted.at(-1) ?? nowHour) + project);
  const span = Math.max(endHour - startHour, 1);
  const step = span / resolution;

  const points: CurvePoint[] = [];
  for (let h = startHour; h <= endHour + 1e-6; h += step) {
    const isDose = sorted.some((d) => Math.abs(d - h) < step / 2);
    points.push({ hour: h, level: levelAt(halfLifeHours, sorted, h), dose: isDose });
  }

  const levelNow = levelAt(halfLifeHours, sorted, nowHour);
  const ssPeak = intervalHours ? accumulationRatio(halfLifeHours, intervalHours) : null;

  return {
    points,
    nowHour,
    levelNow,
    pctOfSteadyState: ssPeak ? levelNow / ssPeak : null,
    hasEnough,
  };
}

/** Human-readable duration from hours. */
export function humanDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} hr`;
  const days = hours / 24;
  if (days < 14) return `${days.toFixed(days < 10 ? 1 : 0)} days`;
  return `${Math.round(days / 7)} weeks`;
}
