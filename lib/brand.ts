/**
 * Alpha Health's own voice, taken from goalphahealth.com.
 *
 * Apex should not invent marketing language. Every headline a member reads
 * should sound like the clinic that treats them — the site says "we look past
 * 'normal' labs to find the real cause," and that sentence happens to describe
 * exactly what the biomarker model in lib/types.ts does with its separate
 * reference and optimal ranges. Where the product and the brand already agree,
 * quote the brand.
 */

export const BRAND = {
  name: "Alpha Health",
  tagline: "Medical wellness for men and women",
  motto: "Health is Wealth. Invest Wisely.",
  promise: "Get your energy, confidence, and momentum back.",
  telehealthPhone: "833-549-9993",
} as const;

/**
 * The three pillars the clinic sells on. They are also, usefully, the three
 * things a member's home screen has to answer — which is why the client portal
 * is organised around them rather than around our data model.
 */
export const PILLARS = [
  {
    key: "labs",
    title: "Labs first",
    blurb: "We look past “normal” labs to find the real cause.",
    detail:
      "Over 100 markers, read against an optimal range rather than a lab's reference band.",
  },
  {
    key: "coach",
    title: "Coach supported",
    blurb: "Someone who helps you execute it in real life.",
    detail: "A named coach, not a queue. They see the same plan you do.",
  },
  {
    key: "results",
    title: "Built for results",
    blurb: "Most members track progress over the first three to six months.",
    detail: "Measured on the same device, at the same time of day, every time.",
  },
] as const;

/**
 * The clinic's four-step patient journey, verbatim from their site.
 *
 * This maps one-to-one onto `ClientStatus` in lib/types.ts, which is what lets
 * a member see where they are in *the clinic's* process rather than in our
 * internal state machine.
 */
export const JOURNEY = [
  {
    step: 1,
    title: "Free consultation",
    detail:
      "Talk through symptoms, goals, health history, and whether Alpha Health is the right fit.",
    statuses: ["Lead", "Consult Booked"],
  },
  {
    step: 2,
    title: "Testing and health assessment",
    detail:
      "Review labs, body composition, symptoms, risk factors, medications, lifestyle, and relevant hormone and metabolic markers.",
    statuses: ["Labs Ordered", "Results Ready"],
  },
  {
    step: 3,
    title: "Clinician-led plan",
    detail:
      "Build a personalised care plan — hormone optimisation, weight or metabolic support, peptides, nutrition, supplements or other therapies when clinically appropriate.",
    statuses: ["Plan Review"],
  },
  {
    step: 4,
    title: "Coaching, follow-up and optimisation",
    detail:
      "Coaching, check-ins, progress tracking, lab review, and plan adjustments over time.",
    statuses: ["Active Protocol", "Follow-Up Due"],
  },
] as const;

/** Which journey step a member is on, from their status. */
export function journeyStepFor(status: string): (typeof JOURNEY)[number] {
  return (
    JOURNEY.find((j) => (j.statuses as readonly string[]).includes(status)) ?? JOURNEY[0]
  );
}

/**
 * Care tracks. The clinic markets separately to men and women, and the
 * clinical content genuinely differs — perimenopause and menopause management
 * has no male equivalent, and TRT and HRT are different conversations.
 */
export const CARE_TRACKS = {
  male: {
    label: "Men's health",
    services: [
      "Testosterone replacement therapy (TRT)",
      "Peptide therapy",
      "Metabolic health",
      "Weight-loss care",
      "Sexual health",
      "Recovery & performance",
    ],
  },
  female: {
    label: "Women's health",
    services: [
      "Hormone replacement therapy (HRT)",
      "Peptide therapy",
      "Metabolic and weight-loss care",
      "Perimenopause & menopause symptom management",
      "Recovery & performance",
    ],
  },
} as const;

/** Trust markers the clinic publishes. Used sparingly — they are theirs, not ours. */
export const PROOF = {
  patientsServed: "5,000+",
  googleRating: "4.9",
  markers: "100+",
  paymentNote: "HSA/FSA accepted",
  credential: "Board-certified physicians",
} as const;
