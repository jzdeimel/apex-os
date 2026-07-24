/**
 * The Education Centre library.
 *
 * Alpha Health runs a real Education Center and a YouTube channel
 * (@AlphaMaleDoc). This module is the in-app counterpart: the same topics, in
 * the same voice, sitting one tap from the member's own numbers — which is the
 * whole point. An article about reading a thyroid panel is a different object
 * when the reader's own TSH is on the next screen.
 *
 * Editorial rules this file is written under, all of them load-bearing:
 *
 *  - NO INVENTED CLINICAL FACT. No doses, no schedules, no routes, no "take X
 *    for Y weeks". Where an article touches therapy it explains the mechanism
 *    and the decision, and hands the decision to the provider. This is the
 *    highest-severity failure mode on a member-facing surface and it is worth
 *    the copy being duller for it.
 *  - NO OUTCOME PROMISES. We describe what a service IS, never what it will
 *    achieve for the reader.
 *  - PLAIN LANGUAGE, REAL CONTENT. Thin filler on the most-read screen in the
 *    app is obvious to everyone including the member. Every body below is
 *    written to actually answer the question in its title.
 *  - VIDEO ENTRIES REFERENCE, THEY DO NOT EMBED. We point at the clinic's own
 *    channel rather than pulling a third-party player into a page that renders
 *    a member's health data.
 */

import type { Goal, Symptom } from "@/lib/types";
import { seededRandom } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Track an article belongs to. `all` shows to everyone. */
export type Track = "men" | "women" | "all";

export type Topic =
  // Men's topics, as the clinic names them
  | "Testosterone Optimization"
  | "Metabolic Health"
  | "Sexual Health"
  | "Recovery & Performance"
  // Women's topics, as the clinic names them
  | "Perimenopause & Menopause"
  | "Hormone Balance"
  | "Weight & Energy"
  | "Libido & Mood"
  // Cross-cutting
  | "Understanding Your Labs"
  | "Body Composition"
  | "Peptides"
  | "Sleep"
  | "Nutrition"
  | "Training"
  | "Paying for Care";

/** Display order for the topic browser — clinic topics first, foundations last. */
export const TOPICS: Topic[] = [
  "Understanding Your Labs",
  "Testosterone Optimization",
  "Metabolic Health",
  "Sexual Health",
  "Recovery & Performance",
  "Perimenopause & Menopause",
  "Hormone Balance",
  "Weight & Energy",
  "Libido & Mood",
  "Body Composition",
  "Peptides",
  "Sleep",
  "Nutrition",
  "Training",
  "Paying for Care",
];

export interface Article {
  id: string;
  title: string;
  topic: Topic;
  track: Track;
  readMinutes: number;
  summary: string;
  /** One string per paragraph. Kept as an array so the reader can set its own measure. */
  body: string[];
  /** Biomarker keys from lib/mock/labs.ts. Drives "because your X came back…" reasons. */
  relatedMarkers?: string[];
  relatedGoals?: Goal[];
  /** Symptoms this article speaks to directly. */
  relatedSymptoms?: Symptom[];
  /** Journey steps (1–4, lib/brand.ts JOURNEY) where this is most useful. */
  journeySteps?: number[];
  format: "article" | "video";
  /** Video entries only — what the clinic published and where. Never an embed. */
  videoNote?: string;
}

/**
 * The minimum authoritative patient context the ranking engine needs.
 *
 * The education library deliberately accepts data rather than looking it up.
 * That keeps this module usable from the authenticated patient application
 * without importing the retired fixture corpus. Callers may omit clinical
 * signals that have not been captured or released; the shelf then falls back
 * to track-appropriate foundation content without inventing personalization.
 */
export interface EducationProfile {
  stableId: string;
  sex?: "male" | "female" | null;
  journeyStep?: number | null;
  goals?: readonly Goal[];
  symptoms?: readonly Symptom[];
  markers?: ReadonlyArray<{
    key: string;
    name: string;
    status: string;
  }>;
}

/** The clinic's channel. Referenced, never embedded. */
export const YOUTUBE_HANDLE = "@AlphaMaleDoc";

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

export const ARTICLES: Article[] = [
  // -------------------------------------------------------------------------
  // Cross-cutting — reading your own results
  // -------------------------------------------------------------------------
  {
    id: "edu-ref-vs-optimal",
    title: "Reference range vs optimal range: why \"normal\" isn't the finish line",
    topic: "Understanding Your Labs",
    track: "all",
    readMinutes: 6,
    format: "article",
    journeySteps: [2, 3],
    summary:
      "Where a lab's normal range actually comes from, why it is wider than you think, and what the second, narrower band on your results is doing there.",
    body: [
      "Every number on your panel arrives with a range beside it, and almost nobody is told where that range came from. It is not a target. It is a description of a population: the lab measured a large group of people, threw out the extreme few per cent at each end, and called what was left normal. The group included people who felt terrible, people who were undiagnosed, and people who were simply older. Being inside that band means your result is common. It says nothing about whether it is good.",
      "This matters most where the band is enormous. A total testosterone reference range that spans roughly 300 to 1000 ng/dL treats a 41-year-old at 320 and a 41-year-old at 950 as the same answer — normal — when the two men do not have the same life. The same is true of a TSH range that runs from 0.4 all the way to 4.5, or a ferritin range whose bottom end is low enough to be compatible with genuinely depleted iron stores.",
      "The second band on your results is the optimal range: the narrower window inside normal where the evidence and the clinic's experience suggest most people function best for their sex and age. It is the number your provider is actually reading. On your Labs page the lab's reference band is drawn in grey and the optimal window is marked inside it, so a result sitting in grey but outside the optimal window is visible at a glance instead of being buried in a PDF.",
      "Two honest caveats. First, an optimal range is a judgement, not a law of nature — different clinicians draw it slightly differently, and yours may be adjusted for your history. Second, a marker outside the optimal window is not a diagnosis and is not an emergency. It is a reason to look, usually alongside two or three other markers and what you have actually been feeling. One number in isolation almost never changes a plan.",
      "The practical use of all this is that it gives you a language for your follow-up. Instead of \"my labs were fine\", you can ask the question that gets somewhere: which of my results are inside normal but outside where you want them, and which one are we working on first?",
    ],
    relatedMarkers: ["tsh", "total_t", "ferritin", "vitd", "a1c"],
  },
  {
    id: "edu-thyroid-panel",
    title: "How to read a thyroid panel",
    topic: "Understanding Your Labs",
    track: "all",
    readMinutes: 7,
    format: "article",
    journeySteps: [2, 3],
    summary:
      "TSH, Free T4, Free T3 and Reverse T3 — what each one is measuring, and why a normal TSH on its own doesn't close the question.",
    body: [
      "The thyroid runs your metabolic rate. When it is under-producing, the symptoms are famously vague and famously easy to attribute to something else: fatigue that sleep doesn't fix, feeling cold when nobody else is, dry skin, hair thinning, constipation, low mood, weight that will not move on a diet that used to work.",
      "TSH — thyroid stimulating hormone — is the signal from your pituitary telling the thyroid to work harder. It is a control signal, not an output measure, and it moves in the opposite direction to what people expect: a high TSH means your body is shouting at a gland that is not delivering. It is the standard first-line test because it is sensitive, but on its own it is one side of a conversation.",
      "Free T4 is the main hormone the thyroid actually releases, and it is largely a storage form. Free T3 is the active one — the version that does the work in your tissues — and most of it is made by converting T4 elsewhere in the body, particularly the liver. That conversion step is where a lot of real-world symptoms live: it can be blunted by illness, chronic under-eating, heavy training loads, poor sleep and low nutrient status. \"Free\" in both names means the fraction not bound to carrier proteins, which is the fraction available to be used.",
      "Reverse T3 is an inactive mirror-image of T3 that the body produces from the same T4. Elevated levels are usually read as a sign that the system is throttling back — commonly during acute illness, severe caloric restriction or high stress. It is interpreted as context around the other three, not as a diagnosis in itself.",
      "The pattern that gets missed by a TSH-only screen is a TSH sitting in the upper half of normal with a Free T3 in the lower part of its range, in someone with the symptoms above. Neither number has crossed a line. Read together, and read against the optimal window rather than the reference band, they describe a system working harder to produce less.",
      "Thyroid results are also easy to disturb. Recent illness, a hard training block, a crash diet, biotin in a hair or nail supplement, and even the time of day you were drawn can all move them. A single off panel is a reason to recheck, not a reason to start anything — which is why your provider reads them in sequence rather than one at a time.",
    ],
    relatedMarkers: ["tsh", "ft3", "ft4", "rt3"],
    relatedSymptoms: ["Low energy", "Cold intolerance", "Brain fog", "Weight gain", "Hair thinning"],
    relatedGoals: ["Energy", "Cognition", "Fat loss"],
  },
  {
    id: "edu-metabolic-markers",
    title: "A1C, fasting insulin and what \"pre-diabetic\" actually means",
    topic: "Metabolic Health",
    track: "all",
    readMinutes: 7,
    format: "article",
    journeySteps: [2, 3, 4],
    summary:
      "Why fasting glucose is the last marker to move, what insulin adds that glucose can't, and why ApoB and triglycerides belong in the same conversation.",
    body: [
      "Metabolic health is the question of how well your body handles fuel, and it deteriorates in a specific order. Fasting glucose is usually the last thing to move, which makes it the worst early warning you could pick — by the time it is clearly abnormal, the process has often been running for years.",
      "Hemoglobin A1C is a rolling average. Glucose sticks to the haemoglobin in your red blood cells over their lifespan, so A1C reflects roughly the previous three months rather than the morning of the draw. That makes it hard to game and easy to trend, which is why it anchors most metabolic conversations. It has real limitations: anything that changes red cell turnover — anaemia, iron deficiency, recent blood loss, some haemoglobin variants — will skew it, which is one reason it is read next to a ferritin rather than alone.",
      "Fasting insulin is the marker that fills the gap. Insulin is the hormone that clears glucose out of your blood; when your tissues respond to it poorly, your pancreas compensates by producing more. For a long stretch that compensation works, and the result is a completely normal glucose achieved at a much higher insulin cost. Measuring only glucose sees nothing. Measuring insulin sees the effort.",
      "Triglycerides and ApoB round out the picture. Triglycerides tend to rise with the same insulin-resistant pattern and respond quickly to alcohol, refined carbohydrate and body fat. ApoB counts the number of atherogenic particles in your blood rather than the amount of cholesterol they are carrying, which is why it is increasingly preferred over LDL cholesterol alone — two people with identical LDL can carry very different particle counts, and the count tracks risk better.",
      "\"Pre-diabetic\" is a threshold, not a personality. It describes an A1C or fasting glucose in a defined band below the diabetes cut-off, and its usefulness is that it is a stage at which the trajectory is still very much modifiable. It is also, bluntly, a label applied at a line drawn by committee — someone just under it is not safe and someone just over it is not doomed.",
      "What actually moves these markers is unglamorous and well established: losing visceral fat, getting stronger, walking after meals, protein and fibre at the expense of refined carbohydrate, sleeping properly, and drinking less. Where medication is part of a plan, that is a provider's call made against your full picture — and it works alongside those things rather than instead of them.",
    ],
    relatedMarkers: ["a1c", "glucose", "insulin", "trig", "apob", "ldl", "hdl"],
    relatedGoals: ["Fat loss", "Energy"],
    relatedSymptoms: ["Weight gain", "Low energy", "Brain fog"],
  },
  {
    id: "edu-body-composition",
    title: "What a body composition scan actually measures",
    topic: "Body Composition",
    track: "all",
    readMinutes: 6,
    format: "article",
    journeySteps: [2, 4],
    summary:
      "Body fat percentage, skeletal muscle, visceral fat and total body water — what the device is really estimating, and how to make your numbers comparable.",
    body: [
      "The scale reports one number for a body made of several very different things. A body composition scan splits that number up, and the split is where the useful information is: two people at the same weight can be in entirely different health situations, and the same person at the same weight six months apart can have quietly traded muscle for fat.",
      "Most in-clinic devices use bioelectrical impedance. They send a small, imperceptible current through you and measure the resistance it meets. Fat, muscle and water conduct differently — muscle is largely water and conducts well, fat resists — so from that resistance plus your height, weight, age and sex the device estimates the rest. The key word is estimates. Impedance does not see fat; it infers it from an equation, and the equation is a model.",
      "That matters for how you read your results. The absolute body fat percentage carries real uncertainty and is not directly comparable to a figure from a different device or a DEXA scan. The trend on the same device, measured under the same conditions, is far more trustworthy than any single reading. This is why your care team keeps insisting on the boring protocol: same time of day, similar hydration, before rather than after training, and not straight after a large meal. Hydration is the biggest single confounder — being dehydrated can shift a reading enough to invent a change that did not happen.",
      "Skeletal muscle mass is the number worth protecting. Muscle is where most of your glucose gets disposed of, it is the main determinant of your resting metabolic rate, and it is the thing that most reliably predicts how well you function later in life. During weight loss it is also the thing most at risk, which is why protein intake and resistance training appear on nearly every plan that has a fat-loss goal on it.",
      "Visceral fat is reported as a level rather than a mass, and it is the fat packed around your organs rather than under your skin. It is more metabolically active than subcutaneous fat and tracks more closely with the metabolic markers on your panel — which is why it can fall meaningfully while your belt size has barely moved.",
      "Segmental readings — arms, trunk, each leg separately — are mostly useful for spotting asymmetry, particularly after an injury. Small left-right differences are normal and are within the noise of the measurement. A large, persistent one is worth mentioning.",
    ],
    relatedGoals: ["Fat loss", "Muscle gain"],
    relatedSymptoms: ["Weight gain", "Reduced strength"],
  },

  // -------------------------------------------------------------------------
  // Men's track
  // -------------------------------------------------------------------------
  {
    id: "edu-t-panel",
    title: "Testosterone: total, free, SHBG and why one number isn't enough",
    topic: "Testosterone Optimization",
    track: "men",
    readMinutes: 8,
    format: "article",
    journeySteps: [2, 3],
    summary:
      "What total testosterone leaves out, how SHBG changes the answer, and why the draw is scheduled for the morning.",
    body: [
      "Total testosterone measures everything circulating in your blood. The problem is that most of it is not available to you. A large fraction is bound tightly to sex hormone binding globulin (SHBG) and is effectively locked up; a further chunk is loosely bound to albumin; only a small percentage circulates free. Free testosterone plus the albumin-bound portion is what your tissues can actually use.",
      "This is why two men with the same total can have very different symptoms. High SHBG binds more of the total and leaves less free, so a perfectly respectable total number can sit on top of a genuinely low free level — a pattern that becomes more common with age and is easy to miss if only the total was ordered. Low SHBG does the reverse and is commonly seen alongside insulin resistance, obesity and fatty liver, which is one of several reasons a testosterone conversation almost always turns into a metabolic one.",
      "LH and FSH tell you where a problem sits. They are the signals from the pituitary telling the testes to produce. Low testosterone with high LH suggests the testes are being asked and not delivering; low testosterone with low or normal LH points further upstream. That distinction changes the assessment substantially, which is why they are ordered alongside rather than after.",
      "Estradiol belongs on the panel too. Men convert a portion of testosterone into estradiol via the aromatase enzyme, and men need estradiol — it is involved in bone density, mood, cognition and libido. Both too little and too much cause problems, and the level moves when total testosterone moves, which is why it is monitored rather than assumed.",
      "Timing and repetition matter more here than on almost any other marker. Testosterone follows a daily rhythm and is highest in the morning, so draws are scheduled early for comparability. It is also suppressed by acute illness, poor sleep, heavy alcohol and severe under-eating. A single low result in a man who slept four hours and has the flu is not a diagnosis — which is why a confirmed low is confirmed on a repeat draw before anything is decided.",
      "Symptoms are the other half. Low energy, low libido, difficulty holding muscle, low mood, poor recovery and brain fog are the classic cluster, and they are also the symptom list for half a dozen other things on your panel — thyroid, iron, vitamin D, sleep apnoea, depression, and simple overtraining among them. A responsible assessment rules those in or out rather than treating the first number that looks low.",
    ],
    relatedMarkers: ["total_t", "free_t", "shbg", "estradiol", "lh", "fsh"],
    relatedGoals: ["Libido", "Energy", "Muscle gain"],
    relatedSymptoms: ["Low libido", "Low energy", "Reduced strength", "Slow recovery"],
  },
  {
    id: "edu-trt-monitoring",
    title: "What gets monitored on hormone therapy, and why",
    topic: "Testosterone Optimization",
    track: "men",
    readMinutes: 6,
    format: "article",
    journeySteps: [4],
    summary:
      "Hematocrit, estradiol, PSA and lipids — the follow-up panel exists to catch specific, known things early. Here is what each one is watching for.",
    body: [
      "Testosterone therapy is a long-term medical treatment, and the reason it is delivered inside a monitoring schedule rather than as a prescription you collect is that it has a small number of well-characterised effects that are easy to catch early and much harder to unpick late. Your follow-up panel is not paperwork; each marker on it is watching for something specific.",
      "Hematocrit is the headline one. Testosterone stimulates red blood cell production, and in some men it pushes the proportion of red cells in the blood above the normal range. Thicker blood is the concern, and it is the single most common reason a plan gets adjusted. It is checked on a schedule precisely because it usually causes no symptoms until it is well up.",
      "Estradiol is monitored because it moves with testosterone via aromatase conversion, and men need it in a reasonable window. Both directions cause real symptoms, which is why the response is a provider re-evaluating the plan rather than the reader deciding a number looks wrong.",
      "PSA and prostate health are tracked according to age-appropriate screening practice. Therapy does not exempt anyone from the screening they would have had anyway, and having a baseline before starting is what makes a later change interpretable.",
      "Lipids, liver markers and blood pressure round it out, and there is a fertility conversation that belongs at the start rather than later: exogenous testosterone suppresses the body's own production signal, and that has implications for sperm production. Anyone who may want children is entitled to have that discussion before starting, not after.",
      "None of this describes what your own plan is or should be — doses, forms, intervals and targets are set by your provider against your labs and your history, and this article deliberately contains none of them. What it should give you is the ability to look at your follow-up panel and know what each line is there to catch.",
    ],
    relatedMarkers: ["hct", "estradiol", "psa", "total_t", "free_t"],
    relatedGoals: ["Libido", "Energy"],
  },
  {
    id: "edu-mens-sexual-health",
    title: "Sexual health: what low libido and erectile difficulty are usually telling you",
    topic: "Sexual Health",
    track: "men",
    readMinutes: 6,
    format: "article",
    journeySteps: [1, 2, 3],
    summary:
      "Libido and erectile function are different problems with different causes — and one of them is an early cardiovascular signal worth taking seriously.",
    body: [
      "These two get merged in conversation and they should not be. Libido is desire, and it is driven largely by hormones, mood, sleep, stress and relationship context. Erectile function is a mechanical and vascular event. It is entirely possible to have strong desire and unreliable function, or the reverse, and the two point at different parts of the assessment.",
      "Erectile difficulty deserves particular attention because the arteries involved are small. Endothelial dysfunction — the lining of the blood vessels not working properly — tends to show up in small vessels before large ones, which means new-onset erectile difficulty can precede a recognised cardiovascular problem by years. This is why the assessment includes lipids, ApoB, glucose, A1C and blood pressure rather than stopping at a hormone panel. It is a symptom worth treating as information about your whole vascular system.",
      "On the libido side, low testosterone is one contributor among several. Thyroid function, iron status, vitamin D, chronic sleep debt, alcohol, depression and anxiety, and a long list of common medications — including some antidepressants and blood pressure drugs — all affect desire. Some of the most effective interventions here are not prescriptions at all.",
      "The unglamorous factors carry more weight than most people expect. Sleep is strongly linked to testosterone production and to desire. Regular aerobic and resistance training improves vascular function. Excess visceral fat increases aromatase activity, shifting the hormonal balance. Alcohol affects both hormones and function. Smoking is directly damaging to the vessels involved.",
      "This is also the topic people postpone longest, and delay is the actual harm. It is a routine clinical conversation here, it is asked about directly at consultation, and treating it as a normal part of the assessment is how the underlying cause — which is often not what the patient assumed — gets found.",
    ],
    relatedMarkers: ["total_t", "free_t", "estradiol", "apob", "glucose", "a1c", "hdl"],
    relatedGoals: ["Libido", "Energy"],
    relatedSymptoms: ["Low libido", "Low energy"],
  },
  {
    id: "edu-recovery-performance",
    title: "Recovery: why you feel wrecked for days after a session you used to handle",
    topic: "Recovery & Performance",
    track: "all",
    readMinutes: 7,
    format: "article",
    journeySteps: [2, 4],
    summary:
      "Recovery is a budget with several inputs — sleep, fuel, training load, inflammation and iron among them. Here is how to work out which one is short.",
    body: [
      "Training does not make you fitter. Recovering from training makes you fitter — the session is the stimulus, and the adaptation happens afterwards in your sleep, on your food, over the following days. When recovery degrades, the same session that used to produce progress starts producing damage, and the first sign is usually not pain but persistence: soreness that lasts three days instead of one, and performance that flattens or slides despite the work going up.",
      "Sleep is the largest single input and it is not close. Deep sleep is when most of your growth hormone is released and when the bulk of tissue repair happens. Chronic short sleep measurably reduces strength, impairs glucose handling, raises perceived effort and blunts the hormonal response to training. No supplement compensates for it, and attempting to out-train it reliably makes things worse.",
      "Fuel is the second. Under-eating relative to your training load — particularly under-eating protein and total energy — puts you in a state where you are accumulating stimulus without the raw material to adapt to it. This is one of the more common patterns in people simultaneously chasing fat loss and performance, and it is why an aggressive deficit and a hard training block do not belong in the same month.",
      "On the panel side, several markers speak to recovery. hs-CRP is a general inflammation signal; persistently raised levels alongside joint symptoms are worth investigating rather than training through, though a single elevated value is often just a recent hard session or a cold. Ferritin reflects iron stores, and low iron is a classic cause of disproportionate fatigue and breathlessness on effort — it is under-checked in men and heavily under-checked in menstruating women. Vitamin D affects muscle function. IGF-1 gives a rough read on the growth hormone axis and is interpreted for your age rather than against a single number.",
      "Thyroid function and testosterone both influence recovery capacity too, which is why persistent recovery problems trigger a wider panel rather than a training tweak.",
      "The practical approach is boring and works: keep training load honest, protect sleep first, eat enough protein, take deload weeks deliberately rather than when injury forces one, and treat a sudden drop in recovery as a signal to investigate rather than a reason to push. Most of what people buy to fix recovery is trying to substitute for one of those five.",
    ],
    relatedMarkers: ["hscrp", "crp", "ferritin", "vitd", "igf1", "total_t", "tsh"],
    relatedGoals: ["Recovery", "Muscle gain", "Joint pain"],
    relatedSymptoms: ["Slow recovery", "Joint pain", "Poor sleep", "Elevated stress"],
  },
  {
    id: "edu-video-mens-labs",
    title: "Video: walking through a men's panel, marker by marker",
    topic: "Testosterone Optimization",
    track: "men",
    readMinutes: 3,
    format: "video",
    journeySteps: [2],
    summary:
      "A recorded walkthrough of what each section of a men's panel is for, from the clinic's own physician.",
    videoNote: `Published on the clinic's YouTube channel, ${YOUTUBE_HANDLE}. Search the channel for the panel walkthrough series — we link out rather than embedding, so nothing third-party loads on a page showing your results.`,
    body: [
      "The clinic publishes physician-led explainers on YouTube under the handle @AlphaMaleDoc, and the panel walkthrough series covers the same ground as the written articles here in a format that suits people who would rather be talked through it.",
      "Worth knowing before you watch: the videos are general education for a public audience, not commentary on your results. Anything in them that sounds like it applies to you is a good question for your follow-up rather than a conclusion. Your provider is reading your panel against your history, your medications and your goals, and that context is not available to a video.",
      "If you want the written version of the same material, the reference-range article and the testosterone panel article in this library cover it in more detail and stay in sync with what your Labs page shows.",
    ],
    relatedMarkers: ["total_t", "free_t", "shbg"],
  },

  // -------------------------------------------------------------------------
  // Women's track
  // -------------------------------------------------------------------------
  {
    id: "edu-perimenopause",
    title: "Perimenopause: the years before the transition, and why they're the confusing part",
    topic: "Perimenopause & Menopause",
    track: "women",
    readMinutes: 8,
    format: "article",
    journeySteps: [1, 2, 3],
    summary:
      "Perimenopause can run for years with periods still arriving. Here is what changes, why a single hormone test rarely settles it, and what FSH does and doesn't tell you.",
    body: [
      "Menopause is a single point in time — twelve consecutive months without a period, identified in retrospect. Perimenopause is the transition leading up to it, and it commonly runs for four to eight years, sometimes longer. It frequently begins in the early forties and can start earlier. Most of the symptoms people associate with menopause actually belong to perimenopause, which is the source of a great deal of confusion: cycles are still arriving, so the possibility gets dismissed.",
      "The defining feature is not decline but volatility. Estrogen in perimenopause does not fall smoothly; it swings, sometimes to levels higher than in a standard cycle, before trending down overall. Progesterone tends to drop earlier and more consistently as ovulatory cycles become less reliable. That combination explains why the symptom picture is so erratic — good months and bad months are the pattern, not evidence that nothing is wrong.",
      "The symptom list is wide and much of it is not obviously gynaecological: cycles becoming shorter, longer or heavier; hot flushes and night sweats; sleep that fragments in the early hours; anxiety or irritability that feels out of proportion and is often new; brain fog and word-finding difficulty; joint aches; weight redistributing toward the middle; and changes to libido and vaginal comfort. Fatigue is nearly universal and is regularly attributed to everything else in a person's life first.",
      "Testing has real limits here, and this is the part most worth understanding. Because hormones fluctuate day to day in perimenopause, a single estradiol or FSH result reflects the day it was drawn and little more. A raised FSH is consistent with the transition but a normal one does not rule it out. Symptoms and cycle history carry more diagnostic weight than any single panel — which is why a good assessment spends time on your history rather than reaching for a test.",
      "What labs are genuinely useful for is ruling other things in or out, because thyroid dysfunction, iron deficiency, vitamin D deficiency and metabolic change produce an overlapping symptom picture and are common in the same age band. Finding one of those does not mean you are not in perimenopause; it means there is something addressable alongside it.",
      "Treatment options include hormone therapy and non-hormonal approaches, and the appropriate choice depends on your symptoms, your medical history, your risk factors and your preferences. That is a provider conversation. What is not up for debate is that the symptoms are real and physiological, and that being told to wait it out is not a plan.",
    ],
    relatedMarkers: ["estradiol", "fsh", "lh", "tsh", "ft3", "ferritin", "vitd"],
    relatedGoals: ["Energy", "Sleep", "Cognition"],
    relatedSymptoms: ["Low energy", "Poor sleep", "Mood changes", "Brain fog", "Weight gain"],
  },
  {
    id: "edu-womens-hormone-balance",
    title: "Women's hormone panels: what's measured and why timing matters",
    topic: "Hormone Balance",
    track: "women",
    readMinutes: 7,
    format: "article",
    journeySteps: [2, 3],
    summary:
      "Estradiol, progesterone, FSH, LH, testosterone and SHBG — what each does, and why the day of your cycle changes the answer.",
    body: [
      "The single most important thing about a woman's hormone panel is that several of the markers on it are meaningless without knowing where you were in your cycle when it was drawn. Estradiol, progesterone, LH and FSH all vary substantially across a normal cycle by design. A result that is unremarkable on day three may be alarming on day twenty-one and vice versa, so the draw is scheduled deliberately and the cycle day is recorded with the sample.",
      "Estradiol is the dominant estrogen through the reproductive years. It affects far more than reproduction: bone density, blood vessel function, skin, mood, sleep quality, cognition and vaginal tissue health all respond to it. Its decline is why the menopausal transition has effects well beyond hot flushes.",
      "Progesterone rises after ovulation and is the reason a mid-luteal draw is used to check whether ovulation occurred. It has a calming, sleep-supporting effect for many women, and its earlier decline in perimenopause is often what people are describing when they say sleep and anxiety changed before anything else did.",
      "FSH and LH are the pituitary's instructions to the ovaries. As ovarian responsiveness falls, FSH tends to rise as the body signals harder — which is why it is used as a supporting marker for the transition, with the caveat that it fluctuates and a single value proves little.",
      "Testosterone is on the panel because women produce and need it, at roughly a tenth to a twentieth of male levels. It contributes to libido, muscle maintenance, bone density, mood and energy, and it declines gradually with age rather than sharply at menopause. SHBG matters here for the same reason it does in men: it binds testosterone and estradiol, so it changes how much is actually available. It is raised by oral estrogen and by hormonal contraception and lowered in insulin-resistant states, which means it is often the marker that explains a confusing result.",
      "Thyroid markers, ferritin and vitamin D are usually run alongside, because thyroid disorders and iron deficiency are considerably more common in women and produce a symptom picture that overlaps almost completely with hormonal change. Sorting out which is contributing is most of the work of a good assessment.",
    ],
    relatedMarkers: ["estradiol", "fsh", "lh", "total_t", "free_t", "shbg", "tsh", "ferritin"],
    relatedGoals: ["Energy", "Libido", "Sleep"],
    relatedSymptoms: ["Mood changes", "Low energy", "Low libido", "Poor sleep"],
  },
  {
    id: "edu-women-weight-energy",
    title: "Weight and energy in your forties: what actually changed",
    topic: "Weight & Energy",
    track: "women",
    readMinutes: 7,
    format: "article",
    journeySteps: [2, 3, 4],
    summary:
      "Why the approach that used to work stops working, where the weight redistributes to, and the non-hormonal causes worth ruling out first.",
    body: [
      "The most common version of this complaint is precise and worth taking literally: nothing about my eating or training changed, and my body did. That is a real phenomenon with several contributors stacked on top of each other, and it is not a discipline problem.",
      "Some of it is straightforwardly age-related rather than hormonal. Muscle mass declines gradually from around the thirties unless it is actively defended, and muscle is metabolically expensive tissue — losing it lowers your resting energy expenditure. People also tend to move less in non-exercise ways as work and life get busier, which is a larger share of daily energy expenditure than most realise.",
      "Some of it is hormonal, and the more noticeable change is where fat sits rather than how much. Falling estrogen shifts storage from hips and thighs toward the abdomen, including visceral fat around the organs. That redistribution is why clothes can fit differently at an unchanged weight, and why waist measurement and a body composition scan tell you more here than the scale does. Declining estrogen is also associated with reduced insulin sensitivity, which changes how the same meal is handled.",
      "Sleep is the underrated multiplier. Perimenopausal sleep disruption — waking at three or four in the morning, night sweats, fragmented sleep — worsens insulin sensitivity, raises appetite signalling and reduces the energy available for training the next day. Fixing sleep is frequently the intervention that makes everything else work, and it is regularly skipped in favour of a harder diet.",
      "Before assuming hormones, the assessment rules out the things that are common, treatable and produce exactly this picture: hypothyroidism, iron deficiency, vitamin D deficiency, B12 deficiency and insulin resistance. Any of them can present as weight gain plus exhaustion, and finding one changes the plan substantially.",
      "What tends to work looks different from what worked at twenty-five. Resistance training becomes a priority rather than an optional extra, because defending muscle is defending your metabolic rate. Protein requirements are higher than most women are eating. Aggressive caloric restriction tends to backfire by accelerating muscle loss and worsening sleep. Where hormone therapy is appropriate it is decided by your provider against your history — it is one part of a plan, not a substitute for the rest of it.",
    ],
    relatedMarkers: ["tsh", "ft3", "insulin", "a1c", "vitd", "b12", "ferritin", "estradiol"],
    relatedGoals: ["Fat loss", "Energy"],
    relatedSymptoms: ["Weight gain", "Low energy", "Cold intolerance", "Poor sleep"],
  },
  {
    id: "edu-women-libido-mood",
    title: "Libido and mood: what's hormonal, what isn't, and what to check",
    topic: "Libido & Mood",
    track: "women",
    readMinutes: 6,
    format: "article",
    journeySteps: [1, 2, 3],
    summary:
      "Desire in women is genuinely multifactorial. Here is the honest map of the contributors, including the ones a hormone panel will never show.",
    body: [
      "Female desire responds to more inputs than male desire does, and pretending otherwise leads to bad care. Hormones are one input. Sleep, mood, stress load, relationship context, physical comfort during sex, body image, medications and simple exhaustion are all genuine contributors, and in a lot of cases the hormonal component is not the largest one.",
      "The hormonal contributors are real, though. Testosterone contributes to desire in women as it does in men, at much lower levels, and declines gradually with age. Estradiol affects vaginal tissue health, lubrication and comfort — and pain or discomfort during sex reduces desire for entirely rational reasons that have nothing to do with libido as such. Progesterone influences sleep and anxiety, and its earlier fall in perimenopause is often felt as mood change before anything else registers. SHBG matters because it binds testosterone: anything that raises it, including oral estrogen and hormonal contraception, lowers what is available.",
      "The non-hormonal contributors deserve equal time. SSRIs and SNRIs commonly reduce desire and delay orgasm; that is a well-documented effect, not a personal failing, and it is worth raising rather than enduring. Hormonal contraception affects some women's libido and not others. Chronic sleep deprivation, high stress and untreated depression all suppress desire. So does exhaustion, which is not a diagnosis but is frequently the whole answer.",
      "Mood changes in the perimenopausal window deserve their own note. New or markedly worsened anxiety and irritability in the early-to-mid forties, in someone without a prior history, is a recognised pattern linked to hormonal fluctuation rather than a separate psychiatric event appearing from nowhere. It is also genuinely distressing and frequently dismissed, including by the person experiencing it.",
      "Practically: the panel checks thyroid, iron, vitamin D and the relevant hormones, the consultation covers medications and sleep honestly, and the plan addresses whichever contributors are actually present. If a symptom is being caused by a medication you need, that is a conversation about alternatives with the prescriber, not something to work around silently.",
    ],
    relatedMarkers: ["total_t", "free_t", "shbg", "estradiol", "tsh", "vitd", "ferritin"],
    relatedGoals: ["Libido", "Energy", "Sleep"],
    relatedSymptoms: ["Low libido", "Mood changes", "Low energy", "Elevated stress"],
  },
  {
    id: "edu-video-womens-track",
    title: "Video: hormone questions women ask most",
    topic: "Perimenopause & Menopause",
    track: "women",
    readMinutes: 3,
    format: "video",
    journeySteps: [1, 2],
    summary:
      "Physician-led answers to the questions that come up most often at consultation on the women's track.",
    videoNote: `On the clinic's YouTube channel, ${YOUTUBE_HANDLE}. We reference it rather than embedding a third-party player inside a page that displays your health data.`,
    body: [
      "The clinic's channel covers the women's track alongside the men's, and the hormone Q&A material answers the questions that come up most at consultation — what perimenopause actually is, why testing is less definitive than people expect, and what the options are.",
      "The same caveat applies as to any general educational video: it is written for a public audience and cannot account for your history, your medications or your results. Treat anything that lands as a question to bring to your provider rather than as a conclusion about your own care.",
      "The perimenopause and hormone panel articles in this library cover the same ground in writing, with the ranges kept consistent with what your Labs page shows.",
    ],
    relatedMarkers: ["estradiol", "fsh"],
  },

  // -------------------------------------------------------------------------
  // Cross-cutting foundations
  // -------------------------------------------------------------------------
  {
    id: "edu-peptides-evidence",
    title: "Peptides: what the evidence does and doesn't say",
    topic: "Peptides",
    track: "all",
    readMinutes: 8,
    format: "article",
    journeySteps: [3, 4],
    summary:
      "An honest account of a category where the marketing is far ahead of the data — what a peptide is, what is actually approved, and what the open questions are.",
    body: [
      "A peptide is just a short chain of amino acids — a small protein. That is a structural description, not a therapeutic one, and it is worth starting there because \"peptides\" as a marketing category groups together compounds with wildly different levels of evidence behind them. Insulin is a peptide. So is a research compound with a handful of animal studies. The word tells you nothing about whether something works.",
      "Some peptide medications are extensively studied, regulatory-approved and genuinely transformative. The GLP-1 receptor agonists used in metabolic and weight management are peptides, and they have large randomised controlled trials behind them for defined indications. Insulin, and several hormone analogues used in endocrinology, are peptides with decades of data. When these are appropriate for a patient, they are prescribed and monitored like any other medication.",
      "Then there is the much larger group promoted online for recovery, tissue repair, growth hormone support, tanning, sleep and cognition. Here the honest position is that the evidence is thin. Much of what is cited is preclinical — cell culture and animal work — and preclinical promise translates to human benefit a minority of the time. Human trials, where they exist at all, are frequently small, short, unblinded or uncontrolled. Absence of good evidence is not proof that something does not work, but it is not evidence that it does, and the marketing routinely presents the first as the second.",
      "There is a supply-side problem too. A significant share of this market runs through channels selling material labelled for research use only, with no meaningful guarantee of identity, purity, sterility or dose. Independent testing of such products has repeatedly found contents that do not match the label. Whatever the underlying compound does or does not do, that is a distinct and real risk.",
      "The specific claims worth treating with the most scepticism are the ones that promise systemic transformation from a compound with no human outcome data, anything advertised as having benefits without trade-offs, and anything sold direct to the public with dosing instructions attached. Growth-hormone-related compounds deserve particular caution: the axis they act on affects glucose handling and cell growth, and long-term human safety data is largely absent.",
      "What that means here is straightforward. Anything in this category on your plan is a provider decision, made against your labs and history, with an explicit reason attached to it and an explicit monitoring schedule. This article contains no doses, intervals or protocols by design — not as caution theatre, but because publishing them to a general audience is exactly how people end up self-administering something they have not been assessed for.",
      "The reasonable question to ask about anything proposed to you is the same one you would ask about any treatment: what is the evidence in humans, what is being monitored, what would make us stop, and what is the alternative? A good answer to those exists for the well-studied compounds. Where it does not, that should be said plainly rather than papered over.",
    ],
    relatedGoals: ["Recovery", "Fat loss", "Muscle gain"],
    relatedSymptoms: ["Slow recovery"],
  },
  {
    id: "edu-sleep",
    title: "Sleep: the intervention that makes the others work",
    topic: "Sleep",
    track: "all",
    readMinutes: 7,
    format: "article",
    journeySteps: [3, 4],
    summary:
      "What is actually happening during the night, what wrecks it, and the changes that carry most of the effect — plus the symptoms that mean this needs assessing rather than optimising.",
    body: [
      "Sleep is upstream of nearly everything else on your plan. Short or fragmented sleep measurably reduces insulin sensitivity, raises appetite and cravings, lowers testosterone in men, impairs recovery from training, worsens mood and increases perceived effort at the same workload. When someone's plan is not working and their sleep is broken, sleep is usually the plan.",
      "Structurally, the night runs in roughly ninety-minute cycles. Deep slow-wave sleep dominates the first half and is when most tissue repair and the bulk of growth hormone release happen. REM sleep dominates the second half and is disproportionately involved in memory consolidation and emotional processing. This has a practical consequence: cutting sleep short at the end preferentially removes REM, while going to bed very late preferentially removes deep sleep. They are not interchangeable hours.",
      "The changes with the most evidence behind them are dull. A consistent wake time, including at weekends, anchors the whole system more effectively than a consistent bedtime does. Morning daylight — outdoors, within an hour or so of waking — is the strongest signal for setting your internal clock. A cool, dark, quiet room. Caffeine has a half-life of several hours, so an afternoon coffee is still measurably present at bedtime for many people. Alcohol is worth singling out: it shortens time to falling asleep and then reliably fragments the second half of the night and suppresses REM, which is why a nightcap produces sleep that does not restore.",
      "Late heavy meals, hard training within a couple of hours of bed, and using the bed as a workspace all work against you. Screens matter, though light exposure is probably a smaller factor than what the screen is doing to your arousal level.",
      "Some sleep problems are medical and need assessing rather than optimising. Loud snoring, witnessed pauses in breathing, gasping awake, unrefreshing sleep despite adequate hours, and heavy daytime sleepiness are the classic signs of obstructive sleep apnoea — a condition that is common, frequently undiagnosed, worse with excess weight, and independently harmful to metabolic and cardiovascular health. It also suppresses testosterone. If that list describes you, say so at your visit: no lifestyle change substitutes for having it properly assessed.",
      "Insomnia that persists is also treatable, and the first-line treatment with the best evidence is a structured behavioural programme rather than a sedative. Waking at three in the morning specifically, in a woman in her forties, is common enough in the perimenopausal transition to be worth raising as a hormonal question rather than a sleep-hygiene one.",
    ],
    relatedGoals: ["Sleep", "Recovery", "Energy", "Cognition"],
    relatedSymptoms: ["Poor sleep", "Low energy", "Brain fog", "Slow recovery", "Elevated stress"],
    relatedMarkers: ["igf1", "total_t", "a1c", "insulin"],
  },
  {
    id: "edu-protein",
    title: "Protein: how much, from where, and why it's on nearly every plan",
    topic: "Nutrition",
    track: "all",
    readMinutes: 6,
    format: "article",
    journeySteps: [3, 4],
    summary:
      "The one nutrition change that shows up on almost every plan here, and the reasoning behind it — including who needs to be careful with it.",
    body: [
      "Protein appears on most plans for three reasons that stack. It is the raw material for maintaining muscle, which matters enormously during weight loss because the tissue you keep determines what your metabolic rate looks like at the end. It is the most satiating of the three macronutrients, so a higher-protein diet tends to reduce hunger at the same calorie intake. And it has the highest thermic effect — a meaningfully larger share of its energy is spent digesting it.",
      "Requirements are higher than official minimums for anyone training or losing weight. The recommended daily allowance is set to prevent deficiency in a sedentary adult, not to support muscle maintenance in someone in a caloric deficit lifting three times a week, and treating the two as the same number is the most common error people make here. Your specific target is set on your plan against your body composition, your training and your kidney function — this article deliberately does not print a number, because the right one is individual.",
      "Distribution matters more than most people expect. Muscle protein synthesis responds to a meaningful dose of protein at a sitting, so spreading intake across the day tends to outperform the common pattern of a token breakfast and a large dinner. The practical version is that breakfast is usually where the shortfall is.",
      "On sources: animal proteins — meat, fish, eggs, dairy — provide the full amino acid profile in a readily usable form, and dairy is unusually high in leucine, the amino acid most implicated in triggering muscle protein synthesis. Plant sources work perfectly well, but generally need larger total intake and some variety across the day to cover the amino acid profile. Soy is the main plant exception, being complete on its own. Protein powder is food, not a supplement in any meaningful sense; it is convenient and nothing more.",
      "Two honest caveats. In people with normal kidney function, higher protein intake has not been shown to cause kidney damage — that concern is a misapplication of advice that is genuinely important for people with existing kidney disease. If your kidney markers are abnormal, protein targets are set by your provider, and that is a real exception rather than a formality. And protein is not magic: it works inside a total energy intake, and no amount of it compensates for the rest of the diet.",
    ],
    relatedGoals: ["Fat loss", "Muscle gain", "Recovery"],
    relatedSymptoms: ["Weight gain", "Reduced strength", "Slow recovery"],
    relatedMarkers: ["creatinine", "egfr", "insulin", "a1c"],
  },
  {
    id: "edu-training-basics",
    title: "Training basics: the parts that actually matter",
    topic: "Training",
    track: "all",
    readMinutes: 7,
    format: "article",
    journeySteps: [3, 4],
    summary:
      "Progressive overload, why resistance training is non-negotiable for anyone losing weight, and how much cardio is enough.",
    body: [
      "Almost all of the results from training come from a small number of principles, and almost all of the argument online is about the parts that barely matter. If you get consistency, progressive overload and adequate recovery right, the choice of exercises and the split you use are details.",
      "Progressive overload is the whole mechanism. Muscle and bone adapt to a demand that exceeds what they are used to; repeat the identical stimulus indefinitely and adaptation stops. Progression can come from more weight, more reps at the same weight, better control, or more quality sets over time — the variable matters less than the fact that something is trending up. This is also why tracking what you actually did is the highest-leverage habit in training: without a record, you are guessing whether you progressed.",
      "Resistance training is not optional for anyone losing weight. Muscle is preferentially lost in a caloric deficit unless there is a signal telling the body to keep it, and lifting is that signal. Weight loss without it produces a lighter version of the same body composition problem, and often a lower metabolic rate to defend afterwards. It is equally non-negotiable for women — the fear of getting bulky is not supported by physiology, and bone density in the decades around and after menopause is a serious enough issue on its own to justify it.",
      "Compound movements — squat, hinge, press, pull, carry — cover the most tissue per unit of time and transfer best to real life. Two to four sessions a week is enough for most people to progress; more is not automatically better once recovery becomes the constraint. Working within a few reps of genuine failure on your working sets is what makes a set count, and the most common reason people plateau is training further from that than they think.",
      "Cardiovascular work does something resistance training does not. Cardiorespiratory fitness is one of the strongest predictors of all-cause mortality in the literature, and the improvement from the bottom of the range to merely average is the largest single step available. Most of the volume should be easy — conversational pace, where you can hold a sentence — with a smaller amount of harder work. Zone-obsessive precision is not required; the split between mostly easy and occasionally hard is the part that matters.",
      "Beyond structured training, daily movement counts more than it gets credit for. Walking, stairs and simply not sitting for nine hours make up a substantial share of daily energy expenditure, and they are the part that quietly disappears when work gets busy. Finally: sustainable beats optimal. The best programme is the one you are still running in six months, which is the window your follow-up panel will be read against.",
    ],
    relatedGoals: ["Muscle gain", "Fat loss", "Recovery", "Joint pain"],
    relatedSymptoms: ["Reduced strength", "Weight gain", "Slow recovery"],
  },
  {
    id: "edu-vitamin-d-iron",
    title: "Vitamin D, B12 and ferritin: the deficiencies that look like everything else",
    topic: "Understanding Your Labs",
    track: "all",
    readMinutes: 6,
    format: "article",
    journeySteps: [2, 3],
    summary:
      "Three common, correctable deficiencies that present as fatigue, brain fog and hair loss — and why the bottom of the reference range is a poor target.",
    body: [
      "These three come up constantly because they are common, they are correctable, and they produce a symptom picture almost identical to the hormonal problems people arrive assuming they have. Checking them first is not a delaying tactic; it is how you avoid treating the wrong thing.",
      "Ferritin reflects your stored iron, and it is the most misread number of the three. The reference range's bottom end is low enough that a result technically inside it can still represent genuinely depleted stores, particularly in menstruating women. Symptoms of low iron — disproportionate fatigue, breathlessness on exertion, poor exercise tolerance, hair shedding, restless legs, cold hands — appear well before anaemia does, because your body sacrifices the stores first and the haemoglobin last. A normal full blood count therefore does not rule out an iron problem. One important caveat: ferritin also rises with inflammation, so a normal-looking ferritin alongside a raised hs-CRP can conceal a deficiency, which is one reason those two are read together.",
      "Vitamin D behaves more like a hormone than a vitamin, with receptors throughout the body. Deficiency is common in anyone working indoors, at higher latitudes, in winter, with darker skin, or carrying excess body fat — which sequesters it. Low levels are associated with fatigue, low mood, bone loss and reduced muscle function. It is worth being honest about the evidence here: correcting a genuine deficiency has clear value, while supplementation in people who are already replete has been repeatedly disappointing in large trials. It is not a general-purpose tonic.",
      "B12 deficiency causes fatigue, brain fog, low mood and — importantly — neurological symptoms including numbness and tingling, which can become permanent if left long enough. Risk is higher in vegetarians and vegans, in older adults whose absorption declines, in people on long-term metformin, and in people on long-term acid-suppressing medication. As with ferritin, symptoms often appear in the lower part of the reference range rather than below it, which is why the optimal window sits higher.",
      "The reason these three sit near the top of the assessment is that finding one changes the plan immediately and cheaply. Correcting a deficiency is a food or supplement conversation, not a prescription one, and it is the single most common example of the plan being simpler than the member expected. It is also why your provider rechecks rather than assuming a correction worked.",
    ],
    relatedMarkers: ["vitd", "b12", "ferritin", "hscrp"],
    relatedGoals: ["Energy", "Cognition", "Skin/hair"],
    relatedSymptoms: ["Low energy", "Brain fog", "Hair thinning", "Cold intolerance"],
  },
  {
    id: "edu-inflammation",
    title: "hs-CRP: what an inflammation marker can and can't tell you",
    topic: "Recovery & Performance",
    track: "all",
    readMinutes: 5,
    format: "article",
    journeySteps: [2, 4],
    summary:
      "A single, non-specific number that is genuinely useful for trends and genuinely misleading as a snapshot.",
    body: [
      "C-reactive protein is made by the liver in response to inflammation anywhere in the body. The high-sensitivity version, hs-CRP, can detect the much lower levels associated with chronic, low-grade inflammation rather than acute illness, and it is that low-grade band that is of interest on a wellness panel.",
      "Its great weakness is that it is completely non-specific. It cannot tell you where the inflammation is or what is causing it. A raised result is consistent with a cold you are getting over, a hard training session two days ago, a dental infection, an autoimmune condition, obesity, poor sleep, smoking, or the low-grade inflammation associated with insulin resistance. It is a smoke detector: useful that it went off, uninformative about which room.",
      "That is why a single elevated hs-CRP is treated as a reason to recheck rather than a finding. Anything acute will resolve over a few weeks; if it is still up on a repeat draw taken when you are well and rested, it becomes worth investigating. Timing your draw when you are not ill and not immediately post-training is what makes the number interpretable at all.",
      "Where it earns its place is as a trend alongside the metabolic markers. Persistently raised hs-CRP tracks with visceral fat, poor metabolic health and cardiovascular risk, and it tends to fall with the same things that improve those — losing visceral fat, sleeping properly, training consistently, drinking less, not smoking. Read next to your A1C, triglycerides and ApoB rather than on its own, it adds real information.",
      "If yours is up alongside joint symptoms, that is a specific combination worth raising directly rather than training through, because it is one of the patterns that warrants a wider look.",
    ],
    relatedMarkers: ["hscrp", "crp", "a1c", "trig", "apob"],
    relatedGoals: ["Joint pain", "Recovery"],
    relatedSymptoms: ["Joint pain", "Slow recovery"],
  },
  {
    id: "edu-hsa-fsa",
    title: "Using HSA and FSA funds here",
    topic: "Paying for Care",
    track: "all",
    readMinutes: 4,
    format: "article",
    journeySteps: [1, 3, 4],
    summary:
      "The clinic accepts HSA and FSA cards. What the two accounts are, how they differ, and what to keep for your records.",
    body: [
      "Alpha Health accepts HSA and FSA payment. Both are tax-advantaged accounts for qualified medical expenses, funded with pre-tax money, and both are worth understanding because they change the real cost of care meaningfully.",
      "A Health Savings Account is paired with a high-deductible health plan. The money is yours, it rolls over year to year with no deadline, it stays with you if you change jobs, and it can be invested. A Flexible Spending Account is offered through an employer, is generally use-it-or-lose-it within the plan year — though many plans allow a limited carryover or a short grace period — and does not follow you if you leave. The practical difference is urgency: an FSA balance has a clock on it, an HSA does not.",
      "What qualifies is set by the IRS, not by us, and it turns on whether an expense is for the diagnosis, treatment or prevention of a medical condition. Consultations, laboratory testing and prescribed medications are typically qualified expenses. Items that are primarily for general health or cosmetic purposes are typically not, and some expenses are only qualified with a letter of medical necessity from your provider. Plan administrators vary in what they will accept.",
      "Practically: pay with the card at the time of service where you can, keep your itemised receipts, and ask if you need documentation from your provider for a specific item — that is a normal request and the front desk handles it routinely. Your invoices and payment records are available in this app under your billing section, which is usually what an administrator asks for if a charge is queried.",
      "One honest limitation: we cannot tell you whether a particular expense will be accepted by your specific plan. Rules vary between administrators and change between plan years. Your plan administrator is the authority on your account, and it is worth a call before a large payment rather than after.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookup + search
// ---------------------------------------------------------------------------

export function article(id: string): Article | undefined {
  return ARTICLES.find((a) => a.id === id);
}

/** Articles a member of this sex should see. Opposite-track content is hidden, not down-ranked. */
export function articlesForSex(sex: "male" | "female"): Article[] {
  const own: Track = sex === "male" ? "men" : "women";
  return ARTICLES.filter((a) => a.track === "all" || a.track === own);
}

export function byTopic(topic: Topic, sex?: "male" | "female"): Article[] {
  const pool = sex ? articlesForSex(sex) : ARTICLES;
  return pool.filter((a) => a.topic === topic);
}

/** Substring search over title, summary, topic and body. Case-insensitive. */
export function searchArticles(q: string, pool: Article[] = ARTICLES): Article[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return pool;
  return pool.filter((a) =>
    [a.title, a.summary, a.topic, ...(a.relatedGoals ?? []), ...(a.relatedSymptoms ?? []), ...a.body]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

// ---------------------------------------------------------------------------
// Recommendation
// ---------------------------------------------------------------------------

export interface ArticleRecommendation {
  article: Article;
  /** One line, addressed to the member, explaining why THEY are seeing this. */
  reason: string;
  /** Internal ranking score. Exposed for debugging and ordering only. */
  score: number;
}

/**
 * Member-safe phrasing for a biomarker status.
 *
 * A bare "high" next to a member's own number is an unexplained panic word, so
 * the same translation discipline the plan uses in lib/planOfCare/memberVoice.ts
 * applies here. These reasons are lab-derived rather than plan-derived, so the
 * strings live locally, but the tone is deliberately identical.
 */
const MARKER_PHRASE: Record<string, string> = {
  watch: "came back worth watching",
  low: "came back below where we'd like it",
  high: "came back above where we'd like it",
};

/** Weights. Tuned so a real out-of-range result outranks a generic goal match. */
const W = {
  marker: 5,
  symptom: 3,
  goal: 2,
  journey: 2,
  ownTrack: 1,
};

/**
 * Rank the library for one member.
 *
 * The ranking signals, in descending weight:
 *
 *  1. Their own out-of-optimal markers. This is the signal that makes the shelf
 *     feel like a clinic rather than a content farm — "because your thyroid
 *     panel came back worth watching" is only sayable because the article
 *     declares which markers it explains and we can read the member's panel.
 *  2. Symptoms they reported at intake.
 *  3. Goals they told us they are working toward.
 *  4. Where they are in the clinic's four-step journey — someone who has not
 *     been drawn yet does not need the follow-up-panel monitoring article.
 *
 * The reason line always quotes the STRONGEST matched signal, because a reason
 * that lists four things is a reason nobody reads.
 *
 * Deterministic throughout: ties break on a seeded jitter keyed to the member
 * and article id, never on Math.random, so SSR and client agree forever.
 */
export function recommendedFor(
  profile: EducationProfile,
  limit = 6,
): ArticleRecommendation[] {
  const step = profile.journeyStep ?? 0;

  // Marker key → the member-facing sentence fragment for its current state.
  // Only non-optimal markers are indexed; an in-range marker is not a reason
  // to read anything.
  const flagged = new Map<string, { name: string; status: string }>();
  for (const b of profile.markers ?? []) {
    if (b.status !== "optimal") flagged.set(b.key, { name: b.name, status: b.status });
  }

  const goals = new Set<string>(profile.goals ?? []);
  const symptoms = new Set<string>(profile.symptoms ?? []);
  const pool =
    profile.sex === "male" || profile.sex === "female"
      ? articlesForSex(profile.sex)
      : ARTICLES;

  const scored = pool.map((a) => {
    let score = 0;
    // Track a candidate reason for each signal type, strongest first.
    let markerReason: string | undefined;
    let symptomReason: string | undefined;
    let goalReason: string | undefined;

    for (const key of a.relatedMarkers ?? []) {
      const hit = flagged.get(key);
      if (!hit) continue;
      score += W.marker;
      // First flagged marker wins the sentence — later ones still add score.
      if (!markerReason) {
        markerReason = `Because your ${hit.name} ${MARKER_PHRASE[hit.status] ?? "is being tracked"}.`;
      }
    }

    for (const s of a.relatedSymptoms ?? []) {
      if (!symptoms.has(s)) continue;
      score += W.symptom;
      if (!symptomReason) symptomReason = `Because you mentioned ${s.toLowerCase()}.`;
    }

    for (const g of a.relatedGoals ?? []) {
      if (!goals.has(g)) continue;
      score += W.goal;
      if (!goalReason) {
        goalReason = `Because ${g.toLowerCase()} is one of the goals you told us about.`;
      }
    }

    if (step > 0 && a.journeySteps?.includes(step)) score += W.journey;
    if (a.track !== "all") score += W.ownTrack;

    // Deterministic tiebreak — keeps the shelf stable per member without
    // making two equally-relevant articles fight over insertion order.
    const jitter = seededRandom(`${profile.stableId}:${a.id}`)() * 0.5;

    const reason =
      markerReason ??
      symptomReason ??
      goalReason ??
      journeyReason(step, a) ??
      (a.track !== "all"
        ? "General education selected for your care track."
        : "A foundation article from Alpha Health's education library.");

    return { article: a, reason, score: score + jitter };
  });

  return scored
    .filter((r) => r.score >= 1) // below this it is filler, and filler dilutes the shelf
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Fallback reason for an article matched only on where the member is in the journey. */
function journeyReason(step: number, a: Article): string | undefined {
  if (!a.journeySteps?.includes(step)) return undefined;
  switch (step) {
    case 1:
      return "Because you're at the consultation stage — this is the useful background.";
    case 2:
      return "Because your testing and assessment is the current step.";
    case 3:
      return "Because your plan is being written right now.";
    case 4:
      return "Because you're in the follow-up and optimisation phase.";
    default:
      return undefined;
  }
}
