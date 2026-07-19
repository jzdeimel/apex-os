/**
 * The clinic's own FAQ, answered inside the product.
 *
 * These six questions are not ours. They are the exact six questions Alpha
 * Health publishes under "Frequently asked questions — What people usually want
 * to know before they book", and they are reproduced verbatim on purpose: a
 * member who read them on goalphahealth.com before signing up should find the
 * same words here, answered the same way. Rewriting them "better" would quietly
 * make the app a different company from the clinic.
 *
 * Two hard rules on the answers:
 *
 *  1. NON-PROMISSORY. Nothing here may guarantee an outcome. The closest we get
 *     is the clinic's own framing — "most members track progress over the first
 *     three to six months" (lib/brand.ts, PILLARS[2]) — which is a statement
 *     about a tracking window, not a promise about a result.
 *  2. NO INVENTED CLINICAL FACT. No doses, no timings, no routes, no named
 *     drug protocols. Where an answer touches therapy it describes what the
 *     service IS and who decides, never what it will do to you.
 *
 * Answers are arrays of paragraphs rather than one blob so the accordion can
 * set a readable measure without parsing markdown at runtime.
 */

import { BRAND, JOURNEY, CARE_TRACKS, PILLARS } from "@/lib/brand";

export interface FaqEntry {
  id: string;
  /** Verbatim from the clinic. Do not paraphrase. */
  question: string;
  /** One-line answer used for previews and search snippets. */
  short: string;
  /** Full answer, one string per paragraph. */
  answer: string[];
  /** Optional in-app pointer — where in Apex the member can see this for themselves. */
  seeAlso?: { label: string; href: string };
}

export const FAQ: FaqEntry[] = [
  {
    id: "faq-abnormal-labs",
    question: "Do I need abnormal labs to get help?",
    short:
      "No. We read your panel against an optimal range, not just the lab's reference band — and we start from your symptoms either way.",
    answer: [
      // This is the clinic's actual differentiator, and it is also literally
      // what the Biomarker type models, so we can point at the member's own
      // screen rather than asserting it.
      "No. A lab's reference range describes the middle of the general population — people who feel well and people who do not, all averaged together. Being inside it means your result is common. It does not mean it is where you function best.",
      `That gap is what ${BRAND.name} works in. ${PILLARS[0].blurb} In practice that means we read every marker twice: once against the lab's reference band, and once against a narrower optimal window for your sex and age.`,
      "Apex shows you both. On your Labs page each marker is drawn on a track with the lab's normal range in grey and the window your plan actually targets marked inside it, and any result that sits inside grey but outside that window gets called out by name. Those are usually the results a standard physical hands back with the word \"normal\" and no further conversation.",
      "The other half of the answer is that labs are never the whole assessment. Your symptoms, history, medications, training, sleep and goals are part of the same review, and a symptom you are living with is a legitimate reason to be seen whether or not a number has crossed a line.",
    ],
    seeAlso: { label: "See both ranges on your labs", href: "/portal/labs" },
  },
  {
    id: "faq-only-men",
    question: "Is Alpha Health only for men?",
    short: "No. Women's health is a full track, not an add-on.",
    answer: [
      `No. ${BRAND.name}'s own tagline is "${BRAND.tagline}", and the women's side of the practice is a full clinical track with its own services rather than a variation on the men's programme.`,
      `The ${CARE_TRACKS.female.label.toLowerCase()} track covers ${CARE_TRACKS.female.services
        .slice(0, -1)
        .join(", ")
        .toLowerCase()}, and ${CARE_TRACKS.female.services[CARE_TRACKS.female.services.length - 1].toLowerCase()}.`,
      "That separation exists because the clinical questions genuinely differ. Perimenopause and menopause management has no male equivalent. Hormone therapy for women is a different assessment, a different set of markers and a different conversation from testosterone therapy in men — treating one as a footnote to the other is how women end up under-assessed.",
      "The public-facing name and the YouTube channel skew male, and that is fair to notice. The practice does not: the education library in this app carries a women's track for exactly that reason, and the clinicians running it are the same board-certified physicians.",
    ],
  },
  {
    id: "faq-free-consultation",
    question: "What happens during a free consultation?",
    short:
      "A conversation about symptoms, goals and history — and an honest read on whether this is the right fit. Nothing is prescribed on that call.",
    answer: [
      `The consultation is step one of four. ${JOURNEY[0].detail}`,
      "Nothing is prescribed and nothing is decided on that call. It is a fit conversation: what is actually bothering you, what you have already tried, what your history and medications look like, and whether this practice is the right place for it. If it is not, saying so is a legitimate outcome of the consultation.",
      `If you move forward, step two is testing and health assessment — ${JOURNEY[1].detail.toLowerCase()}`,
      `Step three is a clinician-led plan. ${JOURNEY[2].detail} Every therapy on it is set by a licensed provider, not by a coach and not by software.`,
      `Step four is where most of the time is actually spent: ${JOURNEY[3].detail.toLowerCase()}`,
      "In Apex you can see which of those four steps you are on at any point, and what has to happen before the next one.",
    ],
    seeAlso: { label: "Where you are in the process", href: "/portal" },
  },
  {
    id: "faq-telehealth",
    question: "Do you offer telehealth?",
    short: `Yes — nationwide. ${BRAND.telehealthPhone}.`,
    answer: [
      `Yes. Telehealth is offered nationwide, and it is a full care track rather than a lighter version of an in-person visit: the same intake, the same panel-based assessment, the same clinician-led plan and the same coaching cadence. To start, call ${BRAND.telehealthPhone}.`,
      "Labs are the part people ask about. Telehealth members are sent to a draw site near them rather than travelling to a clinic, and the results land in this app the same way they would for someone seen in Raleigh.",
      "There are four physical locations if you would rather be seen in person — Raleigh (701 Mutual Ct), the Raleigh boutique location (6325 Falls of Neuse Rd), Southern Pines (1545 US Hwy 1) and Myrtle Beach (4999 Carolina Forest Blvd).",
      "What telehealth cannot do is anything that needs hands or equipment: in-clinic body composition scanning, injections administered by staff, and IV therapy are on-site services. Where a plan involves one of those, your care team tells you which visits have to be in person.",
    ],
  },
  {
    id: "faq-just-testosterone",
    question: "Is this just testosterone treatment?",
    short:
      "No. Hormones are one part of a broader assessment that covers metabolic health, thyroid, nutrients, inflammation, sleep, nutrition and training.",
    answer: [
      "No. Testosterone therapy is one service among many, and it is not the right answer for most of the people who ask about it.",
      "The assessment is deliberately wider than hormones. A panel of over a hundred markers covers thyroid function, glycemic and metabolic markers, lipids and cardiovascular risk, inflammation, nutrient status, liver and kidney function, and blood counts. Low energy — the single most common reason people come in — turns out to be a thyroid, sleep, iron, vitamin D or blood-sugar question at least as often as a hormone one.",
      `On the men's side the practice covers ${CARE_TRACKS.male.services.join(", ").toLowerCase()}. On the women's side it covers ${CARE_TRACKS.female.services.join(", ").toLowerCase()}.`,
      "A meaningful share of what gets recommended is not a prescription at all: protein and nutrition targets, training structure, sleep timing, and correcting a nutrient deficiency. Those are the parts a coach works with you on week to week, and they are the parts that make anything else worth doing.",
      "Where hormone therapy is appropriate, it is a provider's decision made against your labs, your history and your goals — and it is monitored on an ongoing schedule rather than started and forgotten.",
    ],
  },
  {
    id: "faq-how-soon",
    question: "How soon can someone expect results?",
    short: `${PILLARS[2].blurb} It is a tracking window, not a guarantee.`,
    answer: [
      // Hard line: the clinic's own framing, and nothing faster. Any number
      // shorter than this would be a fabricated clinical claim.
      `The honest answer is that it varies, and nobody can tell you in advance. The clinic's own framing is the one worth holding onto: ${PILLARS[2].blurb.toLowerCase()}`,
      "That window exists because it is how long the measurements take to mean anything. A follow-up panel is scheduled far enough out that a change in a marker reflects a real trend rather than the week you had. Body composition moves on a similar timescale. Reading either one too early mostly produces noise, and chasing noise is how plans get changed for no reason.",
      `Some things people notice sooner than the labs move — sleep and daily energy are the usual ones — and some markers take longer than three months to shift at all. Both are normal. ${PILLARS[2].detail}`,
      "What you should expect early is not a result but a process: a plan you understand, a coach who knows what you are doing this week, and a scheduled point at which it gets measured and adjusted. If nothing has changed by your follow-up, that is information too, and it is the reason the plan is reviewed rather than repeated.",
    ],
    seeAlso: { label: "Track your own markers over time", href: "/portal/progress" },
  },
];

/** Lookup by id — used by the accordion's deep-link handling. */
export function faqEntry(id: string): FaqEntry | undefined {
  return FAQ.find((f) => f.id === id);
}

/** Naive substring search across question, short answer and body. */
export function searchFaq(q: string): FaqEntry[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return FAQ;
  return FAQ.filter((f) =>
    [f.question, f.short, ...f.answer].join(" ").toLowerCase().includes(needle),
  );
}
