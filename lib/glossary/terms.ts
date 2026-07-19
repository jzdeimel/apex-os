// =============================================================================
// Apex — member glossary
// =============================================================================
//
// Every clinical word this app is willing to put in front of a member, defined
// in language a member can actually use.
//
// Three rules govern every entry in this file, and they are the reason it is a
// data file rather than prose scattered through components:
//
//  1. NOTHING HERE IS DIAGNOSTIC. A definition explains what a marker measures
//     and why the clinic tracks it. It never tells a member what their own
//     number means, never names a condition they might have, and never implies
//     a treatment. "High ferritin means you have haemochromatosis" is the exact
//     sentence this file exists to prevent.
//  2. NO DOSES, NO FREQUENCIES, NO ROUTES presented as instruction. `peptide`,
//     `subcutaneous` and `titration` describe *categories and concepts*, not
//     protocols. A member's actual protocol comes from lib/planOfCare, which is
//     provider-approved; the glossary must never look like a second source of
//     it.
//  3. PLAIN, BUT NOT VAGUE. Hedging a definition into "may be related to
//     various factors" is worse than no definition — it teaches the member that
//     asking was pointless. Say the true thing simply.
//
// `short` is one sentence: what the thing IS. `why` is the second beat: why
// this clinic bothers to measure it. They are separate fields because the
// tooltip shows both and the glossary index shows only `short`.
//
// Deterministic and static. No dates, no randomness — a definition is not data
// that changes between renders.

export interface Term {
  /** Stable lookup key. Lowercase, hyphenated, never displayed. */
  key: string;
  /** Display form, capitalised the way a lab report would print it. */
  term: string;
  /** Aliases and abbreviations members will actually type or see. */
  aka: string[];
  /** One sentence: what it is. */
  short: string;
  /** Why this clinic measures or uses it. */
  why: string;
  /** Unit as it appears on a panel, when the term is a measured value. */
  unit?: string;
  /** Keys of related terms — used to offer the next question. */
  seeAlso: string[];
}

export const terms: Term[] = [
  // ---------------------------------------------------------------------------
  // The two entries that matter most
  // ---------------------------------------------------------------------------
  {
    key: "reference-range",
    term: "Reference range",
    aka: ["normal range", "lab range", "ref range", "reference interval", "standard range"],
    short:
      "The span the laboratory considers ordinary — the central 95% of results from a group of people the lab screened as healthy.",
    why:
      "It is a statistical description of a population, not a target for you. That population spans a wide band of ages and circumstances, so the edges of the range describe what is COMMON in it — not what is optimal for a particular person with particular symptoms and goals. A result inside the range is not automatically fine, and a result just outside it is not automatically a problem. It is the first filter your provider applies, never the last word.",
    seeAlso: ["optimal-range"],
  },
  {
    key: "optimal-range",
    term: "Optimal range",
    aka: ["optimal", "target range", "functional range", "goal range"],
    short:
      "A narrower window inside (or sometimes shifted from) the lab's reference range, where people your age and sex generally feel and function best.",
    why:
      "This is the range your care team is actually steering toward, and it is why Apex shows two bands on every marker instead of one. A testosterone result can sit at the bottom of a lab's reference range and still be the reason you feel flat at 3pm — the lab is telling you the number is not unusual, which is a different question from whether it is right for you. Optimal ranges are judgement, not law: they come from clinical literature and get adjusted for your age, sex, goals and how you actually feel. If your number is outside optimal but inside reference, that is a conversation, not an alarm.",
    seeAlso: ["reference-range"],
  },

  // ---------------------------------------------------------------------------
  // Hormones
  // ---------------------------------------------------------------------------
  {
    key: "total-testosterone",
    term: "Total testosterone",
    aka: ["testosterone", "total t", "total test", "tt"],
    short:
      "All of the testosterone circulating in your blood — both the part that is bound to carrier proteins and the part that is free to act.",
    why:
      "It is the headline hormone number and the one most people arrive already knowing. On its own it is incomplete: two people with identical total testosterone can have very different amounts available to their tissues depending on how much is bound up. That is why it is always read alongside SHBG and free testosterone.",
    unit: "ng/dL",
    seeAlso: ["free-testosterone", "shbg", "lh", "estradiol"],
  },
  {
    key: "free-testosterone",
    term: "Free testosterone",
    aka: ["free t", "ft", "unbound testosterone", "free test"],
    short:
      "The small fraction of your testosterone — usually 1–3% — that is not bound to a carrier protein and can enter cells and do work.",
    why:
      "This is the number that tracks most closely with how people describe feeling: drive, recovery, training response, libido. It explains the common frustration of a 'normal' total testosterone alongside real symptoms — if SHBG is high, most of that total is bound and unavailable.",
    unit: "pg/mL",
    seeAlso: ["total-testosterone", "shbg"],
  },
  {
    key: "shbg",
    term: "SHBG",
    aka: ["sex hormone binding globulin", "sex hormone-binding globulin", "sex hormone binding globulin (shbg)"],
    short:
      "A protein made by your liver that grabs onto testosterone and oestrogen in the bloodstream and holds them inactive.",
    why:
      "SHBG is the translator between your total testosterone and your free testosterone. When it runs high, more of your hormone is locked up and less is available even though the total looks fine; when it runs low, more is free. Thyroid status, insulin, liver health, body composition and age all move it, which is why your team reads it as context for the rest of the hormone panel rather than as a target of its own.",
    unit: "nmol/L",
    seeAlso: ["free-testosterone", "total-testosterone", "estradiol"],
  },
  {
    key: "lh",
    term: "LH",
    aka: ["luteinizing hormone", "luteinising hormone"],
    short:
      "A signal hormone released by your pituitary gland that tells the testes (or ovaries) to produce sex hormones.",
    why:
      "LH tells your provider where in the chain something is happening. It separates 'the factory is being asked to produce and isn't' from 'the factory was never asked' — a distinction that changes the entire conversation about what to do next.",
    unit: "mIU/mL",
    seeAlso: ["fsh", "total-testosterone"],
  },
  {
    key: "fsh",
    term: "FSH",
    aka: ["follicle stimulating hormone", "follicle-stimulating hormone"],
    short:
      "A second pituitary signal hormone, closely tied to sperm production in men and the menstrual cycle in women.",
    why:
      "Read next to LH, it fills in the picture of how your body's own hormone signalling is running. It also matters directly to anyone thinking about fertility now or later, which is a conversation worth having before a protocol starts rather than after.",
    unit: "mIU/mL",
    seeAlso: ["lh", "total-testosterone"],
  },
  {
    key: "estradiol",
    term: "Estradiol",
    aka: ["oestradiol", "e2", "estrogen", "oestrogen"],
    short:
      "The main form of oestrogen, present and necessary in every body — men included, where a portion of testosterone is converted into it.",
    why:
      "Both too little and too much cause problems, which is why it is a two-sided marker rather than something to drive down. Estradiol is involved in bone density, joint comfort, mood, libido and cardiovascular health, so your team watches the balance between it and testosterone rather than either number alone.",
    unit: "pg/mL",
    seeAlso: ["total-testosterone", "shbg"],
  },
  {
    key: "dhea-s",
    term: "DHEA-S",
    aka: ["dhea", "dheas", "dhea sulfate", "dehydroepiandrosterone sulfate"],
    short:
      "A hormone made mostly by your adrenal glands that serves as raw material the body can convert into other sex hormones.",
    why:
      "It is one of the clearest age-related declines in the whole panel — it peaks in your twenties and falls steadily after. Your team uses it as a read on adrenal output and as background context for energy, stress load and recovery.",
    unit: "µg/dL",
    seeAlso: ["total-testosterone", "estradiol"],
  },

  // ---------------------------------------------------------------------------
  // Thyroid
  // ---------------------------------------------------------------------------
  {
    key: "tsh",
    term: "TSH",
    aka: ["thyroid stimulating hormone", "thyroid-stimulating hormone"],
    short:
      "A pituitary signal that tells your thyroid how hard to work — it rises when the body senses it needs more thyroid hormone.",
    why:
      "TSH is the standard first-line thyroid screen, and it moves in the opposite direction to what people expect: a higher TSH generally means the thyroid is being pushed harder. It is sensitive but indirect, so it is read together with the actual thyroid hormones rather than by itself.",
    unit: "mIU/L",
    seeAlso: ["free-t4", "free-t3", "reverse-t3", "thyroid-antibodies"],
  },
  {
    key: "free-t4",
    term: "Free T4",
    aka: ["ft4", "free thyroxine", "t4", "thyroxine"],
    short:
      "The available form of thyroxine, the storage hormone your thyroid produces in bulk and your body converts as needed.",
    why:
      "T4 is the reservoir. Measuring the free portion shows how much raw thyroid hormone is actually on hand for conversion, which is the step before anything reaches your metabolism.",
    unit: "ng/dL",
    seeAlso: ["free-t3", "tsh", "reverse-t3"],
  },
  {
    key: "free-t3",
    term: "Free T3",
    aka: ["ft3", "free triiodothyronine", "t3", "triiodothyronine"],
    short:
      "The available form of the active thyroid hormone — the one that actually reaches cells and sets metabolic pace.",
    why:
      "This is the marker that lines up with the symptoms people describe: energy, body temperature, how easily weight moves, how fast you think. Because T3 is produced by converting T4, a normal TSH and T4 with a low free T3 points at the conversion step, which is a genuinely different problem.",
    unit: "pg/mL",
    seeAlso: ["free-t4", "reverse-t3", "tsh"],
  },
  {
    key: "reverse-t3",
    term: "Reverse T3",
    aka: ["rt3", "reverse triiodothyronine"],
    short:
      "An inactive form your body makes from T4 instead of making active T3 — thyroid hormone being diverted rather than used.",
    why:
      "The body makes more of it under stress, illness, injury and heavy calorie restriction — it is a brake, not a fault. Your team reads it alongside free T3 to understand whether a thyroid picture reflects the gland itself or the load currently on your system.",
    unit: "ng/dL",
    seeAlso: ["free-t3", "free-t4"],
  },
  {
    key: "thyroid-antibodies",
    term: "Thyroid antibodies",
    aka: ["tpo", "tpo antibodies", "anti-tpo", "tg antibodies", "thyroglobulin antibodies", "thyroid autoantibodies"],
    short:
      "Immune proteins that target thyroid tissue; their presence indicates the immune system is involved with the thyroid.",
    why:
      "They answer 'why' rather than 'how much'. Two people can have identical thyroid hormone levels and need different monitoring depending on whether antibodies are present, so this is a test that changes the follow-up plan more often than it changes today's numbers. Interpretation belongs with your provider.",
    unit: "IU/mL",
    seeAlso: ["tsh", "free-t3", "free-t4"],
  },

  // ---------------------------------------------------------------------------
  // Metabolic
  // ---------------------------------------------------------------------------
  {
    key: "a1c",
    term: "A1C",
    aka: ["hba1c", "hemoglobin a1c", "haemoglobin a1c", "glycated hemoglobin", "a1c%"],
    short:
      "An average of your blood sugar over roughly the last three months, measured by how much glucose has attached itself to your red blood cells.",
    why:
      "Unlike a single glucose reading, A1C cannot be gamed by what you ate this morning — it is the trend, which is what actually drives long-term risk. It is one of the slowest markers to move, so improvement here is real improvement rather than noise.",
    unit: "%",
    seeAlso: ["fasting-insulin", "homa-ir", "triglycerides"],
  },
  {
    key: "fasting-insulin",
    term: "Fasting insulin",
    aka: ["insulin", "fasting serum insulin"],
    short:
      "How much insulin your body is producing at rest, after an overnight fast, to keep blood sugar where it should be.",
    why:
      "It is an early-warning marker: insulin usually climbs for years before blood sugar itself starts to drift, because the extra insulin is what is holding the line. Someone with a perfectly normal glucose and a high fasting insulin is working much harder for that normal number, and that is worth knowing early.",
    unit: "µIU/mL",
    seeAlso: ["homa-ir", "a1c", "triglycerides", "visceral-fat"],
  },
  {
    key: "homa-ir",
    term: "HOMA-IR",
    aka: ["homa", "homa ir", "insulin resistance score", "homeostatic model assessment"],
    short:
      "A calculated score that combines your fasting glucose and fasting insulin into a single estimate of how well your cells are responding to insulin.",
    why:
      "It compresses two numbers into one trend line, which makes it easy to watch across visits. A rising score means it is taking more insulin to do the same job; a falling score is one of the clearest signs that nutrition and training changes are landing.",
    seeAlso: ["fasting-insulin", "a1c", "visceral-fat"],
  },

  // ---------------------------------------------------------------------------
  // Lipids & cardiovascular
  // ---------------------------------------------------------------------------
  {
    key: "apob",
    term: "ApoB",
    aka: ["apolipoprotein b", "apo b", "apo-b"],
    short:
      "A count of the actual particles in your blood that can deposit cholesterol into an artery wall — one ApoB protein sits on each of them.",
    why:
      "Standard cholesterol panels measure how much cholesterol is being carried; ApoB measures how many vehicles are carrying it, and it is the vehicles that collide with the artery wall. It is why two people with the same LDL-C can carry meaningfully different risk, and it is the lipid number your provider will most often want to see move.",
    unit: "mg/dL",
    seeAlso: ["ldl-c", "lp-a", "hdl", "triglycerides"],
  },
  {
    key: "lp-a",
    term: "Lp(a)",
    aka: ["lpa", "lp little a", "lipoprotein a", "lipoprotein(a)"],
    short:
      "A specific inherited type of cholesterol-carrying particle, set largely by your genetics and stable across your life.",
    why:
      "Because it barely moves with diet or training, it is usually checked once rather than tracked — the point is to know it. An elevated Lp(a) doesn't change what you eat, but it does change how aggressively your provider wants to manage everything else that is modifiable.",
    unit: "nmol/L",
    seeAlso: ["apob", "ldl-c"],
  },
  {
    key: "ldl-c",
    term: "LDL-C",
    aka: ["ldl", "ldl cholesterol", "bad cholesterol", "low density lipoprotein"],
    short:
      "The amount of cholesterol being carried by LDL particles — the ones that deliver cholesterol out to your tissues.",
    why:
      "It is the most familiar cardiovascular number and a reasonable first look, but it measures cargo rather than traffic. When LDL-C and ApoB disagree, your team generally trusts ApoB.",
    unit: "mg/dL",
    seeAlso: ["apob", "hdl", "triglycerides", "lp-a"],
  },
  {
    key: "hdl",
    term: "HDL",
    aka: ["hdl cholesterol", "good cholesterol", "high density lipoprotein"],
    short:
      "Cholesterol carried by particles that collect excess cholesterol from tissue and return it to the liver.",
    why:
      "Higher is broadly better, but only to a point and mostly as a signal rather than a lever — HDL tends to reflect metabolic health rather than create it. It is most useful read against your triglycerides.",
    unit: "mg/dL",
    seeAlso: ["triglycerides", "ldl-c", "apob"],
  },
  {
    key: "triglycerides",
    term: "Triglycerides",
    aka: ["trigs", "tg", "triglyceride"],
    short:
      "Fat circulating in your bloodstream, largely reflecting recent carbohydrate and alcohol intake and how well your body is clearing them.",
    why:
      "This is the fastest-moving marker on the lipid panel, which makes it an honest short-term scoreboard for nutrition changes. The ratio of triglycerides to HDL is also one of the simplest available reads on insulin sensitivity.",
    unit: "mg/dL",
    seeAlso: ["hdl", "fasting-insulin", "homa-ir"],
  },

  // ---------------------------------------------------------------------------
  // Inflammation
  // ---------------------------------------------------------------------------
  {
    key: "hs-crp",
    term: "hs-CRP",
    aka: ["crp", "high sensitivity crp", "high-sensitivity c-reactive protein", "c-reactive protein"],
    short:
      "A protein your liver releases in response to inflammation, measured with a sensitive assay that can pick up low-grade levels.",
    why:
      "It is the clinic's general read on background inflammation, which sits underneath recovery, joint comfort and cardiovascular risk. It is also easily thrown off — a cold, a hard training block or a recent injury will raise it — so a single elevated result usually earns a repeat test rather than a conclusion.",
    unit: "mg/L",
    seeAlso: ["homocysteine", "ferritin"],
  },
  {
    key: "homocysteine",
    term: "Homocysteine",
    aka: ["hcy"],
    short:
      "An amino acid that builds up when your body is short on the B vitamins needed to clear it.",
    why:
      "It links nutrition status to cardiovascular and cognitive health in a way most markers don't, and it is one of the more responsive numbers on the panel when a genuine B-vitamin gap is the cause.",
    unit: "µmol/L",
    seeAlso: ["b12", "hs-crp"],
  },

  // ---------------------------------------------------------------------------
  // Blood & nutrients
  // ---------------------------------------------------------------------------
  {
    key: "ferritin",
    term: "Ferritin",
    aka: ["serum ferritin", "iron stores"],
    short: "The protein that stores iron, used as a measure of how much iron you have banked.",
    why:
      "Low ferritin can leave you flat and slow to recover long before a standard haemoglobin looks abnormal, which is why it is checked alongside energy complaints. It also rises with inflammation, so it is always read next to hs-CRP rather than alone.",
    unit: "ng/mL",
    seeAlso: ["hemoglobin", "hematocrit", "hs-crp"],
  },
  {
    key: "hematocrit",
    term: "Hematocrit",
    aka: ["haematocrit", "hct", "packed cell volume"],
    short: "The percentage of your blood volume made up of red blood cells.",
    why:
      "It is a routine safety marker on any hormone protocol, because testosterone therapy can raise red cell production over time. Tracking it every panel is exactly why it almost never becomes a problem.",
    unit: "%",
    seeAlso: ["hemoglobin", "ferritin", "total-testosterone"],
  },
  {
    key: "hemoglobin",
    term: "Hemoglobin",
    aka: ["haemoglobin", "hgb", "hb"],
    short: "The protein inside red blood cells that carries oxygen from your lungs to the rest of your body.",
    why:
      "It sets your oxygen-carrying capacity, so it shows up in endurance, recovery and plain day-to-day energy. It moves together with hematocrit and is monitored for the same reasons.",
    unit: "g/dL",
    seeAlso: ["hematocrit", "ferritin"],
  },
  {
    key: "vitamin-d",
    term: "Vitamin D",
    aka: ["25-oh vitamin d", "25 hydroxyvitamin d", "vit d", "vitamin d3", "calcidiol"],
    short:
      "Measured as 25-hydroxyvitamin D, the storage form — technically a hormone your skin makes from sunlight rather than a vitamin.",
    why:
      "It is involved in bone health, immune function, mood and muscle performance, and it is one of the most commonly low results in this panel, especially through winter. It is also one of the easiest to correct and re-check.",
    unit: "ng/mL",
    seeAlso: ["b12", "hs-crp"],
  },
  {
    key: "b12",
    term: "Vitamin B12",
    aka: ["b-12", "cobalamin", "vitamin b-12"],
    short: "A vitamin your body needs to build red blood cells, maintain nerves and keep energy production running.",
    why:
      "Shortfalls show up as fatigue, brain fog and pins-and-needles — symptoms easy to blame on everything else. Absorption declines with age and with some common medications, so a good diet doesn't guarantee a good level.",
    unit: "pg/mL",
    seeAlso: ["homocysteine", "ferritin"],
  },

  // ---------------------------------------------------------------------------
  // Organ function & prostate
  // ---------------------------------------------------------------------------
  {
    key: "psa",
    term: "PSA",
    aka: ["prostate specific antigen", "prostate-specific antigen"],
    short: "A protein made by the prostate that circulates in small amounts in the blood.",
    why:
      "It is a baseline and monitoring marker for prostate health in men, and it is checked before and during hormone therapy as a matter of routine. It moves for many benign reasons — including recent cycling or ejaculation — so the trend across panels matters far more than any single value, and interpretation is your provider's.",
    unit: "ng/mL",
    seeAlso: ["total-testosterone"],
  },
  {
    key: "egfr",
    term: "eGFR",
    aka: ["gfr", "estimated glomerular filtration rate", "kidney function"],
    short: "An estimate of how much blood your kidneys filter each minute, calculated from creatinine plus your age and sex.",
    why:
      "It is the standard read on kidney function and part of the safety floor under any protocol. Because it is calculated from a muscle-derived waste product, a very muscular person or a heavy training block can nudge it — context your team already has.",
    unit: "mL/min/1.73m²",
    seeAlso: ["alt", "ast"],
  },
  {
    key: "alt",
    term: "ALT",
    aka: ["sgpt", "alanine aminotransferase", "alanine transaminase"],
    short: "A liver enzyme that shows up in the blood when liver cells are under strain.",
    why:
      "It is the more liver-specific of the two standard enzymes and part of routine safety monitoring. Hard training, alcohol and some supplements can raise it temporarily, so a single elevated value is a reason to look again rather than to conclude anything.",
    unit: "U/L",
    seeAlso: ["ast", "egfr"],
  },
  {
    key: "ast",
    term: "AST",
    aka: ["sgot", "aspartate aminotransferase", "aspartate transaminase"],
    short: "An enzyme found in the liver but also in muscle, released into the blood when either is stressed.",
    why:
      "Read next to ALT it helps separate liver signal from muscle signal — an AST that rises on its own after heavy lifting usually means the muscle, not the liver. That distinction is the whole reason both are drawn together.",
    unit: "U/L",
    seeAlso: ["alt", "egfr"],
  },

  // ---------------------------------------------------------------------------
  // Body composition
  // ---------------------------------------------------------------------------
  {
    key: "visceral-fat",
    term: "Visceral fat",
    aka: ["visceral adipose tissue", "vat", "visceral fat level", "belly fat"],
    short:
      "Fat stored deep in the abdomen around your organs, as opposed to the fat directly under the skin.",
    why:
      "It is metabolically active in a way subcutaneous fat is not — it releases inflammatory signals and drives insulin resistance, so it carries more health weight per pound than anywhere else you store fat. It is also one of the first places to change when nutrition and training shift, which makes it a rewarding thing to track.",
    seeAlso: ["body-fat-percentage", "homa-ir", "fasting-insulin"],
  },
  {
    key: "skeletal-muscle-mass",
    term: "Skeletal muscle mass",
    aka: ["smm", "muscle mass", "skeletal muscle"],
    short: "The weight of the muscle you move with — the muscle attached to your skeleton, excluding organ and smooth muscle.",
    why:
      "It is the strongest single predictor of how you will function in your seventies, and it is where your glucose goes after a meal, which ties it directly to metabolic health. Protecting it is why protein targets and resistance training appear in almost every plan, including fat-loss plans.",
    unit: "kg",
    seeAlso: ["lean-mass", "body-fat-percentage", "bmr"],
  },
  {
    key: "body-fat-percentage",
    term: "Body fat percentage",
    aka: ["body fat %", "bf%", "bodyfat", "body fat"],
    short: "The share of your total body weight that is fat rather than muscle, bone, organ and water.",
    why:
      "It answers the question the scale can't: whether a change in weight was the change you wanted. Two people at the same weight and height can sit ten points apart here, which is why this clinic tracks composition rather than weight alone.",
    unit: "%",
    seeAlso: ["lean-mass", "skeletal-muscle-mass", "visceral-fat"],
  },
  {
    key: "lean-mass",
    term: "Lean mass",
    aka: ["lean body mass", "fat free mass", "fat-free mass", "lbm", "ffm"],
    short: "Everything in your body that isn't fat — muscle, bone, organs and water combined.",
    why:
      "It is the broader figure that skeletal muscle mass sits inside, and it moves faster because it includes water. During a fat-loss phase, holding lean mass steady while body fat falls is the outcome your coach is steering for.",
    unit: "kg",
    seeAlso: ["skeletal-muscle-mass", "body-fat-percentage", "bmr"],
  },
  {
    key: "bmr",
    term: "BMR",
    aka: ["basal metabolic rate", "resting metabolic rate", "rmr"],
    short: "The energy your body burns at complete rest, just keeping you alive for a day.",
    why:
      "It is the floor your calorie targets are built on, and it is driven largely by how much lean tissue you carry — which is the practical reason losing muscle during a diet makes the next diet harder. Your scan estimates it rather than measuring it directly.",
    unit: "kcal/day",
    seeAlso: ["lean-mass", "skeletal-muscle-mass"],
  },

  // ---------------------------------------------------------------------------
  // Therapy concepts
  // ---------------------------------------------------------------------------
  {
    key: "peptide",
    term: "Peptide",
    aka: ["peptides", "peptide therapy"],
    short:
      "A short chain of amino acids — the same building blocks as protein, just a much smaller molecule — that acts as a signal in the body.",
    why:
      "Peptides work by telling existing systems to do more or less of something they already do, rather than by replacing a hormone outright. That is the category; what is appropriate for you, in what form and on what schedule, is decided by your provider and appears on your protocol, never here.",
    seeAlso: ["glp-1", "subcutaneous", "half-life", "titration"],
  },
  {
    key: "glp-1",
    term: "GLP-1",
    aka: ["glp1", "glucagon-like peptide-1", "glucagon like peptide 1", "glp-1 agonist", "glp-1 receptor agonist"],
    short:
      "A hormone your gut releases after eating that slows stomach emptying, signals fullness to the brain and helps regulate blood sugar; medicines in this class imitate it.",
    why:
      "It explains why this class of medication changes appetite rather than willpower — it works on the signal, not the resolve. It also explains the common side effects, which are mostly the same mechanism turned up. Whether it belongs in your plan, and at what point, is a provider decision made with your labs in front of them.",
    seeAlso: ["peptide", "titration", "subcutaneous", "a1c"],
  },
  {
    key: "subcutaneous",
    term: "Subcutaneous",
    aka: ["sub-q", "subq", "sub q", "sc", "subcutaneous injection"],
    short: "Into the layer of fat just under the skin — a shallow injection, typically abdomen or thigh.",
    why:
      "The tissue there has less blood flow than muscle, so it releases the medication more slowly and steadily. It is also the more comfortable route and the one most people can do themselves after being taught in clinic.",
    seeAlso: ["intramuscular", "bioavailability", "half-life"],
  },
  {
    key: "intramuscular",
    term: "Intramuscular",
    aka: ["im", "im injection", "intramuscular injection"],
    short: "Into the muscle itself — a deeper injection, typically glute, thigh or shoulder.",
    why:
      "Muscle carries more blood flow, so absorption is faster and the profile over time is different. Route is a clinical choice made for the specific medication, not a preference — your protocol will tell you which one applies to you.",
    seeAlso: ["subcutaneous", "bioavailability", "half-life"],
  },
  {
    key: "titration",
    term: "Titration",
    aka: ["titrate", "dose titration", "ramp up", "dose escalation"],
    short:
      "Adjusting a dose gradually — usually starting low and stepping up — while watching how you respond at each step.",
    why:
      "It is how a plan finds the smallest effective dose for you specifically rather than assuming the average. It is also why the first weeks of a protocol are deliberately unhurried, and why your check-ins matter: your reported response is the input the next step is based on.",
    seeAlso: ["half-life", "glp-1", "peptide"],
  },
  {
    key: "half-life",
    term: "Half-life",
    aka: ["halflife", "half life", "t1/2", "elimination half-life"],
    short: "The time it takes your body to clear half of a substance from your bloodstream.",
    why:
      "It is the reason dosing schedules look the way they do — a short half-life needs more frequent dosing to stay steady, a long one needs less. It also explains why a missed dose matters more for some medications than others, and why some take weeks to reach a stable level.",
    seeAlso: ["titration", "bioavailability", "subcutaneous"],
  },
  {
    key: "bioavailability",
    term: "Bioavailability",
    aka: ["bio-availability", "absorption"],
    short:
      "The proportion of a dose that actually reaches your bloodstream in an active form, once your body has finished absorbing and processing it.",
    why:
      "It is why the same substance is not interchangeable across forms — a swallowed capsule passes through the gut and liver first and much of it never arrives, while an injection largely bypasses that. When your provider specifies a form, the choice is usually about this.",
    seeAlso: ["subcutaneous", "intramuscular", "half-life"],
  },
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Normalise anything a caller might pass — a key, a display term, an alias, a
 * label lifted straight off a lab report — into one comparable form.
 *
 * Punctuation is stripped rather than mapped because lab vendors are wildly
 * inconsistent about it: "Lp(a)", "Lp-a", "LP A" and "lpa" are the same
 * analyte four ways, and a member typing any of them deserves the same answer.
 */
function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/**
 * Built once at module load. The alternative — scanning `terms` on every
 * <Term> render — would be an O(n) walk per word, and the whole point of the
 * component is that it can be sprinkled across a page dozens of times.
 *
 * Canonical keys and display terms are inserted last so that a term can never
 * be shadowed by another entry's alias.
 */
const index: Map<string, Term> = (() => {
  const m = new Map<string, Term>();
  for (const t of terms) {
    for (const alias of t.aka) {
      const n = normalise(alias);
      if (n && !m.has(n)) m.set(n, t);
    }
  }
  for (const t of terms) {
    m.set(normalise(t.key), t);
    m.set(normalise(t.term), t);
  }
  return m;
})();

/**
 * Case- and alias-insensitive lookup.
 *
 * Returns `undefined` rather than throwing or returning a placeholder, because
 * every caller's correct behaviour on a miss is to render plain text. A
 * glossary gap should be invisible to the member, never a dead affordance.
 */
export function lookup(term?: string | null): Term | undefined {
  if (!term) return undefined;
  return index.get(normalise(term));
}

/** True when a word has a definition — for callers that want to branch first. */
export function hasTerm(term?: string | null): boolean {
  return lookup(term) !== undefined;
}

/** Alphabetical by display term, for the glossary index. */
export const termsAlphabetical: Term[] = [...terms].sort((a, b) =>
  a.term.localeCompare(b.term),
);

/** Resolve a `seeAlso` list into real entries, silently dropping bad keys. */
export function relatedTerms(t: Term): Term[] {
  return t.seeAlso.map((k) => lookup(k)).filter((x): x is Term => Boolean(x));
}
