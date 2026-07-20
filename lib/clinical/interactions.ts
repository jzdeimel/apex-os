import { getClient } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { subscriptionsForClient } from "@/lib/mock/subscriptions";
import type { Biomarker, Recommendation } from "@/lib/types";

/**
 * INTERACTION AND CONTRAINDICATION SCREEN — findings, not fine print.
 *
 * The audited system had a contraindication screen. It rendered as a grey
 * paragraph under the approve button, it was collapsed by default, and in the
 * six months of logs we looked at nobody had ever expanded it. That is not a
 * user failing; it is what happens when the safety surface is styled like a
 * terms-of-service link and the decision surface is styled like a decision.
 *
 * So findings here are BLOCKING by construction. A finding with
 * `blocking: true` does not merely colour a border — the signing surface must
 * refuse to sign until it has been acknowledged individually, and the
 * acknowledgement goes to the ledger against the signer's name. The provider is
 * still free to proceed; they are not free to proceed silently.
 *
 * ── WHY THIS LIST IS SHORT ──────────────────────────────────────────────────
 * Interaction databases are graded on coverage, and coverage is the wrong
 * target for a screen that blocks a signature. Every false or over-broad
 * finding trains the provider to click through the real ones, so a screen with
 * thirty plausible findings and two solid ones is strictly worse than a screen
 * with two.
 *
 * Every finding below is one I can name a source for: a boxed warning, a
 * guideline recommendation, an approved label, or pharmacology that is not in
 * dispute. Where I could not, there is no finding — and where the RECORD cannot
 * answer a question the labelling requires an answer to (a family history Apex
 * does not store), the finding fires anyway as a `screening-gap` that a human
 * must attest to. "We cannot check this" is a finding. Rendering nothing and
 * letting it read as "checked, clear" is the failure.
 *
 * ── WHAT IS NOT COVERED, STATED OUT LOUD ────────────────────────────────────
 * See `SCREEN_COVERAGE`. Apex holds no external medication list, no allergy
 * list, and no problem list, so whole classes of genuine interaction — a GLP-1
 * alongside insulin or a sulfonylurea, testosterone alongside an anticoagulant
 * — cannot be screened here at all. That is rendered next to the results,
 * because a screen whose limits are invisible reads as a screen with none.
 */

export type InteractionSeverity = "contraindication" | "major" | "moderate" | "counsel";

export const SEVERITY_LABEL: Record<InteractionSeverity, string> = {
  contraindication: "Contraindication",
  major: "Major",
  moderate: "Moderate",
  counsel: "Counselling required",
};

export const SEVERITY_RANK: Record<InteractionSeverity, number> = {
  contraindication: 0,
  major: 1,
  moderate: 2,
  counsel: 3,
};

/**
 * Three kinds of finding, kept apart because they need different actions.
 *
 *  - "interaction"       — two agents on this member's protocol act on each
 *                          other. Resolvable by changing the protocol.
 *  - "contraindication"  — something in this member's record argues against the
 *                          agent. Resolvable by treating or documenting it.
 *  - "screening-gap"     — the labelling requires a fact Apex does not hold.
 *                          Only a human can close it, and only by asserting it.
 */
export type FindingKind = "interaction" | "contraindication" | "screening-gap";

export interface InteractionFinding {
  id: string;
  severity: InteractionSeverity;
  kind: FindingKind;
  title: string;
  /** Written to be read in ten seconds between patients. No jargon shortcuts. */
  plain: string;
  /**
   * Why this claim is true, and who says so. Rendered verbatim under the
   * finding — an assertion without its source is exactly the thing this
   * codebase refuses to ship.
   */
  basis: string;
  /** Values from THIS member's record that made it fire. Never generic. */
  evidence: { label: string; value: string }[];
  /** Must be acknowledged before a signature is accepted. */
  blocking: boolean;
  /** The record cannot answer this; the signer asserts it. */
  attestation?: string;
  /** Display names of the agents involved. */
  agents: string[];
}

// ---------------------------------------------------------------------------
// Agent registry
// ---------------------------------------------------------------------------

export type AgentClass =
  | "testosterone"
  | "glp1"
  | "aromatase-inhibitor"
  | "oestrogen"
  | "gonadotropin"
  | "melanocortin"
  | "peptide"
  | "other";

/**
 * Regulatory footing, because it decides how much can honestly be screened.
 *
 * An FDA-approved product has a label with an interactions section; a
 * compounded or unapproved one has neither, so the correct output for it is not
 * "no interactions found" but "no interaction data exists to search".
 */
export type ApprovalStatus = "fda-approved" | "compounded" | "not-approved";

export interface Agent {
  key: string;
  label: string;
  agentClass: AgentClass;
  approval: ApprovalStatus;
  /** Systemic route. Only used where route changes the pharmacology. */
  route: "oral" | "injection" | "nasal" | "infusion" | "topical";
  skus: string[];
  /** Lowercased substrings matched against recommendation candidate names. */
  candidateMatches: string[];
}

export const AGENTS: Agent[] = [
  {
    key: "testosterone",
    label: "Testosterone",
    agentClass: "testosterone",
    approval: "fda-approved",
    route: "injection",
    skus: ["HRT-TCYP-200", "PKG-TRT-START"],
    candidateMatches: ["testosterone"],
  },
  {
    key: "semaglutide",
    label: "Semaglutide",
    agentClass: "glp1",
    approval: "fda-approved",
    route: "injection",
    skus: ["GLP-SEMA-2.5", "GLP-SEMA-1.0", "PKG-METAB-90"],
    candidateMatches: ["semaglutide"],
  },
  {
    key: "tirzepatide",
    label: "Tirzepatide",
    agentClass: "glp1",
    approval: "fda-approved",
    route: "injection",
    skus: ["GLP-TIRZ-5"],
    candidateMatches: ["tirzepatide"],
  },
  {
    key: "retatrutide",
    label: "Retatrutide",
    agentClass: "glp1",
    approval: "not-approved",
    route: "injection",
    skus: ["GLP-RETA-10"],
    candidateMatches: ["retatrutide"],
  },
  {
    key: "tesofensine",
    label: "Tesofensine",
    agentClass: "other",
    approval: "not-approved",
    route: "oral",
    skus: ["WL-TESO-500"],
    candidateMatches: ["tesofensine"],
  },
  {
    key: "anastrozole",
    label: "Anastrozole",
    agentClass: "aromatase-inhibitor",
    approval: "fda-approved",
    route: "oral",
    skus: ["HRT-ANAS-1MG"],
    candidateMatches: ["anastrozole"],
  },
  {
    key: "estradiol",
    label: "Estradiol",
    agentClass: "oestrogen",
    approval: "fda-approved",
    route: "injection",
    skus: ["HRT-ESTR-0.1"],
    candidateMatches: ["estradiol"],
  },
  {
    key: "hcg",
    label: "hCG",
    agentClass: "gonadotropin",
    approval: "fda-approved",
    route: "injection",
    skus: ["HRT-HCG-5000"],
    candidateMatches: ["hcg"],
  },
  {
    key: "pt141",
    label: "PT-141 (bremelanotide)",
    agentClass: "melanocortin",
    approval: "fda-approved",
    route: "injection",
    skus: ["PEP-PT141-10"],
    candidateMatches: ["pt-141", "bremelanotide"],
  },
  {
    key: "melanotan",
    label: "Melanotan II",
    agentClass: "melanocortin",
    approval: "not-approved",
    route: "injection",
    skus: ["PEP-MELAN-10"],
    candidateMatches: ["melanotan"],
  },
  {
    key: "mk677",
    label: "Ibutamoren / MK-677",
    agentClass: "peptide",
    approval: "not-approved",
    route: "oral",
    skus: ["PEP-MK677-25"],
    candidateMatches: ["mk-677", "ibutamoren"],
  },
  {
    key: "bpc157",
    label: "BPC-157",
    agentClass: "peptide",
    approval: "compounded",
    route: "injection",
    skus: ["PEP-BPC-5MG"],
    candidateMatches: ["bpc-157"],
  },
  {
    key: "sermorelin",
    label: "Sermorelin",
    agentClass: "peptide",
    approval: "compounded",
    route: "injection",
    skus: ["PEP-SERM-15"],
    candidateMatches: ["sermorelin"],
  },
  {
    key: "ipamorelin",
    label: "Ipamorelin / CJC-1295",
    agentClass: "peptide",
    approval: "compounded",
    route: "injection",
    skus: ["PEP-IPACJC-10"],
    candidateMatches: ["ipamorelin", "cjc-1295"],
  },
  {
    key: "ghkcu",
    label: "GHK-Cu",
    agentClass: "peptide",
    approval: "compounded",
    route: "injection",
    skus: ["PEP-GHKCU-50"],
    candidateMatches: ["ghk-cu"],
  },
  {
    key: "vip",
    label: "VIP nasal spray",
    agentClass: "peptide",
    approval: "compounded",
    route: "nasal",
    skus: ["PEP-VIP-NS"],
    candidateMatches: ["vip"],
  },
];

export function agentForSku(sku: string): Agent | undefined {
  return AGENTS.find((a) => a.skus.includes(sku));
}

/**
 * Resolve a recommendation's free-text candidate name onto an agent.
 *
 * Substring matching, and deliberately conservative: a name that matches
 * nothing resolves to nothing and is reported as UNSCREENED rather than being
 * fuzzy-matched onto the nearest agent. The same reasoning as the lab-ingest
 * alias table — a wrong mapping is invisible, an unmapped row is on screen.
 */
export function agentForCandidateName(name: string): Agent | undefined {
  const n = name.toLowerCase();
  return AGENTS.find((a) => a.candidateMatches.some((m) => n.includes(m)));
}

// ---------------------------------------------------------------------------
// Record reads
// ---------------------------------------------------------------------------

function marker(clientId: string, key: string): Biomarker | undefined {
  return getLabsForClient(clientId)?.biomarkers.find((b) => b.key === key);
}

/** Active protocol agents already on file for this member. */
export function activeAgents(clientId: string): Agent[] {
  const out: Agent[] = [];
  for (const sub of subscriptionsForClient(clientId)) {
    if (sub.status !== "Active") continue;
    const a = agentForSku(sub.sku);
    if (a && !out.some((x) => x.key === a.key)) out.push(a);
  }
  return out;
}

function cardiovascularFlag(clientId: string): string | undefined {
  const c = getClient(clientId);
  return c?.riskFlags.find((f) =>
    /cardio|blood pressure|hypertens|cardiac|heart/i.test(`${f.label} ${f.detail}`),
  )?.detail;
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export interface ScreenResult {
  clientId: string;
  /** Agents this screen actually reasoned about. */
  screened: Agent[];
  /**
   * Proposed or active items that resolved to no known agent. Reported, never
   * dropped — an unscreened item that looks screened is the dangerous outcome.
   */
  unscreened: string[];
  findings: InteractionFinding[];
  /** Findings that must be acknowledged before a signature is accepted. */
  blocking: InteractionFinding[];
  /** Standing limitations of this screen. Always rendered with the results. */
  coverage: string[];
}

/**
 * What this screen structurally cannot see.
 *
 * Rendered next to every result. Apex is the system of record for what Apex
 * dispenses, and nothing else — no outside pharmacy fill, no allergy list, no
 * problem list. The genuine interactions below are ones I am confident are
 * real and that this build simply has no data to detect, so the honest move is
 * to name them rather than let a clean screen imply they were checked.
 */
export const SCREEN_COVERAGE: string[] = [
  "Apex holds no external medication list. Anything prescribed outside this clinic is invisible to this screen.",
  "GLP-1 agents alongside insulin or a sulfonylurea carry a well-documented hypoglycaemia risk requiring dose review. Apex cannot see those medicines, so it cannot raise it — ask.",
  "Testosterone alongside warfarin or another anticoagulant is documented as requiring closer INR monitoring. Apex holds no anticoagulant data.",
  "No allergy list and no problem list are held. Allergy and comorbidity screening is not performed here.",
  "Compounded and unapproved agents have no approved labelling, so there is no interactions section to search for them at all.",
];

/**
 * Screen a set of agents against one member's record.
 *
 * `proposed` are the agents under consideration right now; `active` are the
 * ones already on the protocol. Both are screened together because that is the
 * clinically meaningful question — a duplicate GLP-1 only exists as a finding
 * when you look at the proposal and the record at the same time.
 */
export function screenAgents(
  clientId: string,
  proposed: Agent[],
  unscreenedNames: string[] = [],
): ScreenResult {
  const active = activeAgents(clientId);
  const all: Agent[] = [];
  for (const a of [...proposed, ...active]) {
    if (!all.some((x) => x.key === a.key)) all.push(a);
  }

  const has = (key: string) => all.some((a) => a.key === key);
  const ofClass = (c: AgentClass) => all.filter((a) => a.agentClass === c);
  const findings: InteractionFinding[] = [];

  // --- Duplicate incretin therapy -----------------------------------------
  const glp1s = ofClass("glp1");
  if (glp1s.length > 1) {
    findings.push({
      id: "int.glp1.duplicate",
      severity: "contraindication",
      kind: "interaction",
      title: "Two GLP-1 receptor agonists at once",
      plain: `${glp1s.map((a) => a.label).join(" and ")} act on the same receptor. Running both is duplicate therapy — it compounds the gastrointestinal effects and the risk profile without a corresponding benefit, and no labelling supports concurrent use.`,
      basis:
        "Approved labelling for these agents does not support concurrent use with another GLP-1 receptor agonist; this is duplicate therapy within a single pharmacologic class.",
      evidence: glp1s.map((a) => ({ label: a.label, value: proposed.some((p) => p.key === a.key) ? "proposed now" : "active on protocol" })),
      blocking: true,
      agents: glp1s.map((a) => a.label),
    });
  }

  // --- Testosterone -------------------------------------------------------
  if (has("testosterone")) {
    const hct = marker(clientId, "hct");
    if (hct && hct.status === "high") {
      findings.push({
        id: "int.trt.erythrocytosis",
        severity: "contraindication",
        kind: "contraindication",
        title: "Haematocrit is above the lab's reference ceiling",
        plain:
          "Testosterone raises red cell mass. Starting or continuing therapy while the haematocrit already sits above the reporting range compounds the one adverse effect this therapy reliably causes.",
        basis:
          "The Endocrine Society Clinical Practice Guideline (2018) recommends against initiating testosterone in men with an elevated haematocrit, and treats 54% as the level at which erythrocytosis warrants evaluation. Apex quotes those figures; the band this finding fired on is the lab's own reference range, not a threshold Apex invented.",
        evidence: [
          { label: "Haematocrit", value: `${hct.value} ${hct.unit}` },
          { label: "Lab reference range", value: `${hct.refLow}–${hct.refHigh} ${hct.unit}` },
          { label: "Panel status", value: hct.status },
        ],
        blocking: true,
        agents: ["Testosterone"],
      });
    }

    const psa = marker(clientId, "psa");
    if (psa && psa.status === "high") {
      findings.push({
        id: "int.trt.psa",
        severity: "contraindication",
        kind: "contraindication",
        title: "PSA is above the lab's reference ceiling",
        plain:
          "Testosterone therapy is not thought to cause prostate cancer, but it can unmask one that is already present. An out-of-range PSA is a urological question to answer before therapy, not during it.",
        basis:
          "Endocrine Society (2018) and AUA (2018) both advise urological evaluation before initiating testosterone when PSA is above the screening threshold. The band this fired on is the lab's own reference range.",
        evidence: [
          { label: "PSA", value: `${psa.value} ${psa.unit}` },
          { label: "Lab reference range", value: `${psa.refLow}–${psa.refHigh} ${psa.unit}` },
        ],
        blocking: true,
        agents: ["Testosterone"],
      });
    }

    findings.push({
      id: "int.trt.fertility",
      severity: "major",
      kind: "screening-gap",
      title: "Fertility intent is not on file",
      plain:
        "Exogenous testosterone suppresses LH and FSH, and with them sperm production. For a member who wants children in the foreseeable future this is the decision, not a side note — and Apex holds no field that records whether the conversation happened.",
      basis:
        "Endocrine Society Clinical Practice Guideline (2018) recommends against testosterone therapy in men planning fertility in the near term; suppression of spermatogenesis via HPG-axis suppression is well established.",
      evidence: [
        { label: "Fertility intent on record", value: "not captured by Apex" },
        {
          label: "LH on panel",
          value: marker(clientId, "lh") ? `${marker(clientId, "lh")!.value} ${marker(clientId, "lh")!.unit}` : "not on file",
        },
      ],
      blocking: true,
      attestation:
        "I have discussed the effect of testosterone therapy on fertility with this member and documented their intent.",
      agents: ["Testosterone"],
    });
  }

  // --- GLP-1 --------------------------------------------------------------
  if (glp1s.some((a) => a.approval === "fda-approved")) {
    const approved = glp1s.filter((a) => a.approval === "fda-approved");
    findings.push({
      id: "int.glp1.mtc",
      severity: "contraindication",
      kind: "screening-gap",
      title: "Thyroid C-cell tumour history cannot be checked from the record",
      plain:
        "These agents carry a boxed warning and are contraindicated in anyone with a personal or family history of medullary thyroid carcinoma, or with MEN 2. Apex stores no family history, so this is not a check it can perform — somebody has to ask and record the answer.",
      basis:
        "Boxed warning on the approved labelling for semaglutide and tirzepatide: risk of thyroid C-cell tumours; contraindicated with a personal or family history of medullary thyroid carcinoma or Multiple Endocrine Neoplasia syndrome type 2.",
      evidence: [
        { label: "Agents", value: approved.map((a) => a.label).join(", ") },
        { label: "Family history in Apex", value: "not stored" },
      ],
      blocking: true,
      attestation:
        "I have asked about personal and family history of medullary thyroid carcinoma and MEN 2, and this member has neither.",
      agents: approved.map((a) => a.label),
    });

    findings.push({
      id: "int.glp1.pancreatitis",
      severity: "moderate",
      kind: "screening-gap",
      title: "Prior pancreatitis is not on file",
      plain:
        "The registration trials for these agents excluded people with a history of pancreatitis, and the labelling asks prescribers to watch for it. Apex holds no problem list, so a prior episode would be invisible here.",
      basis:
        "Approved labelling for semaglutide and tirzepatide warns on acute pancreatitis and advises against use in patients with a prior history; trial populations excluded them.",
      evidence: [
        { label: "Problem list in Apex", value: "not stored" },
        { label: "Agents", value: approved.map((a) => a.label).join(", ") },
      ],
      blocking: false,
      attestation: "I have asked about prior pancreatitis.",
      agents: approved.map((a) => a.label),
    });

    findings.push({
      id: "int.glp1.sedation",
      severity: "counsel",
      kind: "interaction",
      title: "Procedural sedation and anaesthesia planning",
      plain:
        "Because these agents slow gastric emptying, a member can still have food in the stomach after a standard fast. Anyone booked for a procedure under sedation needs their anaesthetist to know they are on this.",
      basis:
        "American Society of Anesthesiologists guidance (2023) on patients on GLP-1 receptor agonists undergoing elective procedures, on the basis of retained gastric contents and aspiration risk.",
      evidence: [{ label: "Agents", value: approved.map((a) => a.label).join(", ") }],
      blocking: false,
      agents: approved.map((a) => a.label),
    });

    // Delayed gastric emptying vs. concomitant oral agents.
    const orals = all.filter((a) => a.route === "oral");
    if (orals.length > 0) {
      findings.push({
        id: "int.glp1.oral-absorption",
        severity: "moderate",
        kind: "interaction",
        title: "Slowed gastric emptying alongside an oral agent",
        plain: `${approved.map((a) => a.label).join(", ")} delays gastric emptying, which can change how and when an oral medicine taken at the same time is absorbed. ${orals.map((a) => a.label).join(", ")} ${orals.length > 1 ? "are" : "is"} on this protocol by mouth.`,
        basis:
          "Approved labelling for these agents notes that the delay in gastric emptying has the potential to affect the absorption of concomitantly administered oral medicinal products.",
        evidence: [
          { label: "GLP-1 agent", value: approved.map((a) => a.label).join(", ") },
          { label: "Oral agent on protocol", value: orals.map((a) => a.label).join(", ") },
        ],
        blocking: false,
        agents: [...approved.map((a) => a.label), ...orals.map((a) => a.label)],
      });
    }
  }

  // --- Aromatase inhibitor ------------------------------------------------
  if (has("anastrozole")) {
    if (has("estradiol")) {
      findings.push({
        id: "int.ai.estradiol",
        severity: "contraindication",
        kind: "interaction",
        title: "Anastrozole and estradiol are pharmacologically opposed",
        plain:
          "Anastrozole works by blocking aromatase so that less oestradiol is made. Supplying oestradiol at the same time works directly against that. One of the two is not doing what it was prescribed to do.",
        basis:
          "Mechanistic and not in dispute: anastrozole is an aromatase inhibitor whose entire effect is the reduction of circulating oestradiol. Co-administration of an oestrogen antagonises it.",
        evidence: [
          { label: "Anastrozole", value: "on protocol" },
          { label: "Estradiol", value: "on protocol" },
        ],
        blocking: true,
        agents: ["Anastrozole", "Estradiol"],
      });
    }

    const male = getClient(clientId)?.sex === "male";
    if (male) {
      findings.push({
        id: "int.ai.male-bone",
        severity: "moderate",
        kind: "contraindication",
        title: "Aromatase inhibitor in a male member — off-label, with a bone consideration",
        plain:
          "Anastrozole is not approved for use in men. Oestradiol has a documented role in male bone health, so suppressing it is not a free action, and there is no published monitoring interval telling us how often to check for the consequence.",
        basis:
          "Anastrozole's approved indication is hormone-receptor-positive breast cancer in postmenopausal women; use in men is off-label. Reduction in bone mineral density under aromatase inhibition is well documented in that literature, and oestradiol's role in male skeletal maintenance is established.",
        evidence: [
          { label: "Member sex", value: "male" },
          { label: "Approved indication", value: "postmenopausal breast cancer — not this use" },
          { label: "Published monitoring interval", value: "none known — see the monitoring engine" },
        ],
        blocking: false,
        agents: ["Anastrozole"],
      });
    }
  }

  // --- Bremelanotide ------------------------------------------------------
  if (has("pt141")) {
    const cv = cardiovascularFlag(clientId);
    findings.push({
      id: "int.pt141.cardiovascular",
      severity: cv ? "major" : "counsel",
      kind: cv ? "contraindication" : "screening-gap",
      title: "Blood pressure and cardiovascular status before bremelanotide",
      plain:
        "Bremelanotide causes a transient rise in blood pressure and fall in heart rate after each dose. Its labelling contraindicates use in uncontrolled hypertension and known cardiovascular disease." +
        (cv ? " This member carries a cardiovascular risk flag." : " Apex holds no blood-pressure reading, so this cannot be confirmed from the record."),
      basis:
        "Approved labelling for bremelanotide: contraindicated in uncontrolled hypertension or known cardiovascular disease; transient increases in blood pressure and reductions in heart rate follow each dose.",
      evidence: [
        { label: "Cardiovascular risk flag", value: cv ?? "none on file" },
        { label: "Blood pressure in Apex", value: "not stored" },
      ],
      blocking: Boolean(cv),
      attestation:
        "I have confirmed this member has controlled blood pressure and no known cardiovascular disease.",
      agents: ["PT-141 (bremelanotide)"],
    });
  }

  // --- Unapproved agents: the screen itself is incomplete ------------------
  const unapproved = all.filter((a) => a.approval === "not-approved");
  if (unapproved.length > 0) {
    findings.push({
      id: "int.unapproved.no-labelling",
      severity: "major",
      kind: "screening-gap",
      title: "No approved labelling exists for this agent — the screen is incomplete",
      plain: `${unapproved.map((a) => a.label).join(", ")} ${unapproved.length > 1 ? "have" : "has"} no FDA approval, and therefore no approved label, no interactions section and no established safety profile to screen against. A clean result below does not mean there are no interactions; it means there is nothing to search.`,
      basis:
        "Regulatory status: these agents have no FDA marketing approval. Interaction screening depends on approved labelling and post-marketing data, neither of which exists here.",
      evidence: unapproved.map((a) => ({ label: a.label, value: "no FDA approval" })),
      blocking: true,
      attestation:
        "I understand no interaction data exists for this agent and I am taking responsibility for that gap.",
      agents: unapproved.map((a) => a.label),
    });
  }

  const compounded = all.filter((a) => a.approval === "compounded");
  if (compounded.length > 0) {
    findings.push({
      id: "int.compounded.limited-data",
      severity: "counsel",
      kind: "screening-gap",
      title: "Compounded agent — limited interaction data",
      plain: `${compounded.map((a) => a.label).join(", ")} ${compounded.length > 1 ? "are" : "is"} compounded rather than a licensed finished product. There is no manufacturer labelling behind it, so interaction information is thinner than it looks.`,
      basis:
        "Compounded preparations are not FDA-approved finished products and carry no approved labelling; interaction data comes from the literature on the substance rather than from a product label.",
      evidence: compounded.map((a) => ({ label: a.label, value: "compounded preparation" })),
      blocking: false,
      agents: compounded.map((a) => a.label),
    });
  }

  findings.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id),
  );

  return {
    clientId,
    screened: all,
    unscreened: unscreenedNames,
    findings,
    blocking: findings.filter((f) => f.blocking),
    coverage: SCREEN_COVERAGE,
  };
}

/**
 * Screen a recommendation at the point it is proposed or signed.
 *
 * Candidate names that resolve to no agent are surfaced as `unscreened` rather
 * than discarded. A coach reading "screen clear" over a proposal containing an
 * item the screen never looked at is precisely the false comfort this module
 * was written to remove — so the count of unscreened items renders next to the
 * findings, not behind them.
 */
/**
 * Screen results are memoised by recommendation id.
 *
 * The review queue asks for the same screen twice per row — once page-level, to
 * decide which recommendations must be excluded from a batch signature, and
 * once per card to render it — across a queue that can hold nine hundred rows.
 * The function is pure over seeded data, so caching is safe and it halves the
 * work on the heaviest screen in the app.
 *
 * Keyed on `rec.id` rather than on the object, because the queue re-derives
 * recommendation objects from the store on status changes; identity is not
 * stable but the id and the clinical inputs are.
 */
const screenCache = new Map<string, ScreenResult>();

export function screenRecommendation(rec: Recommendation): ScreenResult {
  const cached = screenCache.get(rec.id);
  if (cached) return cached;
  const result = computeRecommendationScreen(rec);
  screenCache.set(rec.id, result);
  return result;
}

function computeRecommendationScreen(rec: Recommendation): ScreenResult {
  const proposed: Agent[] = [];
  const unscreened: string[] = [];

  for (const candidate of rec.candidates) {
    // Services and consults are not agents and are not expected to resolve.
    if (candidate.kind === "service") continue;
    const agent = agentForCandidateName(candidate.name);
    if (agent) {
      if (!proposed.some((p) => p.key === agent.key)) proposed.push(agent);
    } else {
      unscreened.push(candidate.name);
    }
  }

  return screenAgents(rec.clientId, proposed, unscreened);
}

/** Screen everything a member is already on — used away from the proposal flow. */
export function screenActiveProtocol(clientId: string): ScreenResult {
  return screenAgents(clientId, []);
}

/** Provenance inputs for one finding. Shaped for `ProvenanceDrawer.inputs`. */
export function findingInputs(
  finding: InteractionFinding,
  result: ScreenResult,
): { label: string; value: string }[] {
  return [
    { label: "Finding", value: finding.id },
    { label: "Severity", value: SEVERITY_LABEL[finding.severity] },
    { label: "Kind", value: finding.kind },
    { label: "Agents", value: finding.agents.join(", ") },
    { label: "Blocking", value: finding.blocking ? "yes — signature gated" : "no" },
    { label: "Agents screened", value: result.screened.map((a) => a.label).join(", ") || "none" },
    { label: "Items not screened", value: result.unscreened.join(", ") || "none" },
    ...finding.evidence.map((e) => ({ label: e.label, value: e.value })),
  ];
}
