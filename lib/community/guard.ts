import type { EscalationKind } from "@/lib/escalations/types";
import type { PostClassification } from "@/lib/community/types";

/**
 * The community guard — the thing that turns the risk into the feature.
 *
 * ── The problem, stated plainly ───────────────────────────────────────────
 * Every men's-health clinic that has ever launched a member forum has watched
 * the same thread appear in week three: "what are you on / what dose / my buddy
 * runs 200 a week". It is already in this product's own data — escalation
 * esc-002 is a real seeded member saying exactly that to his coach:
 *
 *     "just tell me what number I'd be on, my buddy's on 200 a week and he
 *      says it changed his life — if you guys can't do it I'll find somewhere
 *      that will"
 *
 * That member is not being reckless. He is being under-served. He has a real
 * question, he cannot get it answered fast enough, so he takes it to whoever
 * will answer — and in a forum, someone always will. The danger is not that
 * he asks. The danger is that the platform PUBLISHES the answer, because a
 * clinic-hosted page carrying another member's dosing advice reads, to him and
 * to a plaintiff's attorney, as the clinic endorsing it.
 *
 * ── What this file does about it ──────────────────────────────────────────
 * It refuses to publish, and then it does the thing a refusal alone never
 * does: it routes. The blocked text becomes a question addressed to the
 * member's own provider, raised through lib/escalations with a priority and
 * therefore an SLA clock on it. The member does not get silence and he does
 * not get bro-science. He gets an owner and a due time.
 *
 * That is the whole trade. A liability becomes a care moment — and, not
 * incidentally, the clinic now has a measurable signal it never had before:
 * the volume of blocked posts IS the volume of unanswered clinical anxiety in
 * the membership, which is a number worth putting on a dashboard.
 *
 * ── Honest limits ─────────────────────────────────────────────────────────
 * This is keyword and shape matching. It is a speed bump, not a wall:
 *
 *  - It is trivially evadable. "t3st", "the usual", "you know what I mean",
 *    an image of a vial, or simply moving to DMs all defeat it.
 *  - It does not understand context, so it will block benign posts. A member
 *    writing "PR'd my bench, 315 for a triple" is fine, but "ran 5 miles at
 *    150 bpm" brushes close to the numeric patterns and a post about a "test
 *    prep diet" can trip the ambiguous-term list.
 *  - It reads English only, and only literal text.
 *
 * Those limits are acceptable ONLY because of how the failure is handled: a
 * false positive costs a member one extra tap and gets their question in front
 * of a clinician, which is a good outcome dressed as an inconvenience. A false
 * negative publishes dosing advice. The asymmetry is enormous, so this
 * classifier is tuned to over-block on purpose and every threshold below leans
 * that way.
 *
 * A real deployment does NOT ship this alone. It pairs it with:
 *  - Azure AI Content Safety (or equivalent) for semantic classification that
 *    survives obfuscation and paraphrase, called server-side before persist;
 *  - a human moderator queue — the group coach — reviewing anything the
 *    classifier passes but flags as borderline, and reviewing blocks so false
 *    positives get released quickly;
 *  - rate limits and DM restrictions, because the conversation this prevents
 *    on the wall will otherwise simply relocate.
 *
 * This function is the fast, deterministic, client-side first pass that keeps
 * the obvious 90% off the page and makes the escalation offer feel instant.
 * It is never the only control.
 */

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/**
 * STRONG signals block on their own.
 *
 * A community post that names a compound is out of scope regardless of the
 * sentence it sits in. "Anyone else on semaglutide?" and "don't take
 * semaglutide" are both conversations that belong with a provider, not on a
 * wall — the second one more urgently than the first.
 */
const STRONG: { re: RegExp; label: string }[] = [
  // ── A number sitting next to a dosing unit. The signature of a dose. ──
  { re: /\b\d+(?:\.\d+)?\s*(?:mg|mcg|ug|ml|iu|cc|units?)\b/i, label: "a dose amount" },
  // Reversed form: "200 units", "two ius" is rare enough to skip; unit-first is not.
  { re: /\b(?:mg|mcg|iu|cc)\s*\d+/i, label: "a dose amount" },
  /**
   * The bare number — the form the real escalation actually took.
   *
   * esc-002 says "my buddy's on 200 a week". There is no unit in that sentence
   * and there never is, because everyone in the conversation already knows what
   * 200 means. A classifier that only looks for "mg" misses the exact post it
   * exists to catch, so this matches an amount hanging off a preposition and
   * excludes the units that make it innocent — reps, lbs, steps, miles, bpm.
   * "on 200 a week" trips. "at 150 bpm" and "315 for a triple" do not.
   */
  {
    re: /\b(?:on|taking|running|pinning|at)\s+\d{2,4}\b(?!\s*(?:lbs?|pounds?|kgs?|reps?|sets?|steps?|cals?|calories?|grams?|g\b|mins?|minutes?|miles?|k\b|bpm|%|percent|days?|weeks?|months?|years?|am|pm))/i,
    label: "an unlabelled amount",
  },
  /** "200 a week", "100 every other day" — a frequency, which is a schedule. */
  {
    re: /\b\d{2,4}\s*(?:a|per|\/|every)\s*(?:week|wk|day|month|other\s+day)\b/i,
    label: "a dosing frequency",
  },

  // ── Peptides and hormones. Brand and generic, plus the common shorthands. ──
  {
    re: /\b(?:testosterone|test\s*(?:c|cyp|cypionate|e|enanthate|prop|propionate|u|undecanoate)|tren(?:bolone)?|deca|nandrolone|anavar|oxandrolone|winstrol|dianabol|primobolan|masteron|equipoise|sustanon)\b/i,
    label: "a hormone or steroid",
  },
  {
    re: /\b(?:semaglutide|tirzepatide|retatrutide|liraglutide|ozempic|wegovy|mounjaro|zepbound|saxenda|rybelsus)\b/i,
    label: "a GLP-1 medication",
  },
  {
    re: /\b(?:hcg|hmg|anastrozole|arimidex|aromasin|exemestane|clomid|clomiphene|enclomiphene|tamoxifen|nolvadex|finasteride|dutasteride)\b/i,
    label: "a prescription medication",
  },
  {
    re: /\b(?:bpc[\s-]*157|bpc|tb[\s-]*500|ipamorelin|sermorelin|tesamorelin|cjc[\s-]*1295|ghrp[\s-]*[26]|hexarelin|pt[\s-]*141|bremelanotide|melanotan|nad\+?|kisspeptin|epitalon|thymosin|selank|semax|mots[\s-]*c|aod[\s-]*9604)\b/i,
    label: "a peptide",
  },

  // ── Route and administration. There is no benign reason to discuss these here. ──
  {
    re: /\b(?:inject(?:ing|ion|ions|ed)?|intramuscular|subcutaneous|sub[\s-]?q|pinning|pinned|\bpin\s+(?:it|my|the|in)|syringe|vial|reconstitut\w*|bacteriostatic|troche|pellet(?:s)?\b)/i,
    label: "administration detail",
  },

  // ── Cycling and stacking. The vocabulary of self-prescription. ──
  {
    re: /\b(?:titrat\w*|stack(?:ing|ed)?\b|cycle\s+(?:on|off|length)|blast(?:ing)?\s+and\s+cruis\w*|pct\b|source(?:d|ing)?\s+(?:it|from)|gray\s*market|research\s+chem\w*|underground\s+lab|ugl\b)/i,
    label: "cycling or sourcing",
  },
];

/**
 * WEAK signals never block alone — two of them together do.
 *
 * Each of these appears constantly in legitimate posts. "Should I" opens half
 * the questions a member ever asks a coach ("should I train fasted?"). "Dose"
 * shows up in "my vitamin D dose". "Test" is the worst of them: lab test, test
 * results, test day, testing a new recipe. Blocking any one of these on its
 * own would make the composer feel broken and teach members to route around it,
 * which is a far worse security posture than a slightly leakier filter.
 *
 * Two together is a different sentence. "What dose should I be on" is not a
 * post. It is an escalation someone typed into the wrong box.
 */
const WEAK: { re: RegExp; label: string }[] = [
  { re: /\b(?:dose|dosage|dosing|mg\b|units\b|protocol\b|script\b|prescri\w+)/i, label: "dosing language" },
  { re: /\b(?:test|t\s*levels?|total\s+t|free\s+t|estrogen|e2\b|trt\b|hrt\b)\b/i, label: "an ambiguous clinical term" },
  {
    re: /\bwhat(?:'s| is| are)?\s+(?:you|u|everyone|anyone|y'?all|people|he|she|they)\b.*\b(?:on|taking|running|using|doing)\b/i,
    label: "asking what someone else takes",
  },
  {
    re: /\b(?:what|which|how\s+(?:much|many)|how\s+often)\b.*\b(?:should\s+i|do\s+i|would\s+i|can\s+i|am\s+i)\b/i,
    label: "asking what you should take",
  },
  { re: /\b(?:should\s+i|can\s+i|do\s+i\s+need\s+to)\s+(?:start|stop|switch|increase|raise|lower|bump|drop|add|take|try)\b/i, label: "asking whether to change something" },
  { re: /\b(?:anyone\s+else\s+on|who(?:'s| is)\s+on|are\s+you\s+on|what\s+are\s+you\s+on|what\s+number)\b/i, label: "asking what someone else takes" },
  /**
   * Comparing yourself to a third party. "My buddy's on…" is the opening line
   * of every peer-prescribing conversation there has ever been.
   */
  { re: /\bmy\s+(?:buddy|buddies|friend|friends|brother|cousin|neighbou?r|coworker|co-worker|trainer)\b/i, label: "comparing to someone else" },
  /**
   * Symptoms. Mirrors the SIDE_EFFECT list below rather than a shorter one,
   * because "headaches since we raised it" needs a second signal to reach the
   * two-weak threshold and the symptom IS the second signal.
   */
  { re: /\b(?:side\s+effects?|nausea|vomit\w*|rash|dizz\w*|palpitation|headaches?|swelling|bloat(?:ed|ing)?|crash(?:ed|ing)?|shut\s*down|acne|hair\s*loss|water\s*retention|libido|numbness|fatigue)\b/i, label: "a possible side effect" },
];

/**
 * Side-effect language upgrades the ROUTING, not the block decision.
 *
 * If someone is describing something happening to their body, the escalation
 * kind should say so — a provider triaging a queue reads the kind before the
 * body text, and "Side effect" gets picked up before "Out of scope".
 */
/**
 * `numb\b|numbness` rather than `numb\w*`: the greedy form matches "number",
 * which mis-routed "just tell me what number I'd be on" as a Side effect when
 * it is plainly Out of scope. Kind drives triage order in the provider queue,
 * so a wrong kind is not cosmetic.
 */
const SIDE_EFFECT = /\b(?:side\s+effects?|nausea|vomit\w*|rash|dizz\w*|palpitation|headaches?|swelling|bloat(?:ed|ing)?|acne|hair\s*loss|crash(?:ed|ing)?|shut\s*down|numbness|numb\b|chest\s+(?:pain|tightness|pressure))/i;

/** Language that says "I want to change what I'm on". */
const DOSE_CHANGE =
  /\b(?:increase|raise|lower|reduce|bump|drop|adjust|change|switch|start|stop)\b.{0,24}\b(?:dose|dosage|protocol|mg|units|it|this)\b|\b(?:what|which)\s+dose\b|\bhow\s+much\s+should\s+i\b/i;

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/** Asking the room what it takes, in any of its usual phrasings. */
const PEER_ASK =
  /\b(?:anyone\s+else\s+on|who(?:'s| is)\s+on|are\s+you\s+on|what\s+are\s+you\s+on|what\s+(?:is|are)\s+(?:everyone|y'?all|people)\s+(?:on|taking|running)|my\s+(?:buddy|friend|brother|cousin)\b)/i;

/** Dedupe labels — three peptide names matching should read as one reason. */
function uniq(list: string[]): string[] {
  return Array.from(new Set(list));
}

/**
 * Decide the escalation kind so the provider queue sorts it usefully.
 *
 * Order matters: a post can be all three at once, and "I've had headaches since
 * we raised it, should I drop back down?" is a side effect first — that is the
 * framing that gets it read soonest.
 */
function kindFor(text: string): EscalationKind {
  if (SIDE_EFFECT.test(text)) return "Side effect";
  if (DOSE_CHANGE.test(text)) return "Dose change request";
  // "What's everyone on?" is not a clinical question about this member — it is
  // a request for peer prescribing, which is precisely the "Out of scope" bucket
  // esc-002 already lives in.
  if (PEER_ASK.test(text)) return "Out of scope";
  return "Clinical question";
}

/**
 * Classify a community post before it is published.
 *
 * Pure and deterministic — same text in, same verdict out, no clock, no
 * randomness. That matters beyond the demo: a classifier whose verdict drifts
 * cannot be audited after an incident, and "why was this allowed through"
 * is the first question anyone will ask.
 */
export function classifyPost(text: string): PostClassification {
  const trimmed = text.trim();
  if (!trimmed) return { safe: true };

  const strongHits = STRONG.filter((s) => s.re.test(trimmed)).map((s) => s.label);
  const weakHits = WEAK.filter((w) => w.re.test(trimmed)).map((w) => w.label);

  // Strong alone blocks. Two independent weak signals block. One weak passes.
  const matched = uniq([...strongHits, ...weakHits]);
  const blocked = strongHits.length > 0 || uniq(weakHits).length >= 2;

  if (!blocked) return { safe: true };

  const kind: EscalationKind = kindFor(trimmed);

  return {
    safe: false,
    /**
     * Written for the member who just got stopped, not for a compliance file.
     * It says what the rule is, why it exists in terms he benefits from, and
     * what happens next — because a block with no next step is the moment he
     * goes and asks his buddy instead, which is the outcome we are preventing.
     */
    reason:
      "This one's for your provider, not the group. Medication, dosing and anything happening in your body gets answered by someone who can see your labs — what works for another member can be wrong or unsafe for you.",
    matched,
    suggestedEscalation: {
      kind,
      /**
       * The member's exact words are preserved and quoted, never paraphrased.
       * The provider needs to read what he actually asked — the paraphrase is
       * where the clinically load-bearing detail goes missing, which is the
       * same reason Escalation carries `sourceQuote`.
       */
      question: `Asked in the community group: "${trimmed}"`,
    },
  };
}

/**
 * Does this text look like it belongs in community at all?
 *
 * Sugar over classifyPost for callers that only need the boolean — kept so a
 * future surface (a coach previewing a broadcast, say) cannot accidentally
 * reimplement the rules with slightly different regexes.
 */
export function isPublishable(text: string): boolean {
  return classifyPost(text).safe;
}
