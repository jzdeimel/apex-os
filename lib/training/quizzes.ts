import type { Quiz, QuizId } from "@/lib/training/types";

/**
 * THE CURRICULUM.
 *
 * Six quizzes on what an Alpha Health coach is actually asked in a day. The
 * content is written to be usable, not decorative — a coach who works through
 * these should be measurably better at the two things that matter: giving
 * members accurate general education, and recognising the moment a question
 * stops being theirs to answer.
 *
 * A note on the boundary, since it governs every word below: nothing here is
 * dosing guidance, and nothing here equips a coach to individualize therapy.
 * The pharmacology sections exist so a coach understands what a member is
 * taking and can spot a red flag early — not so they can advise on it. The
 * scope-of-practice quiz is the one that carries the license risk, and it is
 * marked required for that reason.
 */

const PEPTIDE_BASICS: Quiz = {
  id: "peptide-basics",
  title: "Peptide basics",
  category: "Pharmacology",
  summary:
    "What the clinic's common peptides do, how they differ, and which member reports need a provider today.",
  whyItMatters:
    "Members routinely ask a coach what a peptide 'does' before their provider visit. Getting the mechanism right builds trust; getting it wrong sets an expectation the provider then has to unwind.",
  estimatedMinutes: 8,
  required: false,
  questions: [
    {
      id: "pep-1",
      prompt:
        "A member starting a BPC-157 / TB-500 blend asks what it is for. Which answer is both accurate and inside a coach's lane?",
      options: [
        { id: "a", text: "\"It's a healing drug — your shoulder should be fixed in three weeks.\"" },
        {
          id: "b",
          text: "\"They're peptides your provider uses to support soft-tissue repair and recovery. They're compounded, not FDA-approved products, so your provider will set the plan and we'll track how your shoulder responds.\"",
        },
        { id: "c", text: "\"It's basically the same as a steroid, but legal.\"" },
        { id: "d", text: "\"It replaces the growth hormone your body stopped making.\"" },
      ],
      correctOptionId: "b",
      explanation:
        "BPC-157 and TB-500 are research peptides used in this setting to support soft-tissue and connective-tissue recovery. Two things make option B the right answer. First, it is honest about regulatory status — these are compounded preparations, not FDA-approved drugs (BPC-157 in particular has been flagged by the FDA for compounding from bulk substances), and a member deserves to know that from you rather than from a search result later. Second, it promises a process, not an outcome. Option A is the trap: it is the answer members want, and a healing timeline is a clinical prediction a coach cannot make. Neither peptide is an anabolic steroid or a growth hormone.",
    },
    {
      id: "pep-2",
      prompt: "How does Sermorelin work?",
      options: [
        { id: "a", text: "It is synthetic human growth hormone, injected directly." },
        {
          id: "b",
          text: "It is a growth-hormone-releasing hormone analog — it signals the pituitary to release the body's own growth hormone in natural pulses.",
        },
        { id: "c", text: "It blocks somatostatin so growth hormone cannot be cleared." },
        { id: "d", text: "It converts to testosterone in the liver." },
      ],
      correctOptionId: "b",
      explanation:
        "Sermorelin is a GHRH analog — a secretagogue. It prompts the pituitary to release its own growth hormone, which preserves the body's pulsatile release pattern and its negative feedback loop. That distinction is not academic and it is the one members most often get wrong: exogenous HGH overrides the feedback loop and shuts down natural production, while a secretagogue works through it. When a member says \"I'm on growth hormone,\" this is usually what they mean, and the two are not interchangeable.",
    },
    {
      id: "pep-3",
      prompt:
        "Why are Ipamorelin and CJC-1295 so often prescribed together?",
      options: [
        { id: "a", text: "They are the same molecule sold under two names." },
        { id: "b", text: "CJC-1295 is a stimulant and Ipamorelin offsets the jitters." },
        {
          id: "c",
          text: "They act on two different receptors — CJC-1295 is a long-acting GHRH analog, Ipamorelin is a selective ghrelin-receptor secretagogue — so combining them produces a stronger, still-pulsatile release than either alone.",
        },
        { id: "d", text: "Ipamorelin is only used to reduce injection-site irritation from CJC-1295." },
      ],
      correctOptionId: "c",
      explanation:
        "Two complementary levers on the same output. CJC-1295 extends GHRH signalling; Ipamorelin hits the ghrelin/GHS receptor. Ipamorelin's specific value is its selectivity — unlike older secretagogues it does not meaningfully raise cortisol or prolactin, which is why it is the one paired with a long-acting GHRH analog. Useful to know for a coach: 'not the same receptor' is the reason a member cannot simply double one instead of taking both, a substitution members propose surprisingly often.",
    },
    {
      id: "pep-4",
      prompt:
        "A member on PT-141 (bremelanotide) reports nausea and flushing about an hour after dosing. What is the correct read?",
      options: [
        {
          id: "a",
          text: "This is a recognised, common effect of PT-141 — it is a centrally-acting melanocortin agonist, and nausea and flushing are its most frequently reported effects. Log it and route it to the provider, who owns any change to the plan.",
        },
        { id: "b", text: "It is an allergic reaction — tell them to stop permanently." },
        { id: "c", text: "PT-141 has no systemic effects; the nausea is unrelated." },
        { id: "d", text: "Tell them to halve their next dose and see if it settles." },
      ],
      correctOptionId: "a",
      explanation:
        "PT-141 is a melanocortin receptor agonist that works centrally on sexual desire — a completely different pathway from PDE5 inhibitors like sildenafil, which work vascularly. Because it acts centrally and systemically, nausea and flushing are the classic reported effects, and transient blood-pressure changes are documented. Knowing it is expected lets you reassure accurately; it does not let you act. Option D is the one to notice — halving a dose feels like caution, but it is still a coach changing a prescribed amount, which is the line.",
    },
    {
      id: "pep-5",
      prompt:
        "A member fifteen minutes into an NAD+ infusion reports chest tightness and nausea. What happens next?",
      options: [
        { id: "a", text: "Nothing — this always passes. Let it finish on schedule." },
        {
          id: "b",
          text: "Get clinical staff to the chair immediately. These are the classic infusion-rate effects of NAD+ and the drip rate is a clinical decision — a coach does not adjust it.",
        },
        { id: "c", text: "Slow the drip yourself and keep monitoring." },
        { id: "d", text: "Pull the line and send the member home." },
      ],
      correctOptionId: "b",
      explanation:
        "NAD+ is a coenzyme central to cellular energy metabolism, and infusing it too quickly reliably produces chest tightness, nausea and flushing. Experienced staff know the fix is usually to slow the rate — which is exactly why option C is the seductive wrong answer. It is the correct clinical instinct and still not a coach's call: the moment you touch an infusion rate you have made a treatment decision on a member with active symptoms. Your job is to get the right person there fast, stay with the member, and document. That is not a smaller contribution; on an infusion floor it is the whole job.",
    },
  ],
};

const GLP1: Quiz = {
  id: "glp1",
  title: "GLP-1s and their side-effect profile",
  category: "Pharmacology",
  summary:
    "Semaglutide, tirzepatide and retatrutide: what they are, what they predictably do, and the three reports that need a provider today.",
  whyItMatters:
    "GLP-1 members generate more coach questions than any other population in the clinic, and the difference between a nuisance side effect and a red flag is something a coach must be able to recognise in a text message at 9pm.",
  estimatedMinutes: 10,
  required: true,
  questions: [
    {
      id: "glp-1",
      prompt:
        "How do semaglutide, tirzepatide and retatrutide differ pharmacologically?",
      options: [
        { id: "a", text: "They are identical; the names are brand differences only." },
        {
          id: "b",
          text: "Semaglutide is a GLP-1 receptor agonist; tirzepatide is a dual GIP and GLP-1 agonist; retatrutide adds a third target, glucagon receptor agonism.",
        },
        { id: "c", text: "They differ only in injection frequency." },
        { id: "d", text: "Tirzepatide is an oral form of semaglutide." },
      ],
      correctOptionId: "b",
      explanation:
        "One, two and three receptor targets respectively. This matters to a coach for a practical reason: members compare notes constantly and assume that because a friend tolerated one, the next is 'the same drug, stronger.' It is not — a different receptor profile means a different response and a different side-effect experience, and a switch between them is a fresh titration decision by the provider, not a conversion. Semaglutide does have an oral formulation, which is where option D's confusion comes from, but that is a route difference within one molecule, not a relationship between two.",
    },
    {
      id: "glp-2",
      prompt:
        "Which side effects should a coach expect to hear about most from a member starting or stepping up a GLP-1?",
      options: [
        { id: "a", text: "Joint pain and hair thinning." },
        { id: "b", text: "Insomnia and elevated heart rate." },
        {
          id: "c",
          text: "Gastrointestinal effects — nausea, vomiting, constipation, diarrhoea, early satiety — typically worst in the days after a dose increase.",
        },
        { id: "d", text: "Injection-site infection." },
      ],
      correctOptionId: "c",
      explanation:
        "GI effects dominate, and they are mechanistic rather than incidental: these drugs slow gastric emptying, so nausea and constipation are the expected consequence of the thing they are prescribed to do. The clinically important pattern is timing — symptoms cluster after each dose escalation and usually settle, which is precisely why providers titrate slowly. A coach's highest-value contribution here is behavioural and entirely inside scope: smaller meals, fluid and fibre, protein first, and accurate documentation of severity so the provider can decide whether to hold at the current step.",
    },
    {
      id: "glp-3",
      prompt:
        "A GLP-1 member messages you: severe, persistent abdominal pain radiating to the back, with vomiting. What do you do?",
      options: [
        { id: "a", text: "Reassure them this is normal GLP-1 nausea and suggest ginger tea." },
        { id: "b", text: "Tell them to skip this week's dose and message you Monday." },
        {
          id: "c",
          text: "Treat it as urgent: escalate to the provider immediately and direct them to emergency care. This is the classic presentation of pancreatitis.",
        },
        { id: "d", text: "Book them a body scan to rule out bloating." },
      ],
      correctOptionId: "c",
      explanation:
        "Severe persistent abdominal pain radiating to the back, with vomiting, is the textbook presentation of acute pancreatitis, a recognised risk with GLP-1 therapy. This is the single most important thing on this quiz. Every wrong answer here is wrong the same way — it treats an emergency as routine because the routine version of it (ordinary GLP-1 nausea) is something you hear about ten times a week. The discriminators are severity, persistence and radiation to the back. When those are present you escalate and you direct to emergency care; you do not wait for a callback, and you do not manage it yourself.",
    },
    {
      id: "glp-4",
      prompt:
        "A member has lost 34 lb on a GLP-1 and their body scan shows a meaningful drop in lean mass. What is the coach's role?",
      options: [
        { id: "a", text: "None — weight loss is weight loss." },
        { id: "b", text: "Recommend they reduce their dose to slow it down." },
        {
          id: "c",
          text: "This is squarely the coach's job: drive protein intake and resistance training, and bring the scan trend to the provider so the medical plan accounts for it.",
        },
        { id: "d", text: "Tell them to stop the medication until lean mass recovers." },
      ],
      correctOptionId: "c",
      explanation:
        "A substantial fraction of weight lost on GLP-1 therapy is lean mass, and lean mass loss is what turns a good twelve months into a bad five years — lower resting metabolic rate, worse function, easier regain. This is the clearest example in the whole curriculum of work that is genuinely and exclusively the coach's: protein targets, progressive resistance training, adherence and scan cadence are all yours. Notice that options B and D are dose decisions dressed up as care. You surface the data; the provider decides what the medication does about it.",
    },
    {
      id: "glp-5",
      prompt:
        "During intake a member mentions their mother had medullary thyroid carcinoma. They ask whether that affects their GLP-1 plan. What is the correct response?",
      options: [
        { id: "a", text: "\"Only your own history counts, so you're fine.\"" },
        {
          id: "b",
          text: "\"That is important and I'm flagging it for your provider before anything is prescribed — family history of medullary thyroid carcinoma and MEN2 is specifically part of the prescribing decision.\"",
        },
        { id: "c", text: "\"It just means we start at a lower dose.\"" },
        { id: "d", text: "\"That only applies to tirzepatide, not semaglutide.\"" },
      ],
      correctOptionId: "b",
      explanation:
        "GLP-1 receptor agonists carry a boxed warning regarding thyroid C-cell tumours, and personal or FAMILY history of medullary thyroid carcinoma or MEN2 is explicitly part of that warning — which is what makes option A actively dangerous. The correct move is small and unglamorous: recognise the flag, say plainly that it goes to the provider, and route it before anything is prescribed. Note that B commits to nothing clinical. It does not say the member cannot proceed, or can. It gets the right information to the right person before the decision, which is the entire mechanism by which a coach prevents harm.",
    },
  ],
};

const TRT: Quiz = {
  id: "trt-fundamentals",
  title: "TRT fundamentals — and the dosing line",
  category: "Pharmacology",
  summary:
    "What testosterone therapy does, what it monitors for, and precisely what a coach may and may not say about dosing.",
  whyItMatters:
    "Testosterone is a Schedule III controlled substance. A coach who advises on an amount has not made a customer-service mistake — they have practised medicine without a licence, and the clinic carries that.",
  estimatedMinutes: 10,
  required: true,
  questions: [
    {
      id: "trt-1",
      prompt: "Which statement about testosterone therapy in the US is correct?",
      options: [
        { id: "a", text: "It is an over-the-counter supplement when compounded." },
        {
          id: "b",
          text: "Testosterone is a Schedule III controlled substance; it requires a prescription from a licensed provider and its dosing is a medical decision throughout.",
        },
        { id: "c", text: "It is prescription-only to start, after which the member self-manages." },
        { id: "d", text: "Coaches may adjust it within the range the provider documented." },
      ],
      correctOptionId: "b",
      explanation:
        "Schedule III, full stop — the same legal category as ketamine and anabolic steroids generally. Option D deserves attention because it sounds so reasonable, and versions of it get said out loud in clinics: if the provider wrote a range, surely moving inside it is fine? No. Selecting a point within a prescribed range is still an individualized clinical determination, and the licence to make it is the provider's. In Apex this is enforced structurally rather than by policy: the plan-of-care item type has no dose field a coach could write to.",
    },
    {
      id: "trt-2",
      prompt:
        "A 34-year-old member starting TRT mentions he and his wife want a child in the next two years. Why does this need to reach the provider before therapy starts?",
      options: [
        { id: "a", text: "It doesn't — TRT has no effect on fertility." },
        {
          id: "b",
          text: "Exogenous testosterone suppresses LH and FSH through negative feedback, which suppresses spermatogenesis. Fertility planning materially changes the provider's approach, so it must be on the table before the first injection.",
        },
        { id: "c", text: "Because TRT causes birth defects." },
        { id: "d", text: "Only because insurance requires the disclosure." },
      ],
      correctOptionId: "b",
      explanation:
        "This is the single most commonly missed intake conversation in men's health. Exogenous testosterone shuts down the HPG axis: LH and FSH drop, and testicular sperm production drops with them — sometimes to zero, and recovery is neither guaranteed nor quick. Members hear 'testosterone' and reasonably assume more fertility, not less. The management options are the provider's to weigh, but the disclosure is yours to catch, and it is worth infinitely more before therapy starts than eighteen months in.",
    },
    {
      id: "trt-3",
      prompt:
        "A member's follow-up labs show haematocrit rising toward the top of the reference range. He asks you what it means and what he should do.",
      options: [
        { id: "a", text: "Tell him it's a known effect and to donate blood." },
        { id: "b", text: "Tell him to skip a week of injections until it settles." },
        {
          id: "c",
          text: "Explain generally that testosterone therapy can raise red-cell production, which is why the clinic monitors this marker, and route the result to his provider for interpretation and any change to the plan.",
        },
        { id: "d", text: "Tell him not to worry — it's still inside the reference range." },
      ],
      correctOptionId: "c",
      explanation:
        "Erythrocytosis is one of the main reasons TRT is monitored at all, so the general education in option C is accurate and squarely in scope. Everything after it is not. Therapeutic phlebotomy (A) is a treatment; skipping doses (B) is a dose change; and D is the quiet failure mode — dismissing a trend because a single value has not crossed a threshold, when the trend is precisely what the provider needs to see. Watch the pattern: you may explain what a marker is and why it is watched. You may not tell a member what THEIR value means or what to do about it.",
    },
    {
      id: "trt-4",
      prompt:
        "Which of these is a coach genuinely permitted to do on a TRT member's plan?",
      options: [
        { id: "a", text: "Set the weekly dose within the provider's stated range." },
        { id: "b", text: "Change injection frequency from weekly to twice weekly to smooth levels." },
        {
          id: "c",
          text: "Reinforce the schedule the provider prescribed, coach injection technique as the provider instructed, drive training, nutrition, sleep and adherence, and make sure monitoring labs actually get drawn on time.",
        },
        { id: "d", text: "Add an aromatase inhibitor when the member reports feeling puffy." },
      ],
      correctOptionId: "c",
      explanation:
        "Everything in option C is real, skilled work, and it is most of what determines whether a member gets a good outcome — adherence and lab follow-through are where TRT protocols actually fail. A, B and D are all the same violation wearing different clothes: setting an amount, changing a regimen, and adding a medication. Note that B is the sneakiest, because splitting a weekly dose is frequently what the provider ends up doing. Being right about the destination does not give you the authority to drive there.",
    },
    {
      id: "trt-5",
      prompt:
        "A member texts: \"I'm on 200mg a week and I feel flat again by day six. Can I just run 250 for a month and see?\" What do you do?",
      options: [
        { id: "a", text: "Say 250 is a common dose and it should be fine for a month." },
        { id: "b", text: "Tell him to split 200 into two injections instead — same total, so it isn't a dose change." },
        {
          id: "c",
          text: "Decline to advise on the amount, tell him plainly why, capture exactly what he described including the day-six timing, and route it to his provider today.",
        },
        { id: "d", text: "Tell him to hold steady and raise it at his next appointment in six weeks." },
      ],
      correctOptionId: "c",
      explanation:
        "Three of these four answers are a coach making a dosing decision, including the two that feel like restraint. Option B changes the regimen even though the weekly total is unchanged. Option D is the one most coaches would pick and it is still wrong: instructing a member to continue at a dose while symptomatic, and deferring reassessment for six weeks, is clinical management by another name. What makes C strong is the detail — 'flat by day six' is a trough pattern the provider will find genuinely informative. You are not fobbing him off. You are routing a good clinical observation to the only person allowed to act on it.",
    },
  ],
};

const WOMENS_HEALTH: Quiz = {
  id: "womens-hormone-health",
  title: "Women's hormone health & perimenopause",
  category: "Clinical literacy",
  summary:
    "The perimenopausal transition, why the labs mislead, and why male protocols never transfer.",
  whyItMatters:
    "Perimenopausal members arrive having been dismissed elsewhere, often for years. A coach who understands the transition is frequently the first person who takes them seriously — and the first who can route them correctly.",
  estimatedMinutes: 9,
  required: false,
  questions: [
    {
      id: "wh-1",
      prompt: "How are perimenopause and menopause distinguished?",
      options: [
        { id: "a", text: "They are two words for the same event." },
        {
          id: "b",
          text: "Perimenopause is the transition leading up to the final menstrual period — often several years, frequently beginning in the forties. Menopause is diagnosed retrospectively, after twelve consecutive months without a period.",
        },
        { id: "c", text: "Menopause begins at 50 by definition; perimenopause is anything earlier." },
        { id: "d", text: "Perimenopause is diagnosed by an FSH level above 25." },
      ],
      correctOptionId: "b",
      explanation:
        "Two things a coach should be able to say confidently. First, menopause is a retrospective diagnosis — twelve months of amenorrhoea, confirmed only by looking backwards. Second, perimenopause is not brief: it commonly runs four to eight years and can begin in the late thirties. That second point is why members are so often dismissed. A 43-year-old with brutal sleep disruption and cycle changes is told she is 'too young for menopause,' which is true and completely beside the point, because she is not in menopause — she is in the transition, and the transition is where the symptoms live.",
    },
    {
      id: "wh-2",
      prompt:
        "A member asks why the clinic won't diagnose her perimenopause from a single FSH and estradiol draw. What is the accurate explanation?",
      options: [
        { id: "a", text: "Those hormones can't be measured reliably in a blood test." },
        {
          id: "b",
          text: "During the transition these hormones fluctuate dramatically from cycle to cycle and even week to week, so a single draw can look entirely normal in a symptomatic woman. Diagnosis is primarily clinical — symptoms and cycle history.",
        },
        { id: "c", text: "Insurance won't cover the panel." },
        { id: "d", text: "FSH is only meaningful in men." },
      ],
      correctOptionId: "b",
      explanation:
        "Erratic hormones are the defining feature of perimenopause, not a stable decline — estradiol in particular can swing higher than in a normal cycle before it falls. A single snapshot therefore proves very little, and a normal-looking result is the mechanism by which symptomatic women get told nothing is wrong. Being able to explain this clearly is one of the highest-value things a coach does here: it reframes 'your labs were fine' from a dismissal into an expected and well-understood limitation of the test.",
    },
    {
      id: "wh-3",
      prompt:
        "Which cluster is most typical of EARLY perimenopause, before vasomotor symptoms dominate?",
      options: [
        { id: "a", text: "Hot flushes and night sweats only." },
        {
          id: "b",
          text: "Changing cycle length and flow, disrupted sleep, mood and irritability changes, and new difficulty with recovery and body composition.",
        },
        { id: "c", text: "Joint pain alone." },
        { id: "d", text: "There are no early symptoms; onset is abrupt." },
      ],
      correctOptionId: "b",
      explanation:
        "Hot flushes are the cultural shorthand, but they are frequently not the opening act. Cycle irregularity, fractured sleep, mood change and a sudden loss of the training and body-composition response a woman relied on for twenty years typically come first — and they are the ones she will raise with a coach rather than a doctor, because they sound like lifestyle problems. Recognising that cluster for what it might be, and routing it, is the whole point of this question.",
    },
    {
      id: "wh-4",
      prompt:
        "A female member has read about testosterone therapy for low libido and asks whether she can use the protocol her husband is on.",
      options: [
        { id: "a", text: "Yes, at half his dose." },
        {
          id: "b",
          text: "No. Testosterone use in women is at a small fraction of male dosing, is prescribed for different indications, is off-label in the US for this purpose, and is entirely a provider decision — male protocols never transfer.",
        },
        { id: "c", text: "Testosterone has no role in women's physiology." },
        { id: "d", text: "Only if her total testosterone is below the male reference range." },
      ],
      correctOptionId: "b",
      explanation:
        "Testosterone is genuinely relevant to female physiology and low-dose therapy is used for hypoactive sexual desire disorder — so option C overcorrects into something false. But the therapeutic dose in women is a small fraction of a male dose, there is no FDA-approved female testosterone product in the US, and overshooting produces effects that are not all reversible. Option A is the dangerous one because it sounds proportionate; 'half his dose' is still an order of magnitude too much. And option D quietly reveals the underlying error — reading a woman's result against a male reference range.",
    },
    {
      id: "wh-5",
      prompt:
        "A member says her mother was told hormone therapy causes breast cancer, and asks whether that is true.",
      options: [
        { id: "a", text: "\"Yes, that's why we don't offer it.\"" },
        { id: "b", text: "\"No, that was completely debunked — it's totally safe.\"" },
        {
          id: "c",
          text: "\"That belief traces to how the 2002 Women's Health Initiative results were reported. Later analysis showed risk and benefit depend heavily on a woman's age, how long since menopause, and which formulation — so it's a real conversation with your provider about your specific situation, not a yes or no.\"",
        },
        { id: "d", text: "\"Ignore anything from before 2010.\"" },
      ],
      correctOptionId: "c",
      explanation:
        "The WHI headlines drove a generation of women off hormone therapy, and subsequent re-analysis substantially changed the picture — the 'timing hypothesis' holds that the risk-benefit balance differs markedly for women who start near menopause versus many years after. But notice what option C actually does: it gives accurate context and then hands the decision back to the provider. Option B is wrong not only because it overstates the science but because it offers reassurance a coach has no standing to give. Correcting a misconception is in scope; concluding that a therapy is safe for this woman is not.",
    },
  ],
};

const LAB_LITERACY: Quiz = {
  id: "lab-literacy",
  title: "Lab literacy — reference range vs optimal range",
  category: "Clinical literacy",
  summary:
    "What a reference range actually is, what 'optimal' means at Alpha, and how to talk about a result without interpreting it.",
  whyItMatters:
    "Members see their own results in the portal now. They will ask a coach what the numbers mean before the provider review, every single time.",
  estimatedMinutes: 9,
  required: true,
  questions: [
    {
      id: "lab-1",
      prompt: "What does a laboratory reference range actually represent?",
      options: [
        { id: "a", text: "The range in which a person is healthy." },
        {
          id: "b",
          text: "A statistical description of the central ~95% of results in the lab's reference population — what is common, not what is healthy.",
        },
        { id: "c", text: "A range set by the FDA and identical across all labs." },
        { id: "d", text: "The range at which treatment is legally required." },
      ],
      correctOptionId: "b",
      explanation:
        "Reference ranges are built from a reference population and typically capture roughly the middle 95% of it — which is why they differ between labs and shift with the population sampled. The consequence is the single most useful idea in this quiz: 'in range' means 'common among the people this lab measured,' and if that population is broadly unwell, common is a low bar. That is the entire intellectual basis for a tighter optimal range, and it is a genuinely honest thing to explain to a member.",
    },
    {
      id: "lab-2",
      prompt:
        "A member's total testosterone is 340 ng/dL — inside the reference range, below Alpha's optimal band. How does a coach frame this?",
      options: [
        { id: "a", text: "\"You're low. You need TRT.\"" },
        { id: "b", text: "\"You're in range, so there's nothing to discuss.\"" },
        {
          id: "c",
          text: "\"That's inside the lab's reference range but below the band we target. It isn't a diagnosis and it isn't nothing — your provider reads it alongside your symptoms and the rest of the panel, and that conversation is on the calendar.\"",
        },
        { id: "d", text: "\"Ignore the number; only symptoms matter.\"" },
      ],
      correctOptionId: "c",
      explanation:
        "Options A and B are the two failure modes, and they mirror each other: one converts a number into a treatment recommendation, the other uses 'in range' to dismiss a symptomatic member. Option C holds both truths — the number is real information, and it is not a conclusion. The last clause matters as much as the rest: naming when the interpretation happens is what stops a member filling the silence with a search engine. A coach can situate a result. Only a provider can interpret one.",
    },
    {
      id: "lab-3",
      prompt:
        "A member's total testosterone looks adequate but he has significant symptoms. What might a provider be looking at that the total alone doesn't show?",
      options: [
        { id: "a", text: "Nothing — total testosterone is the complete picture." },
        {
          id: "b",
          text: "Free testosterone and SHBG. High sex hormone binding globulin binds more of the total, so free — the fraction actually available to tissue — can be low while the total reads normal.",
        },
        { id: "c", text: "Only haematocrit." },
        { id: "d", text: "Whether the draw was fasting." },
      ],
      correctOptionId: "b",
      explanation:
        "SHBG is the reason a coach should never reason from a single total. Most circulating testosterone is bound; what matters biologically is the free and bioavailable fraction, and SHBG rises with age, thyroid excess, oestrogen and liver conditions. So a perfectly reassuring total can sit on top of a genuinely low free level. You are not being asked to calculate anything — you are being asked to recognise that 'my total was normal' does not close the question, so a symptomatic member with a normal total still goes to the provider.",
    },
    {
      id: "lab-4",
      prompt: "What does HbA1c measure, and where does it mislead?",
      options: [
        { id: "a", text: "Blood glucose at the moment of the draw." },
        {
          id: "b",
          text: "Average glycation over roughly the prior three months, tracking red-cell lifespan — so anaemia, haemoglobin variants or altered red-cell turnover can distort it in either direction.",
        },
        { id: "c", text: "Total dietary sugar in the previous week." },
        { id: "d", text: "Insulin production by the pancreas." },
      ],
      correctOptionId: "b",
      explanation:
        "A1C reflects glycated haemoglobin, so it inherits red-cell biology — anything that changes how long red cells survive changes the result independent of glucose. Shortened survival can read falsely low; other conditions read falsely high. This is worth knowing because members treat A1C as a report card on the last three months of eating, and a coach who understands what it is can explain both why one bad weekend did not move it and why the provider sometimes wants a different marker entirely.",
    },
    {
      id: "lab-5",
      prompt:
        "A member calls, alarmed: one marker on a 62-marker panel came back flagged high. Everything else is unremarkable and he feels fine.",
      options: [
        { id: "a", text: "Tell him what the marker means and what condition it suggests." },
        { id: "b", text: "Tell him flagged values are always errors." },
        {
          id: "c",
          text: "Acknowledge it, explain generally that on a panel this size an isolated out-of-range value is statistically expected and that providers look at trend and clinical picture before acting, and confirm his provider is reviewing the full panel — without interpreting his result.",
        },
        { id: "d", text: "Order a repeat draw yourself." },
      ],
      correctOptionId: "c",
      explanation:
        "If a reference range captures the middle 95% of a population, then roughly one marker in twenty falls outside it by chance alone — on a 62-marker panel, isolated flags are the expected outcome, not the alarming one. That is real, useful, generalisable education and a coach should absolutely offer it. What option C carefully does not do is tell this member what HIS flag means. Option A crosses into diagnosis, option B replaces one false certainty with another, and option D orders a test, which is a clinical order a coach cannot place.",
    },
  ],
};

const SCOPE: Quiz = {
  id: "scope-of-practice",
  title: "Scope of practice — when to escalate",
  category: "Compliance",
  summary:
    "The line between coaching and practising medicine, tested against the situations where it actually gets crossed.",
  whyItMatters:
    "This is the one that carries real risk — to the member, to the coach personally, and to the clinic's licence. Every question below is modelled on a situation that happens in this clinic, under pressure, usually when the provider is unavailable.",
  estimatedMinutes: 12,
  required: true,
  questions: [
    {
      id: "sop-1",
      prompt:
        "What actually distinguishes coaching from practising medicine?",
      options: [
        { id: "a", text: "The topic — anything involving a drug is medicine, anything about food or training is coaching." },
        { id: "b", text: "Whether you charged for the advice." },
        {
          id: "c",
          text: "Whether you are making an individualized clinical determination for a specific person — diagnosing, prescribing, adjusting a regimen, or interpreting their results as a conclusion about their condition.",
        },
        { id: "d", text: "Whether you prefaced it with \"I'm not a doctor, but…\"" },
      ],
      correctOptionId: "c",
      explanation:
        "It is the act, not the subject matter and not the disclaimer. A coach may discuss medications at length as general education; a coach may not tell a specific member what their result means or what to take. Option A is the misconception that causes the most trouble in both directions — it makes coaches afraid to give accurate general information about drugs, while leaving them comfortable making individualized calls about supplements and fasting, which are equally clinical determinations. Option D is worth naming explicitly: the disclaimer changes nothing. If the substance is an individualized clinical judgement, you have made one.",
    },
    {
      id: "sop-2",
      prompt:
        "Which of these statements to a member is inside a coach's scope?",
      options: [
        {
          id: "a",
          text: "\"Nausea is the most common early effect of GLP-1s and it's why providers usually titrate slowly. I'm logging how bad yours is and sending it to your provider today.\"",
        },
        { id: "b", text: "\"Your nausea means your dose is too high — cut it in half this week.\"" },
        { id: "c", text: "\"Your fatigue plus that TSH is hypothyroidism. You'll need medication.\"" },
        { id: "d", text: "\"Skip your injection this week and see if you feel better.\"" },
      ],
      correctOptionId: "a",
      explanation:
        "Option A is general education about a drug class, plus documentation, plus a handoff — and it is genuinely helpful, which is the point worth internalising. Scope does not require you to be useless. The other three each cross a different line: B adjusts a dose, C delivers a diagnosis, D changes a regimen. Read them side by side and the pattern is clean. General statement about how a therapy usually behaves: yours. Statement about what THIS member should do differently: not yours.",
    },
    {
      id: "sop-3",
      prompt:
        "Which of the following can a coach handle alone, without escalating?",
      options: [
        { id: "a", text: "A member reporting chest pain during a training session." },
        { id: "b", text: "A member disclosing thoughts of self-harm." },
        { id: "c", text: "A member describing severe abdominal pain with vomiting." },
        {
          id: "d",
          text: "None of these. All three are immediate escalations, and two are emergencies — a coach's job is to escalate fast and stay with the member, not to triage.",
        },
      ],
      correctOptionId: "d",
      explanation:
        "The instinct this question tests is the urge to assess first — to decide how bad the chest pain probably is before bothering anyone. That instinct is where coaches get people hurt, because assessing severity IS triage and triage is clinical. All three warrant immediate escalation under the clinic's protocol, and disclosure of self-harm has its own pathway that must be followed exactly. Escalating something that turns out to be minor costs a provider four minutes. The reverse error has no ceiling.",
    },
    {
      id: "sop-4",
      prompt:
        "A member you have coached for two years asks, off the record and as a friend, whether he should add an over-the-counter supplement he read about to his stack. He is on three prescribed therapies. What do you do?",
      options: [
        { id: "a", text: "It's OTC and he's asking as a friend — share your honest opinion." },
        { id: "b", text: "Tell him it's fine as long as he doesn't tell his provider." },
        {
          id: "c",
          text: "Explain that anything added on top of prescribed therapy goes through his provider because of interaction risk, then actually route the question rather than leaving him to raise it himself.",
        },
        { id: "d", text: "Tell him you can't discuss supplements at all." },
      ],
      correctOptionId: "c",
      explanation:
        "Two traps in one question. The first is 'over-the-counter,' which members and coaches both hear as 'harmless' — but interaction risk is a property of the combination, not of the prescription status, and he is on three therapies. The second is 'as a friend.' You do not have a personal capacity with a member; the relationship is the reason he is asking, and an off-the-record answer is still an individualized recommendation. Option D fails differently: refusing to engage sends him to a forum instead. The right move is to take the question seriously and move it to the person who can weigh it.",
    },
    {
      id: "sop-5",
      prompt:
        "It's Friday afternoon. A member is out of medication, the prescribing provider is out until Thursday, and he is asking you what to do. He is upset and you are the only person he can reach.",
      options: [
        { id: "a", text: "Tell him what you'd do in his position — it's just a gap." },
        { id: "b", text: "Suggest he use a leftover vial from a previous protocol until Thursday." },
        {
          id: "c",
          text: "Escalate through the on-call provider pathway now, tell him plainly that you are doing it and when to expect contact, stay on the thread until a provider has him, and document the whole sequence.",
        },
        { id: "d", text: "Tell him to wait until Thursday and log a task for the provider's return." },
      ],
      correctOptionId: "c",
      explanation:
        "This is the scenario that catches good coaches, because every wrong answer is motivated by wanting to help. B is the worst — directing use of a previously dispensed medication is dispensing advice, and members offer their own leftover vials to each other more often than clinics admit. But D is the one that looks responsible and is not: instructing a member to go five days without prescribed therapy is a clinical decision, made by omission, by someone not licensed to make it. Every clinic has an on-call pathway for exactly this, and 'the provider is out' is when it exists, not an excuse for it not applying. The pressure to solve it yourself is the signal to escalate, not to improvise.",
    },
  ],
};

export const quizzes: Quiz[] = [
  SCOPE,
  TRT,
  GLP1,
  LAB_LITERACY,
  PEPTIDE_BASICS,
  WOMENS_HEALTH,
];

export const quizMap: Record<QuizId, Quiz> = Object.fromEntries(
  quizzes.map((q) => [q.id, q]),
) as Record<QuizId, Quiz>;

export function getQuiz(id: QuizId): Quiz | undefined {
  return quizMap[id];
}

export const REQUIRED_QUIZ_IDS: QuizId[] = quizzes
  .filter((q) => q.required)
  .map((q) => q.id);
