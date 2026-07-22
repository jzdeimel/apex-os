import { peptideMeta } from "@/components/PeptideIcon";

/**
 * Peptide & compound reference library.
 *
 * ── WHAT THIS FILE IS NOT ───────────────────────────────────────────────────
 * This is a LIBRARY, not a prescribing reference. There is no dose, no
 * frequency, no titration schedule and no protocol anywhere in this file, and
 * the `PeptideEntry` type has no field to put one in — the same structural
 * guarantee `lib/planOfCare/types.ts` makes about plans. Amount, frequency and
 * suitability are decided by a licensed provider with the member's labs in
 * front of them. Nothing here is individualised advice.
 *
 * ── WHY THE EVIDENCE NOTES MATTER MOST ──────────────────────────────────────
 * Half of what a peptide clinic uses is genuinely well studied (testosterone,
 * the GLP-1s) and half is early-evidence — animal models, small phase-1 PK
 * studies, or compounded products with no outcome trials at all. A library that
 * renders both in the same confident voice is a liability: it teaches members
 * that "on the menu" means "proven", and the first time someone reads a real
 * paper the whole clinic's credibility goes with it.
 *
 * So `evidenceTier` is a required field, it drives a visible chip in the UI,
 * and `evidenceNote` says out loud where the evidence stops. Saying "mostly
 * animal data" is the feature.
 *
 * ── COLOUR ──────────────────────────────────────────────────────────────────
 * Accents are inherited from `peptideMeta()` in components/PeptideIcon.tsx so a
 * compound is the same colour in an order row, an inventory chip and here.
 * `ACCENT_OVERRIDES` only covers compounds that mapper does not know about yet;
 * adding one there is preferable to duplicating the mapper.
 */

export type PeptideFamily =
  | "Repair & recovery"
  | "Metabolic"
  | "Growth hormone axis"
  | "Sexual health"
  | "Cellular energy"
  | "Hormone";

/**
 * Controlled vocabulary — the gallery filters on these, so free text here
 * silently creates a filter chip nobody can find anything under.
 */
export type PeptideUse =
  | "Injury repair"
  | "Joint & tendon"
  | "Weight loss"
  | "Blood sugar"
  | "Sleep quality"
  | "Lean mass"
  | "Recovery"
  | "Libido"
  | "Energy"
  | "Skin & antioxidant"
  | "Fertility"
  | "Hormone balance";

/**
 * How strong the *human* evidence is. Deliberately three coarse buckets — a
 * finer scale invites false precision, and the only distinction a member needs
 * is "this is settled" vs "this is promising" vs "this is mostly preclinical".
 */
export type EvidenceTier = "established" | "emerging" | "early";

/** One stage of the mechanism diagram. Shape is the same for every compound. */
export interface PathwayStage {
  /** Short label rendered inside the node — keep to ~18 characters. */
  label: string;
  /** One clause of plain-language explanation rendered under the node. */
  detail: string;
  kind: "compound" | "target" | "signal" | "effect";
}

export interface PeptideEntry {
  key: string;
  name: string;
  aka: string[];
  family: PeptideFamily;
  /**
   * Amino-acid count of the parent molecule, where the compound is in fact a
   * peptide. Absent for NAD+ (a dinucleotide) and testosterone cypionate (a
   * steroid ester) — and the UI says so rather than drawing a fake chain.
   */
  chainLength?: number;
  accent: string;
  whatItIs: string;
  howItWorks: string;
  commonlyUsedFor: PeptideUse[];
  /** Route only. Never a schedule. */
  route: string;
  /**
   * Weeks in which change is *typically reported*, as a range — or null where
   * that has never been established in humans. Null is a real answer here and
   * appears more often than a clinic marketing page would like.
   */
  onsetWeeks: [number, number] | null;
  evidenceTier: EvidenceTier;
  /** Honest boundary of the human evidence. Rendered verbatim to members. */
  evidenceNote: string;
  /** Every compound in this library is prescriber-directed. No exceptions. */
  requiresPrescription: true;
  /** Member-voice one-liner. Says what it is for, never what to do. */
  memberSafeCopy: string;
  pathway: PathwayStage[];
}

/** Colours for compounds `peptideMeta()` has no matcher for yet. */
const ACCENT_OVERRIDES: Record<string, string> = {
  "tb-500": "#5eead4",
  retatrutide: "#818cf8",
  sermorelin: "#c4b5fd",
  ipamorelin: "#f0abfc",
  "cjc-1295": "var(--chart-series-4)",
  glutathione: "var(--c-low)",
  hcg: "#fb923c",
};

const accentFor = (key: string, name: string) =>
  ACCENT_OVERRIDES[key] ?? peptideMeta(name).color;

/** Shared closing sentence — one string so it can never drift between entries. */
export const PROVIDER_LINE =
  "Whether any of this is right for you is a decision you make with your provider, using your own labs and history.";

export const LIBRARY_DISCLAIMER =
  "This library explains what these compounds are and what the evidence actually shows. It contains no doses, no schedules and no instructions — those live on your signed plan and come from your provider.";

const entries: Omit<PeptideEntry, "accent">[] = [
  {
    key: "bpc-157",
    name: "BPC-157",
    aka: ["Body Protection Compound 157", "PL 14736"],
    family: "Repair & recovery",
    chainLength: 15,
    whatItIs:
      "A 15-amino-acid sequence derived from a protein found naturally in stomach fluid. It is made synthetically and dispensed through compounding pharmacies — it is not an FDA-approved medicine.",
    howItWorks:
      "In laboratory and animal work it appears to speed the formation of new blood vessels into damaged tissue, largely by increasing signalling through the VEGF receptor pathway, and it interacts with nitric-oxide signalling. More blood supply into an injured tendon or gut lining is the plausible route to faster repair.",
    commonlyUsedFor: ["Injury repair", "Joint & tendon", "Recovery"],
    route: "Subcutaneous injection; some pharmacies also compound an oral form.",
    onsetWeeks: null,
    evidenceTier: "early",
    evidenceNote:
      "Almost all of the evidence is animal and cell-culture work. There are no published large randomised human trials, and no FDA approval for any indication. It is widely used and widely discussed; that is not the same as proven, and we would rather you heard that from us.",
    requiresPrescription: true,
    memberSafeCopy:
      "Used in recovery and tissue-repair conversations. The human evidence is thin, so it is a considered choice rather than a default one.",
    pathway: [
      { label: "BPC-157", detail: "Enters the bloodstream and reaches injured tissue.", kind: "compound" },
      { label: "VEGF receptor", detail: "Increases signalling through the pathway that builds new blood vessels.", kind: "target" },
      { label: "New blood supply", detail: "More capillaries grow into the damaged area.", kind: "signal" },
      { label: "Tissue repair", detail: "The proposed result: a better-supplied site heals faster.", kind: "effect" },
    ],
  },
  {
    key: "tb-500",
    name: "TB-500",
    aka: ["Thymosin beta-4", "Tβ4"],
    family: "Repair & recovery",
    chainLength: 43,
    whatItIs:
      "A synthetic version of thymosin beta-4, a 43-amino-acid protein your body already makes and concentrates at wound sites. Products sold as TB-500 are sometimes the full protein and sometimes only its active fragment.",
    howItWorks:
      "Thymosin beta-4 binds actin, the protein cells use as scaffolding to change shape and move. Freeing up actin lets repair cells migrate into a wound and lets new blood vessels form, which is why the natural protein rises at injury sites.",
    commonlyUsedFor: ["Injury repair", "Joint & tendon", "Recovery"],
    route: "Subcutaneous injection.",
    onsetWeeks: null,
    evidenceTier: "early",
    evidenceNote:
      "The biology of thymosin beta-4 is well characterised; the case for injecting it is not. Human trials have been small and mostly in dry-eye and cardiac repair, with mixed results. It is prohibited in competition by WADA — worth knowing if you compete.",
    requiresPrescription: true,
    memberSafeCopy:
      "A repair-focused compound with solid underlying biology and limited human outcome data. Banned for tested athletes.",
    pathway: [
      { label: "TB-500", detail: "Circulates and concentrates at sites of tissue damage.", kind: "compound" },
      { label: "Actin binding", detail: "Binds free actin, the scaffolding cells use to move.", kind: "target" },
      { label: "Cell migration", detail: "Repair cells and new vessels move into the wound.", kind: "signal" },
      { label: "Wound closure", detail: "The proposed result: more organised, faster repair.", kind: "effect" },
    ],
  },
  {
    key: "semaglutide",
    name: "Semaglutide",
    aka: ["Ozempic", "Wegovy", "GLP-1 agonist"],
    family: "Metabolic",
    chainLength: 31,
    whatItIs:
      "A long-acting copy of GLP-1, a gut hormone your body releases when you eat. It is an FDA-approved medicine for type 2 diabetes and for weight management.",
    howItWorks:
      "It switches on the GLP-1 receptor in three places at once: the pancreas, where it helps release insulin only when blood sugar is actually high; the stomach, which empties more slowly so a meal stays satisfying for longer; and appetite centres in the brain, which turn down food-seeking. Weight loss follows mostly from eating less, not from burning more.",
    commonlyUsedFor: ["Weight loss", "Blood sugar"],
    route: "Once-weekly subcutaneous injection; an oral tablet form also exists.",
    onsetWeeks: [4, 12],
    evidenceTier: "established",
    evidenceNote:
      "Among the best-evidenced medicines in this library. Multiple large randomised trials (the STEP and SUSTAIN programmes, and the SELECT cardiovascular outcomes trial) with tens of thousands of participants and years of follow-up.",
    requiresPrescription: true,
    memberSafeCopy:
      "A well-studied prescription medicine for weight and blood sugar. It works mainly by making you genuinely less hungry.",
    pathway: [
      { label: "Semaglutide", detail: "A durable copy of the gut hormone GLP-1.", kind: "compound" },
      { label: "GLP-1 receptor", detail: "Activates the receptor in pancreas, stomach and brain.", kind: "target" },
      { label: "Appetite & emptying", detail: "Slower stomach emptying and reduced appetite signalling.", kind: "signal" },
      { label: "Weight & glucose", detail: "Lower food intake and steadier blood sugar.", kind: "effect" },
    ],
  },
  {
    key: "tirzepatide",
    name: "Tirzepatide",
    aka: ["Mounjaro", "Zepbound", "dual GIP/GLP-1 agonist"],
    family: "Metabolic",
    chainLength: 39,
    whatItIs:
      "An FDA-approved medicine that acts on two gut-hormone receptors rather than one — GLP-1 and GIP. Approved for type 2 diabetes and for weight management.",
    howItWorks:
      "Everything semaglutide does through the GLP-1 receptor, plus GIP receptor activation. GIP appears to add its own effect on appetite and on how fat tissue handles incoming energy, and the two signals together produce more weight change on average than GLP-1 alone.",
    commonlyUsedFor: ["Weight loss", "Blood sugar"],
    route: "Once-weekly subcutaneous injection.",
    onsetWeeks: [4, 12],
    evidenceTier: "established",
    evidenceNote:
      "Strong human evidence. The SURPASS and SURMOUNT randomised trial programmes, with head-to-head comparisons against semaglutide showing greater average weight reduction. Long-term outcome data is younger than semaglutide's simply because the medicine is newer.",
    requiresPrescription: true,
    memberSafeCopy:
      "A well-studied prescription medicine that works on two appetite hormones instead of one.",
    pathway: [
      { label: "Tirzepatide", detail: "Acts on two gut-hormone receptors at once.", kind: "compound" },
      { label: "GLP-1 + GIP", detail: "Activates both receptors across gut, pancreas and brain.", kind: "target" },
      { label: "Appetite & fuel use", detail: "Reduced appetite plus changes in how fat tissue stores energy.", kind: "signal" },
      { label: "Weight & glucose", detail: "Larger average weight change than GLP-1 alone.", kind: "effect" },
    ],
  },
  {
    key: "retatrutide",
    name: "Retatrutide",
    aka: ["LY3437943", "triple agonist"],
    family: "Metabolic",
    chainLength: 39,
    whatItIs:
      "An investigational medicine acting on three receptors — GLP-1, GIP and glucagon. It is NOT approved by the FDA and is still in clinical trials.",
    howItWorks:
      "It adds glucagon-receptor activation to the two-receptor approach. Glucagon signalling raises energy expenditure and mobilises fat from the liver, so in principle the compound reduces intake and increases output at the same time.",
    commonlyUsedFor: ["Weight loss", "Blood sugar"],
    route: "Subcutaneous injection (investigational settings).",
    onsetWeeks: null,
    evidenceTier: "emerging",
    evidenceNote:
      "Published phase-2 results are striking, and phase-3 trials are still running. It is not approved for any use, its long-term safety profile is not established, and anything sold outside a trial is not the manufacturer's product. We include it because members ask about it, not because it is available here.",
    requiresPrescription: true,
    memberSafeCopy:
      "Still in clinical trials and not approved. Early results look strong; long-term safety is genuinely unknown.",
    pathway: [
      { label: "Retatrutide", detail: "Investigational three-receptor agonist.", kind: "compound" },
      { label: "GLP-1 + GIP + GCG", detail: "Adds glucagon-receptor activation to the pair.", kind: "target" },
      { label: "Intake down, burn up", detail: "Appetite falls while energy expenditure rises.", kind: "signal" },
      { label: "Under study", detail: "Phase-3 trials are ongoing. No approved use.", kind: "effect" },
    ],
  },
  {
    key: "sermorelin",
    name: "Sermorelin",
    aka: ["GHRH(1-29)", "growth hormone releasing hormone analogue"],
    family: "Growth hormone axis",
    chainLength: 29,
    whatItIs:
      "The first 29 amino acids of growth hormone releasing hormone — the shortest fragment that still works. It asks your own pituitary to release growth hormone rather than supplying growth hormone from outside.",
    howItWorks:
      "It binds the GHRH receptor on the pituitary gland, which releases a pulse of growth hormone. Because the release is still a pulse and still subject to the body's own feedback brakes, levels do not climb the way injected growth hormone does.",
    commonlyUsedFor: ["Sleep quality", "Recovery", "Lean mass"],
    route: "Subcutaneous injection.",
    onsetWeeks: [8, 12],
    evidenceTier: "emerging",
    evidenceNote:
      "The mechanism is not in doubt — sermorelin reliably raises growth hormone and was historically an approved diagnostic and paediatric product. What is thin is outcome evidence in healthy adults: few controlled trials, mostly short, measuring hormone levels rather than how people feel or perform.",
    requiresPrescription: true,
    memberSafeCopy:
      "Prompts your own pituitary rather than replacing the hormone. Reliable at raising the hormone; less studied for how much difference that makes.",
    pathway: [
      { label: "Sermorelin", detail: "A shortened copy of your own releasing hormone.", kind: "compound" },
      { label: "GHRH receptor", detail: "Binds the receptor on the pituitary gland.", kind: "target" },
      { label: "GH pulse", detail: "The pituitary releases a natural pulse of growth hormone.", kind: "signal" },
      { label: "IGF-1 rises", detail: "The liver responds; feedback brakes stay intact.", kind: "effect" },
    ],
  },
  {
    key: "ipamorelin",
    name: "Ipamorelin",
    aka: ["NNC 26-0161", "ghrelin receptor agonist"],
    family: "Growth hormone axis",
    chainLength: 5,
    whatItIs:
      "A five-amino-acid peptide that mimics ghrelin, the hormone that signals hunger and also triggers growth hormone release. It is compounded, not FDA-approved.",
    howItWorks:
      "It activates the ghrelin receptor on the pituitary. Its selling point is selectivity: unlike older compounds in the same class it releases growth hormone with very little effect on cortisol or prolactin, so the hormonal side effects are narrower.",
    commonlyUsedFor: ["Sleep quality", "Recovery", "Lean mass"],
    route: "Subcutaneous injection.",
    onsetWeeks: [8, 12],
    evidenceTier: "early",
    evidenceNote:
      "Human data is limited to small studies, most of them looking at bowel recovery after surgery rather than body composition or wellbeing. It is not FDA-approved for any indication. What is well shown is the selectivity — it moves growth hormone without dragging cortisol along.",
    requiresPrescription: true,
    memberSafeCopy:
      "A selective growth-hormone releaser. Clean mechanism, small amount of human outcome data.",
    pathway: [
      { label: "Ipamorelin", detail: "A five-amino-acid mimic of the hunger hormone ghrelin.", kind: "compound" },
      { label: "Ghrelin receptor", detail: "Activates GHS-R1a on the pituitary.", kind: "target" },
      { label: "Selective GH release", detail: "Growth hormone rises; cortisol and prolactin largely do not.", kind: "signal" },
      { label: "Recovery signalling", detail: "The proposed benefit sits downstream of that pulse.", kind: "effect" },
    ],
  },
  {
    key: "cjc-1295",
    name: "CJC-1295",
    aka: ["modified GRF(1-29)", "CJC-1295 with DAC"],
    family: "Growth hormone axis",
    chainLength: 29,
    whatItIs:
      "A modified growth hormone releasing hormone fragment engineered to survive far longer in the bloodstream than sermorelin. The 'with DAC' version attaches to blood albumin and lasts longer still.",
    howItWorks:
      "Same receptor as sermorelin, different lifespan. Small changes to the sequence block the enzyme that normally breaks it down, so a single exposure raises the baseline of growth hormone pulses over days rather than minutes. It is often paired with a ghrelin-receptor peptide because the two act on separate switches.",
    commonlyUsedFor: ["Sleep quality", "Recovery", "Lean mass"],
    route: "Subcutaneous injection.",
    onsetWeeks: [8, 12],
    evidenceTier: "early",
    evidenceNote:
      "Published human work is essentially a handful of small phase-1 and phase-2 pharmacokinetic studies showing that it does raise growth hormone and IGF-1. Development was not carried through to approval, and there are no trials measuring outcomes people care about. Long-term safety of a sustained IGF-1 elevation is not established.",
    requiresPrescription: true,
    memberSafeCopy:
      "A longer-lasting version of the same idea as sermorelin. Proven to raise the hormone; unproven beyond that.",
    pathway: [
      { label: "CJC-1295", detail: "A protease-resistant releasing-hormone analogue.", kind: "compound" },
      { label: "GHRH receptor", detail: "Same pituitary receptor, engaged over days not minutes.", kind: "target" },
      { label: "Raised GH baseline", detail: "Pulse height and frequency shift upward.", kind: "signal" },
      { label: "Sustained IGF-1", detail: "Liver IGF-1 stays elevated — the reason monitoring matters.", kind: "effect" },
    ],
  },
  {
    key: "pt-141",
    name: "PT-141",
    aka: ["Bremelanotide", "Vyleesi"],
    family: "Sexual health",
    chainLength: 7,
    whatItIs:
      "A seven-amino-acid ring-shaped peptide, FDA-approved as Vyleesi for low sexual desire in premenopausal women. Use in men is off-label.",
    howItWorks:
      "It acts in the brain, not on blood vessels — which is what makes it different from the familiar ED medicines. It activates melanocortin-4 receptors in the hypothalamus, part of the circuitry that generates sexual desire itself, so it works on wanting rather than on plumbing.",
    commonlyUsedFor: ["Libido"],
    route: "Subcutaneous injection; a nasal formulation was studied historically.",
    onsetWeeks: null,
    evidenceTier: "emerging",
    evidenceNote:
      "Genuinely FDA-approved on the strength of two randomised trials (RECONNECT) in premenopausal women, where the average effect was real but modest. Evidence in men is much thinner and use here is off-label. Nausea and transient blood-pressure changes are the well-documented issues.",
    requiresPrescription: true,
    memberSafeCopy:
      "Works on desire in the brain rather than on blood flow. Approved for women; off-label for men with less evidence behind it.",
    pathway: [
      { label: "PT-141", detail: "Crosses into the brain rather than acting on vessels.", kind: "compound" },
      { label: "MC4 receptor", detail: "Activates melanocortin-4 receptors in the hypothalamus.", kind: "target" },
      { label: "Desire circuitry", detail: "Engages the pathway that generates sexual desire.", kind: "signal" },
      { label: "Reported arousal", detail: "Effect is on wanting, not on mechanical function.", kind: "effect" },
    ],
  },
  {
    key: "nad",
    name: "NAD+",
    aka: ["Nicotinamide adenine dinucleotide", "NMN precursor", "NR precursor"],
    family: "Cellular energy",
    // No chainLength on purpose — NAD+ is not a peptide, and the visual says so.
    whatItIs:
      "Not a peptide at all — a coenzyme every cell in your body already uses. We list it here because it sits on the same menu and members reasonably assume it belongs to the same category.",
    howItWorks:
      "NAD+ is the molecule that carries electrons through the steps that turn food into usable energy in your mitochondria. It is also the fuel that sirtuins and DNA-repair enzymes consume when they work, so cells with more of it can do more repair. Tissue levels fall with age, which is the entire premise for topping it up.",
    commonlyUsedFor: ["Energy", "Recovery"],
    route: "Intravenous infusion, subcutaneous injection, or oral precursors (NR, NMN).",
    onsetWeeks: null,
    evidenceTier: "early",
    evidenceNote:
      "The biochemistry is textbook and beyond dispute. The clinical claim is not. Oral precursor trials reliably raise NAD+ in blood but have mostly failed to show the energy, cognition or ageing benefits people are hoping for. Human evidence for IV NAD+ specifically is very limited — small studies, short follow-up.",
    requiresPrescription: true,
    memberSafeCopy:
      "A coenzyme your cells run on. The chemistry is real; the evidence that supplementing it makes you feel different is much weaker than the marketing suggests.",
    pathway: [
      { label: "NAD+", detail: "A coenzyme, not a peptide — delivered IV or as a precursor.", kind: "compound" },
      { label: "Mitochondria", detail: "Carries electrons through energy production.", kind: "target" },
      { label: "Sirtuins & PARPs", detail: "Fuels the enzymes that handle repair and DNA maintenance.", kind: "signal" },
      { label: "Claimed energy", detail: "The step where human evidence thins out considerably.", kind: "effect" },
    ],
  },
  {
    key: "glutathione",
    name: "Glutathione",
    aka: ["GSH", "reduced glutathione"],
    family: "Cellular energy",
    chainLength: 3,
    whatItIs:
      "A three-amino-acid peptide (glutamate, cysteine, glycine) that your liver makes constantly. It is the body's principal internal antioxidant.",
    howItWorks:
      "It donates an electron to neutralise reactive oxygen species before they damage cell membranes and DNA, then gets recycled back to its active form. It also tags certain compounds in the liver so they can be cleared — the step usually described as phase-II detoxification.",
    commonlyUsedFor: ["Skin & antioxidant", "Recovery", "Energy"],
    route: "Intravenous infusion or subcutaneous injection; oral absorption is poor.",
    onsetWeeks: null,
    evidenceTier: "early",
    evidenceNote:
      "Its role in the body is completely established. Whether adding more from outside helps a healthy person is not. Trials are small and mostly cosmetic (skin tone) or in specific liver disease, and results are inconsistent. Oral glutathione is largely broken down before absorption.",
    requiresPrescription: true,
    memberSafeCopy:
      "Your body's main antioxidant. Essential internally; the case for infusing extra is weaker than most clinics imply.",
    pathway: [
      { label: "Glutathione", detail: "A three-amino-acid antioxidant your liver already makes.", kind: "compound" },
      { label: "Reactive oxygen", detail: "Donates an electron to neutralise damaging molecules.", kind: "target" },
      { label: "Redox recycling", detail: "Regenerated to its active form and reused.", kind: "signal" },
      { label: "Cellular protection", detail: "Less oxidative damage — magnitude in healthy adults unclear.", kind: "effect" },
    ],
  },
  {
    key: "testosterone-cypionate",
    name: "Testosterone Cypionate",
    aka: ["Test cyp", "TRT", "Depo-Testosterone"],
    family: "Hormone",
    // Not a peptide — a steroid ester. Deliberately no chainLength.
    whatItIs:
      "Testosterone with an ester attached that slows its release, so one injection lasts days rather than hours. It is an FDA-approved medicine and a Schedule III controlled substance.",
    howItWorks:
      "The ester is cleaved off and free testosterone binds androgen receptors throughout the body, changing which genes are transcribed in muscle, bone, brain and sexual tissue. Because the brain senses the extra testosterone, it also dials down the signal to your own testicles — which is why fertility and testicular function are part of every serious conversation about it.",
    commonlyUsedFor: ["Hormone balance", "Energy", "Lean mass", "Libido"],
    route: "Intramuscular or subcutaneous injection.",
    onsetWeeks: [3, 12],
    evidenceTier: "established",
    evidenceNote:
      "The best-evidenced therapy in this library by a wide margin: decades of use, FDA approval for diagnosed hypogonadism, and the large TRAVERSE cardiovascular safety trial. The evidence supports treating a diagnosed deficiency — it does not support treating a normal level, and that distinction is the whole clinical conversation.",
    requiresPrescription: true,
    memberSafeCopy:
      "A controlled, well-studied hormone therapy for diagnosed low testosterone. It suppresses your own production, so monitoring is not optional.",
    pathway: [
      { label: "Testosterone", detail: "Released slowly from its ester after injection.", kind: "compound" },
      { label: "Androgen receptor", detail: "Binds receptors in muscle, bone, brain and sexual tissue.", kind: "target" },
      { label: "Gene transcription", detail: "Changes which proteins those tissues build.", kind: "signal" },
      { label: "Plus feedback", detail: "The brain reduces its own signal — the reason for monitoring.", kind: "effect" },
    ],
  },
  {
    key: "hcg",
    name: "hCG",
    aka: ["Human chorionic gonadotropin", "Pregnyl"],
    family: "Hormone",
    chainLength: 237,
    whatItIs:
      "A glycoprotein hormone built from two joined subunits, originally identified in pregnancy. It is FDA-approved, and in men it is used because it closely imitates luteinising hormone.",
    howItWorks:
      "It binds the same receptor as luteinising hormone on the Leydig cells in the testes, telling them to keep producing testosterone locally. That matters alongside testosterone therapy, which switches off the brain's own signal: hCG substitutes for the missing instruction and keeps testicular function and sperm production going.",
    commonlyUsedFor: ["Fertility", "Hormone balance"],
    route: "Subcutaneous or intramuscular injection.",
    onsetWeeks: [4, 12],
    evidenceTier: "established",
    evidenceNote:
      "Well established for hypogonadotropic hypogonadism and for restoring fertility, with a long approved history. Its use specifically as an add-on alongside testosterone therapy is common practice supported by smaller studies rather than large randomised trials.",
    requiresPrescription: true,
    memberSafeCopy:
      "Keeps your own testicular function and fertility running while on hormone therapy.",
    pathway: [
      { label: "hCG", detail: "A hormone that closely imitates luteinising hormone.", kind: "compound" },
      { label: "LH receptor", detail: "Binds Leydig cells in the testes.", kind: "target" },
      { label: "Local production", detail: "Testes keep making testosterone and sperm.", kind: "signal" },
      { label: "Function preserved", detail: "Counters the shutdown caused by external testosterone.", kind: "effect" },
    ],
  },
];

export const peptideLibrary: PeptideEntry[] = entries.map((e) => ({
  ...e,
  accent: accentFor(e.key, e.name),
}));

export const peptideFamilies: PeptideFamily[] = [
  "Repair & recovery",
  "Metabolic",
  "Growth hormone axis",
  "Sexual health",
  "Cellular energy",
  "Hormone",
];

/** Uses that actually appear on an entry, in the declared order. */
export const peptideUses: PeptideUse[] = (
  [
    "Weight loss",
    "Blood sugar",
    "Injury repair",
    "Joint & tendon",
    "Recovery",
    "Sleep quality",
    "Lean mass",
    "Energy",
    "Libido",
    "Hormone balance",
    "Fertility",
    "Skin & antioxidant",
  ] as PeptideUse[]
).filter((u) => peptideLibrary.some((p) => p.commonlyUsedFor.includes(u)));

export function getPeptide(key: string): PeptideEntry | undefined {
  return peptideLibrary.find((p) => p.key === key);
}

/**
 * Resolve free text — a plan item's `modality`, an order line, an inventory
 * name — to a library entry.
 *
 * Longest name first so "Testosterone Cypionate" is not swallowed by a shorter
 * alias, and hyphen/space normalised so "BPC157", "bpc-157" and "BPC 157" all
 * land on the same entry.
 */
export function findPeptide(text: string): PeptideEntry | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[\s-]+/g, "");
  const hay = norm(text);
  const candidates = peptideLibrary
    .flatMap((p) => [p.name, ...p.aka].map((alias) => ({ p, alias: norm(alias) })))
    .sort((a, b) => b.alias.length - a.alias.length);
  return candidates.find((c) => hay.includes(c.alias))?.p;
}

export const evidenceTierLabel: Record<EvidenceTier, string> = {
  established: "Well established",
  emerging: "Emerging evidence",
  early: "Early evidence",
};

/** One sentence a member can read instead of decoding the tier word. */
export const evidenceTierBlurb: Record<EvidenceTier, string> = {
  established: "Large human trials and regulatory approval behind it.",
  emerging: "Real human trials exist, but they are smaller, newer or narrower.",
  early: "Mostly laboratory, animal or very small human studies so far.",
};

/** Maps to the Badge tones already in the design system. */
export const evidenceTierTone: Record<EvidenceTier, "optimal" | "watch" | "neutral"> = {
  established: "optimal",
  emerging: "watch",
  early: "neutral",
};
