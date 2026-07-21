import type { Client } from "@/lib/types";
import { getClient } from "@/lib/mock/clients";
import { biomarker } from "@/lib/mock/labs";

/**
 * Women's health — HRT & menopause decision support.
 *
 * Half of Alpha Health's clinic is women, and the men's testosterone tooling
 * does not serve them: a woman in perimenopause is not a low-T man, her hormones
 * move differently, her ranges are different, and the levers — estradiol,
 * progesterone, low-dose testosterone, symptom timing — are different. This is
 * the surface that treats her as herself.
 *
 * SAME DISCIPLINE AS THE MALE TITRATION ASSISTANT
 * -----------------------------------------------
 * Decision SUPPORT only. It stages where she is (pre / peri / post menopause)
 * from FSH and age, lays out her hormone picture against female ranges, and
 * surfaces the HRT levers a provider may weigh — always framed as "consider /
 * discuss", never an order, never a dose. The one hard clinical rule it does
 * enforce as a flag is endometrial protection: unopposed estrogen in a woman
 * with an intact uterus is a real risk, so if estrogen is on the table the need
 * for progesterone is stated, not left implied.
 */

const HORMONE_CATEGORY = "Hormone optimization discussion";

function onHormonePathway(c: Client): boolean {
  return c.programs.some((p) => p.category === HORMONE_CATEGORY);
}

export type MenopauseStage = "premenopausal" | "perimenopause" | "menopausal" | "postmenopausal" | "indeterminate";
export type Position = "below" | "optimal" | "above-optimal" | "above-ref";

export interface WHMarker {
  key: string;
  name: string;
  value: number;
  unit: string;
  optimalLow: number;
  optimalHigh: number;
  refLow: number;
  refHigh: number;
  position: Position;
  note: string;
}

export interface WHConsideration {
  kind: "estrogen" | "progesterone" | "testosterone" | "monitor" | "lifestyle";
  headline: string;
  rationale: string[];
}

export interface WomensHealthView {
  applicable: boolean;
  reason?: string;
  stage: { stage: MenopauseStage; label: string; detail: string } | null;
  markers: WHMarker[];
  considerations: WHConsideration[];
  disclaimer: string;
}

const MARKER_KEYS = ["estradiol", "progesterone", "fsh", "total_t", "free_t", "shbg"];

function positionOf(v: number, optLo: number, optHi: number, refHi: number): Position {
  if (v > refHi) return "above-ref";
  if (v > optHi) return "above-optimal";
  if (v < optLo) return "below";
  return "optimal";
}

/**
 * Stage from FSH + age. No cycle-diary data exists here, so this is the honest
 * biochemical read, framed as a stage to CONFIRM clinically, not a diagnosis.
 * FSH rises as ovarian reserve falls: persistently elevated FSH with low
 * estradiol is the menopausal signature.
 */
function stageFor(client: Client, fsh: number | null, estradiol: number | null): WomensHealthView["stage"] {
  const age = client.age;
  if (fsh == null) {
    return { stage: "indeterminate", label: "Stage not yet clear", detail: "No FSH on file — the marker that stages the transition. A cycle history and a repeat FSH settle it." };
  }
  const lowE2 = estradiol != null && estradiol < 30;
  if (fsh >= 30 && lowE2) {
    return {
      stage: age >= 51 ? "postmenopausal" : "menopausal",
      label: age >= 51 ? "Postmenopausal (biochemical)" : "Menopausal transition",
      detail: `FSH ${fsh} with low estradiol is the menopausal signature. Confirm 12 months without a period before calling it postmenopause.`,
    };
  }
  if (fsh >= 15) {
    return {
      stage: "perimenopause",
      label: "Perimenopause",
      detail: `FSH ${fsh} is rising and variable — the perimenopausal pattern. Symptoms often lead the labs here, so treat the woman, not just the number.`,
    };
  }
  return {
    stage: "premenopausal",
    label: "Premenopausal pattern",
    detail: `FSH ${fsh} is in the premenopausal range. Symptoms may still be hormonal — cycle timing of the draw matters.`,
  };
}

function scoreMarker(clientId: string, key: string): WHMarker | null {
  const b = biomarker(clientId, key);
  if (!b) return null;
  const optimalLow = b.optimalLow ?? b.refLow;
  const optimalHigh = b.optimalHigh ?? b.refHigh;
  const position = positionOf(b.value, optimalLow, optimalHigh, b.refHigh);
  const notes: Record<string, string> = {
    estradiol: position === "below" ? "Low — the driver of hot flushes, sleep disruption and bone loss." : "Within the target window for symptom control.",
    progesterone: position === "below" ? "Low — relevant to sleep, mood and, on estrogen, endometrial protection." : "Adequate.",
    fsh: b.value >= 30 ? "Elevated — consistent with menopausal transition." : b.value >= 15 ? "Rising — perimenopausal pattern." : "Premenopausal range.",
    total_t: position === "below" ? "Low-normal — may bear on libido, energy and mood in women." : "Within female range.",
    free_t: position === "below" ? "Low — the fraction that matters for symptoms." : "Within female range.",
    shbg: position === "above-optimal" || position === "above-ref" ? "High — binds testosterone, can lower the free fraction." : "Within range.",
  };
  return {
    key,
    name: b.name,
    value: b.value,
    unit: b.unit,
    optimalLow,
    optimalHigh,
    refLow: b.refLow,
    refHigh: b.refHigh,
    position,
    note: notes[key] ?? "",
  };
}

export function womensHealthView(clientId: string): WomensHealthView {
  const client = getClient(clientId);
  const disclaimer =
    "Decision support only. Stage and levers to weigh with the patient — the treating provider decides and signs. Individualize; the lowest effective dose for symptom control is the goal.";

  if (!client) {
    return { applicable: false, reason: "No client on file.", stage: null, markers: [], considerations: [], disclaimer };
  }
  if (client.sex !== "female") {
    return { applicable: false, reason: "This surface is women's HRT and menopause management.", stage: null, markers: [], considerations: [], disclaimer };
  }

  const fshB = biomarker(clientId, "fsh");
  const e2B = biomarker(clientId, "estradiol");
  const hasHormoneLabs = !!(fshB || e2B);
  if (!onHormonePathway(client) && !hasHormoneLabs) {
    return {
      applicable: false,
      reason: "No hormone-optimization program or hormone panel on file for this member yet.",
      stage: null,
      markers: [],
      considerations: [],
      disclaimer,
    };
  }

  const markers = MARKER_KEYS.map((k) => scoreMarker(clientId, k)).filter(Boolean) as WHMarker[];
  const byKey = Object.fromEntries(markers.map((m) => [m.key, m]));
  const stage = stageFor(client, fshB?.value ?? null, e2B?.value ?? null);

  const considerations: WHConsideration[] = [];
  const e2 = byKey["estradiol"];
  const prog = byKey["progesterone"];
  const testo = byKey["total_t"] ?? byKey["free_t"];

  // 1) Estrogen replacement — the central lever for a symptomatic low-E2 woman.
  if (e2 && e2.position === "below") {
    considerations.push({
      kind: "estrogen",
      headline: "Estradiol is low — estrogen replacement is the central lever",
      rationale: [
        "Low estradiol drives the classic burden — vasomotor symptoms (hot flushes, night sweats), disrupted sleep, mood and vaginal/urogenital change — and, longer term, bone loss.",
        "Transdermal estradiol (patch/gel) is generally preferred over oral: it avoids first-pass liver effects and carries a lower VTE signal. Start low, titrate to symptom control.",
        "Timing matters: for most symptomatic women the benefit-risk of HRT is favourable when started near the menopausal transition rather than years after.",
      ],
    });
  }

  // 2) Endometrial protection — the hard rule.
  if ((e2 && e2.position === "below") || onHormonePathway(client)) {
    considerations.push({
      kind: "progesterone",
      headline: "If estrogen is used and the uterus is intact, progesterone is not optional",
      rationale: [
        "Unopposed estrogen in a woman with a uterus raises endometrial cancer risk. Progesterone (micronised is well tolerated) protects the endometrium.",
        prog && prog.position === "below" ? "Progesterone reads low here, which also bears on sleep and mood — a reason to consider it beyond protection alone." : "Confirm uterine status; a woman post-hysterectomy may take estrogen alone.",
        "This is the one place the assistant states a requirement, not a suggestion: estrogen + intact uterus ⇒ add progesterone.",
      ],
    });
  }

  // 3) Testosterone for women — libido/energy, low-dose, individualized.
  if (testo && testo.position === "below") {
    considerations.push({
      kind: "testosterone",
      headline: "Low testosterone may be contributing to low libido and energy",
      rationale: [
        "Testosterone in women is real and low-normal here. The best evidence is for HSDD (distressing low libido); energy and mood are individual.",
        "Dosing is a fraction of a man's — a woman's physiologic range — and is titrated to a mid-normal female level, never a male one. Overshooting causes acne, hair changes and voice effects.",
        "This is an adjunct to estrogen/progesterone, considered once the core picture is settled.",
      ],
    });
  }

  // 4) Perimenopause — symptoms lead the labs.
  if (stage?.stage === "perimenopause") {
    considerations.push({
      kind: "monitor",
      headline: "Perimenopause — treat symptoms even when labs look 'normal'",
      rationale: [
        "In perimenopause hormones swing week to week, so a single panel can look reassuring while the woman is struggling. The symptom pattern is the better guide.",
        "Cyclical or low-dose HRT, cycle regulation, and sleep/mood support are all on the table; the plan is revisited as the picture declares itself.",
      ],
    });
  }

  return { applicable: true, stage, markers, considerations, disclaimer };
}
