/**
 * PROVENANCE — where every number on the owner console came from.
 *
 * This module is the reason the owner console exists in the shape it does. The
 * audit's meta-finding was not "some numbers are wrong"; it was that a reader
 * cannot tell the wrong ones from the right ones. `lib/analytics.ts:48` computes
 *
 *     grossMonthly = mrr + Σ(lifetimeValue) × 0.02 + 12000
 *
 * and renders it in the same typeface, at the same size, in the same kind of
 * tile as MRR — which is a genuine sum over membership records. One of those two
 * numbers can be defended in a bank meeting and the other cannot, and nothing on
 * screen said which was which. A footer disclaimer set smaller than the figure
 * it disclaims is not a disclosure; it is a liability notice.
 *
 * So on this console a figure cannot be constructed without declaring where it
 * came from. `Figure.provenance` and `Figure.source` are both required fields —
 * not optional metadata a caller can forget — and the tile component renders the
 * provenance chip at `text-micro` directly beneath a `text-title` number, inside
 * the same bounding box. You cannot read the number without reading the label.
 *
 * ---------------------------------------------------------------------------
 * WHY THREE LEVELS AND NOT TWO
 * ---------------------------------------------------------------------------
 * The brief for this console asked for MEASURED versus ILLUSTRATIVE. Two levels
 * is the right instinct and it is one level short, because it forces a genuinely
 * dishonest choice on a whole class of figure.
 *
 * "75 members at high churn risk" is not a constant — nothing invented it, and
 * it moves when the records move. But it is also not a count of anything that
 * happened. It is `lib/aiInsights.ts:churnRisk` adding 28 points for an overdue
 * follow-up and 14 for no programme enrolment, against thresholds a person
 * chose. Calling that MEASURED launders a model's opinion into a fact, which is
 * the exact failure this module exists to prevent. Calling it ILLUSTRATIVE is
 * equally wrong — it would sit beside `+ 12000`, and an owner who learned to
 * ignore illustrative figures would start ignoring a real risk list.
 *
 * MODELLED is that third thing: real logic, real inputs, a judgement rather than
 * a fact. An owner should act on it and should also be able to argue with it,
 * which is why every modelled figure names the engine that produced it.
 */

/**
 * MEASURED — real arithmetic over records that exist in the seed.
 *   e.g. MRR = Σ monthlyRate over Active memberships.
 * Defensible. Still requires `source` to name which records, and `caveat` where
 * the records themselves have a weakness worth knowing about.
 *
 * MODELLED — an engine's score or classification over those records.
 *   e.g. churn risk, attention triage.
 * Reproducible and inspectable, but a judgement. Never state it as a fact.
 *
 * ILLUSTRATIVE — a constant, a hardcoded weight, or a seeded shape.
 *   e.g. `grossMonthly`, the service-line mix, the retention array.
 * Must never drive a decision.
 */
export type Provenance = "measured" | "modelled" | "illustrative";

export interface ProvenanceMeta {
  label: string;
  /** One line, in an owner's words, on how much weight the figure carries. */
  meaning: string;
}

export const PROVENANCE: Record<Provenance, ProvenanceMeta> = {
  measured: {
    label: "Measured",
    meaning: "Counted from records in this build. Check the source and you can reproduce it.",
  },
  modelled: {
    label: "Modelled",
    meaning:
      "An engine's judgement over real records — reproducible, but a scoring opinion, not a count.",
  },
  illustrative: {
    label: "Illustrative",
    meaning:
      "A constant or a seeded shape with no record behind it. Never make a decision on one.",
  },
};

/**
 * One number on the console.
 *
 * `display` is carried alongside the raw `value` rather than formatted at the
 * point of render, so the currency and unit decisions live with the arithmetic
 * that produced them. A tile that formats its own input is a tile that can
 * render dollars as a plain integer the day someone reuses it.
 */
export interface Figure {
  id: string;
  /** What the number is, in an owner's words. Not a metric name. */
  label: string;
  /** Raw value, for sorting and for bar widths. */
  value: number;
  /** Pre-formatted for display — currency, percent, count. */
  display: string;
  provenance: Provenance;
  /**
   * REQUIRED. The module and the arithmetic, specific enough to check.
   * "Σ monthlyRate over memberships where status = Active (lib/mock/memberships.ts)"
   * — not "membership data".
   */
  source: string;
  /**
   * What would make this number wrong, or thinner than it looks. Present on
   * every figure whose underlying records are synthesised rather than observed,
   * and on every figure whose denominator is small enough to mislead.
   */
  caveat?: string;
  /** What the number means for the business, one line. */
  hint?: string;
  /** Where to go to see the rows behind it. */
  href?: string;
  tone?: "neutral" | "optimal" | "watch" | "high";
}

/**
 * A question an owner will ask that Apex cannot answer.
 *
 * This is a first-class type and it renders as a real card, at the same visual
 * weight as a figure, deliberately. The alternative — quietly omitting the tile
 * — leaves an owner assuming the question was never important, when in fact it
 * is a question the product currently cannot serve. An empty space teaches
 * nothing; a card that says "we cannot answer this, here is the record that is
 * missing" is a roadmap item stated in the place the answer would go.
 *
 * `replaces` exists because some of these questions ARE being answered
 * elsewhere in the app right now, by fabricated figures. Naming the file and
 * line makes the omission checkable rather than a matter of trust.
 */
export interface NotComputable {
  id: string;
  /** The question, phrased the way the owner would ask it out loud. */
  question: string;
  /** Why it cannot be answered — in terms of records that do not exist. */
  why: string;
  /** What would have to be captured. Names real tables where they exist. */
  needs: string;
  /**
   * A surface that currently answers this question with an invented number,
   * with file and line. Present only where such a surface exists.
   */
  replaces?: string;
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

/**
 * Formatters live here rather than at the call sites so that a figure's unit is
 * decided once, by the code that knows what the number is.
 */
export function countFigure(
  init: Omit<Figure, "display" | "value"> & { value: number; unit?: string },
): Figure {
  const { unit, ...rest } = init;
  return {
    ...rest,
    display: unit ? `${init.value.toLocaleString("en-US")} ${unit}` : init.value.toLocaleString("en-US"),
  };
}

export function moneyFigure(init: Omit<Figure, "display">): Figure {
  return {
    ...init,
    display: new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(init.value),
  };
}

export function percentFigure(init: Omit<Figure, "display">): Figure {
  return { ...init, display: `${Math.round(init.value * 100)}%` };
}

/**
 * The one-line disclosure for the console as a whole.
 *
 * Deliberately short. It is a legend for the chips, NOT a disclaimer that does
 * the labelling work — that work is done per figure, at the figure, which is the
 * entire correction this console makes to `app/analytics/page.tsx`.
 */
export const CONSOLE_NOTE =
  "Every figure on this console carries where it came from. Measured is counted from records; modelled is an engine's judgement over records; illustrative is a constant with nothing behind it. Questions Apex cannot answer are stated as questions rather than filled with a number.";
