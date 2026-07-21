import type { Client } from "@/lib/types";
import { getClient } from "@/lib/mock/clients";
import { biomarker } from "@/lib/mock/labs";

/**
 * Sexual health — a named service line at Alpha Health, for men and women.
 *
 * It is the reason many men walk in the door and the thing many women were never
 * offered, and it is almost never JUST one hormone — it sits at the intersection
 * of testosterone, estradiol, thyroid, cardiovascular health, sleep, mood and
 * medication. So this reads the whole picture and lays out the levers, sex-
 * appropriately, as decision support. The provider decides and prescribes.
 *
 * HONESTY
 * -------
 * There is no validated questionnaire captured in the seed, so this does not
 * fabricate a SHIM or FSFI score. It works from what IS on file — the symptoms
 * the member reported at intake and their hormone labs — and is explicit that a
 * proper assessment is a conversation, not a number this surface invented.
 */

export interface SHConsideration {
  headline: string;
  detail: string;
}

export interface SexualHealthView {
  applicable: boolean;
  reason?: string;
  concern: string; // the presenting concern, plainly
  drivers: { label: string; value: string; note: string }[]; // contributing factors from labs/history
  considerations: SHConsideration[];
  disclaimer: string;
}

const LIBIDO_SYMPTOMS = ["Low libido", "Erectile dysfunction", "Low sex drive", "Reduced libido"];

function hasLibidoConcern(c: Client): boolean {
  return c.symptoms.some((s) => LIBIDO_SYMPTOMS.some((k) => s.toLowerCase().includes(k.toLowerCase().split(" ")[0])));
}

function marker(clientId: string, key: string) {
  const b = biomarker(clientId, key);
  if (!b) return null;
  const optLo = b.optimalLow ?? b.refLow;
  const optHi = b.optimalHigh ?? b.refHigh;
  return { name: b.name, value: b.value, unit: b.unit, low: b.value < optLo, high: b.value > optHi };
}

export function sexualHealthView(clientId: string): SexualHealthView {
  const client = getClient(clientId);
  const disclaimer =
    "Decision support only. Sexual health is a clinical conversation — this lays out the contributing factors and the options; the provider assesses and decides.";

  if (!client) return { applicable: false, reason: "No client on file.", concern: "", drivers: [], considerations: [], disclaimer };

  const male = client.sex === "male";
  const concern = hasLibidoConcern(client)
    ? male
      ? "Low libido / erectile dysfunction reported"
      : "Low libido / low desire reported"
    : "";

  // Shared drivers worth reading before reaching for a script.
  const drivers: SexualHealthView["drivers"] = [];
  const testo = marker(clientId, male ? "total_t" : "total_t");
  const e2 = marker(clientId, "estradiol");
  const thyroid = marker(clientId, "tsh");
  const prolactin = marker(clientId, "prolactin");
  if (testo) drivers.push({ label: testo.name, value: `${testo.value} ${testo.unit}`, note: testo.low ? "Low — a common, treatable driver." : "Within range." });
  if (e2) drivers.push({ label: "Estradiol", value: `${e2.value} ${e2.unit}`, note: male ? (e2.high ? "High E2 in men can blunt libido." : e2.low ? "Low E2 also hurts libido — it isn't 'lower is better'." : "Balanced.") : (e2.low ? "Low estradiol drives GSM and low desire." : "Adequate.") });
  if (thyroid) drivers.push({ label: "TSH", value: `${thyroid.value} ${thyroid.unit}`, note: thyroid.high ? "Hypothyroid symptoms overlap with low libido — worth correcting." : "Within range." });
  if (prolactin) drivers.push({ label: "Prolactin", value: `${prolactin.value} ${prolactin.unit}`, note: prolactin.high ? "Elevated prolactin suppresses libido — investigate before treating." : "Normal." });

  const considerations: SHConsideration[] = [];

  if (male) {
    considerations.push(
      { headline: "Optimize the hormones first", detail: "Bring testosterone into range and keep estradiol balanced (not crashed) — for many men this alone restores libido and function, and it is the foundation any other therapy builds on." },
      { headline: "PDE5 inhibitors for erectile function", detail: "Tadalafil (daily low-dose or on-demand) or sildenafil address the mechanical side. Daily tadalafil also helps some men with confidence and spontaneity. Screen cardiovascular status and nitrate use first." },
      { headline: "PT-141 (bremelanotide) for desire", detail: "Works centrally on desire rather than blood flow — an option when the issue is drive, not erection, or as an adjunct. On-demand, subcutaneous." },
      { headline: "Rule out the reversible", detail: "Sleep apnoea, SSRIs, alcohol, cardiovascular disease and relationship/psychological factors are common and treatable — a script for the symptom that ignores these underperforms." },
    );
  } else {
    considerations.push(
      { headline: "Address the hormonal foundation", detail: "In women, low desire often tracks low testosterone and, around menopause, low estradiol. Correcting these — with the endometrial-protection rule for estrogen — is the first lever." },
      { headline: "Low-dose testosterone for HSDD", detail: "The best evidence for testosterone in women is for distressing low desire (HSDD). Dosed to a mid-normal FEMALE level, never a male one, and monitored for androgenic effects." },
      { headline: "Local estrogen for GSM", detail: "Genitourinary symptoms — dryness, discomfort — respond to vaginal estrogen, which is low-systemic-exposure and can be used alongside or instead of systemic HRT." },
      { headline: "PT-141 and the whole picture", detail: "Bremelanotide works centrally on desire for premenopausal HSDD. As in men, mood, medication (SSRIs), sleep and relationship factors are part of the assessment, not a footnote." },
    );
  }

  if (!concern && drivers.every((d) => !/Low|High|Elevated|hurts|blunt|drives|suppress/.test(d.note))) {
    return {
      applicable: false,
      reason: "No sexual-health concern on file and no contributing lab pattern. Surfaces when a member raises it or the hormone picture suggests it.",
      concern: "",
      drivers,
      considerations: [],
      disclaimer,
    };
  }

  return {
    applicable: true,
    concern: concern || (male ? "Sexual-health review (hormone pattern suggests it)" : "Sexual-health review"),
    drivers,
    considerations,
    disclaimer,
  };
}
