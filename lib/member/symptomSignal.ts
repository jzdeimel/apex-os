import type { Client, Biomarker } from "@/lib/types";
import {
  SYMPTOMS,
  addDays,
  journalFor,
  symptomMeta,
  type JournalEntry,
  type SymptomKey,
} from "@/lib/symptoms/journal";
import { getLabsForClient } from "@/lib/mock/labs";
import { staffMap } from "@/lib/mock/staff";
import type { LedgerDraft } from "@/lib/trace/ledger";

/**
 * SYMPTOM ↔ LAB — "you wrote it down, here is the number that sits next to it".
 *
 * The journal's problem is that logging is work and the payoff is invisible.
 * A member rates six things every morning for three weeks and the app says
 * nothing back; on week four they stop. This module is the payoff: what you
 * logged, on the left; the relevant number already on your own panel, on the
 * right; and the name of the person whose job it is to join them up.
 *
 * ══ WHAT THIS FILE IS FORBIDDEN TO DO ═════════════════════════════════════
 *
 * It must never diagnose, never assert causation, and never tell a member that
 * a value is fine or not fine. Concretely, that rules out four things this kind
 * of feature reaches for by default:
 *
 *  1. NO MECHANISM. Nothing here says low ferritin causes tiredness, or that
 *     thyroid "explains" brain fog. The pairing below is a ROUTING table, not a
 *     causal one — see MARKERS_FOR.
 *  2. NO VERDICT. `BiomarkerStatus` ("optimal" / "low" / "high") is deliberately
 *     not carried on `RelatedMarker` and is not readable from anything this
 *     module returns. The value, the unit, the lab's own printed range and the
 *     date are all shown, because those are on the member's results already and
 *     hiding them would read as evasion — but the sentence that grades them is
 *     a clinician's to say, and there is no field here to put it in.
 *  3. NO CONCLUSION FROM THIN DATA. `MIN_ENTRIES` days of logging inside the
 *     window before anything is paired at all, and `MIN_LOW_DAYS` before a
 *     symptom is considered to be standing out. Under either floor the module
 *     returns a "not yet" result that names exactly what is missing.
 *  4. NO WALL. Two signals maximum. A member handed six pairings reads a
 *     differential diagnosis of themselves at 6am.
 *
 * Every signal carries `notAConclusion` and `bringThis`; there is no path
 * through this module that produces a pairing without both. The test for any
 * string added here is the one from lib/symptoms/journal.ts: could a member
 * screenshot it and read it as their clinic telling them what is wrong with
 * them? If yes, rewrite it.
 */

const NOW_DATE = "2026-06-12";

/**
 * How far back a "recently" claim reaches.
 *
 * A month rather than a fortnight, and the longer window is the *safer* choice
 * rather than the looser one. Two weeks of a 1–5 self-rating is few enough
 * points that one rough week dominates it, so a fortnight-scoped card swings
 * between "nothing to see" and "eight bad days" on the strength of a single
 * bad stretch. Thirty days is also the span a member can actually speak to at
 * a visit — "the last month" is a sentence people say; "the last fourteen
 * days" is a sentence an app says.
 */
export const WINDOW_DAYS = 30;

/**
 * Days that must be logged inside the window before anything is paired.
 *
 * Two thirds of the month, not three days of it. A member who logged three bad
 * days and nothing else has told us about three bad days, not about a month —
 * and "you logged low energy on 3 of the last 3 days" is a true sentence that
 * reads as a far stronger claim than the data behind it supports.
 */
export const MIN_ENTRIES = 20;

/** Days at the low end before a symptom is treated as standing out. */
export const MIN_LOW_DAYS = 4;

/** Most pairings shown at once. See rule 4 above. */
const MAX_SIGNALS = 2;

/** Most numbers shown against one symptom. */
const MAX_MARKERS = 3;

// ---------------------------------------------------------------------------
// Which of the member's own results to put next to which symptom
// ---------------------------------------------------------------------------

/**
 * READ THIS AS A ROUTING TABLE, NOT A CLINICAL ONE.
 *
 * It does not encode a claim that any marker below explains any symptom above.
 * It encodes something much narrower and entirely defensible: which numbers
 * *already on this member's panel* a clinician is most likely to want in front
 * of them when the member opens with "I've been wiped out for two weeks". The
 * output is a shortlist for a conversation, and the alternative — showing all
 * twenty-nine markers, or none — is worse in both directions.
 *
 * Two deliberate omissions, because a routing table that guesses is a clinical
 * table wearing a disguise:
 *
 *  - `sleepQuality` maps to nothing. Sleep sits downstream of most of the
 *    panel and there is no shortlist here that is honestly *more* relevant
 *    than the rest of it, so the module says it has no panel it routinely
 *    lines up against sleep and routes the member to their coach instead.
 *  - Nothing maps to lipids, organ or prostate markers. A member who logs a
 *    low mood should not be handed their ApoB; the association would be
 *    invented by this file rather than reported by it.
 *
 * Keys are `Biomarker.key` from lib/mock/labs.ts. Markers the member's panel
 * does not carry are dropped rather than substituted.
 */
const MARKERS_FOR: Record<SymptomKey, string[]> = {
  energy: ["ferritin", "tsh", "ft3", "vitd", "b12"],
  brainFog: ["tsh", "ft3", "ft4", "b12"],
  libido: ["total_t", "free_t", "shbg", "estradiol"],
  jointPain: ["hscrp", "crp"],
  mood: ["vitd", "tsh", "b12"],
  sleepQuality: [],
};

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/**
 * One number off the member's panel.
 *
 * Note what is absent: no `status`, no band, no adjective. See rule 2.
 */
export interface RelatedMarker {
  key: string;
  name: string;
  value: number;
  unit: string;
  /** The lab's own printed reference range, shown without comment. */
  refLow: number;
  refHigh: number;
  panelName: string;
  resultedOn: string;
}

export interface SymptomSignal {
  id: string;
  symptom: SymptomKey;
  label: string;
  /** What the member logged, in their own numbers. No adjective attached. */
  logged: string;
  lowDays: number;
  daysLogged: number;
  windowDays: number;
  markers: RelatedMarker[];
  /** Why these numbers and not others. Stated so the shortlist is inspectable. */
  whyTheseMarkers: string;
  /** The hedge. Always present, always rendered. */
  notAConclusion: string;
  /** The sentence the member is meant to leave with. */
  bringThis: string;
}

export type SymptomSignalGap =
  /** Not enough days logged inside the window to say anything. */
  | { ok: false; reason: "not-enough-entries"; daysLogged: number; needed: number; windowDays: number; message: string }
  /** No panel on file to line anything up against. */
  | { ok: false; reason: "no-labs"; message: string }
  /** Plenty of logging, nothing at the low end. That is worth saying out loud. */
  | { ok: false; reason: "nothing-standing-out"; daysLogged: number; windowDays: number; message: string };

export type SymptomSignalResult =
  | { ok: true; signals: SymptomSignal[]; daysLogged: number; windowDays: number }
  | SymptomSignalGap;

/**
 * The disclaimer, rendered at body size above the cards rather than tucked into
 * a tooltip — same rule the journal's correlation section follows.
 */
export const SIGNAL_DISCLAIMER =
  "This puts two things side by side: what you wrote down, and a number that was already on your panel. It is not a finding and it is not a link — we are not saying one of these caused the other, and we are not going to tell you whether a number is good or bad. That is a conversation, and your provider is the one to have it with.";

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

/** Entries inside the window, oldest first. */
function windowEntries(clientId: string): JournalEntry[] {
  const cutoff = addDays(NOW_DATE, -(WINDOW_DAYS - 1));
  return journalFor(clientId).filter((e) => e.date >= cutoff && e.date <= NOW_DATE);
}

/**
 * A day at the bad end of the member's own scale.
 *
 * The cut is the neutral midpoint, not an arbitrary threshold: every scale in
 * SYMPTOMS labels 3 as the "fine either way" rating ("Okay", "Even", "Normal
 * for me", "Noticeable"). So "below the middle" means literally what the member
 * was looking at when they tapped it, which is the only definition this file
 * can defend — anything tighter would be us deciding how bad a day has to be
 * before it counts, and that is not ours to decide.
 *
 * Two of the six symptoms are inverted (joint pain, brain fog), so this reads
 * `higherIsBetter` rather than hard-coding a direction. Getting it backwards
 * would tell a member they had logged a month of pain when they had logged a
 * month of none.
 */
function isLowDay(entry: JournalEntry, symptom: SymptomKey): boolean {
  const score = entry.scores[symptom];
  return symptomMeta[symptom].higherIsBetter ? score < 3 : score > 3;
}

function markersOnPanel(biomarkers: Biomarker[], keys: string[]): RelatedMarker[] {
  const byKey = new Map(biomarkers.map((b) => [b.key, b]));
  const out: RelatedMarker[] = [];
  for (const key of keys) {
    const b = byKey.get(key);
    if (!b) continue; // Not on this member's panel — dropped, never substituted.
    out.push({
      key: b.key,
      name: b.name,
      value: b.value,
      unit: b.unit,
      refLow: b.refLow,
      refHigh: b.refHigh,
      panelName: "",
      resultedOn: "",
    });
    if (out.length === MAX_MARKERS) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export function symptomSignals(client: Client): SymptomSignalResult {
  const entries = windowEntries(client.id);
  const daysLogged = entries.length;

  if (daysLogged < MIN_ENTRIES) {
    const needed = MIN_ENTRIES - daysLogged;
    return {
      ok: false,
      reason: "not-enough-entries",
      daysLogged,
      needed,
      windowDays: WINDOW_DAYS,
      message: `You've logged ${daysLogged} of the last ${WINDOW_DAYS} days. We wait until ${MIN_ENTRIES} before lining your log up against anything on your panel — ${needed} more day${
        needed === 1 ? "" : "s"
      } and this section starts working. Fewer than that and one rough week reads as a pattern when it is just a rough week.`,
    };
  }

  const labs = getLabsForClient(client.id);
  if (!labs || labs.biomarkers.length === 0) {
    return {
      ok: false,
      reason: "no-labs",
      message:
        "You've logged enough for this to be useful, but there's no panel on file yet to put next to it. Once your first results land, what you've been writing down starts earning its keep.",
    };
  }

  const provider = staffMap[client.providerId];
  const coach = staffMap[client.coachId];

  const candidates: SymptomSignal[] = [];

  for (const meta of SYMPTOMS) {
    const lowDays = entries.filter((e) => isLowDay(e, meta.key)).length;
    if (lowDays < MIN_LOW_DAYS) continue;

    const markers = markersOnPanel(labs.biomarkers, MARKERS_FOR[meta.key]).map((m) => ({
      ...m,
      panelName: labs.panelName,
      resultedOn: labs.resultedOn,
    }));

    const listed = markers.map((m) => m.name);
    const markerPhrase =
      listed.length > 1
        ? `${listed.slice(0, -1).join(", ")} and ${listed[listed.length - 1]}`
        : listed[0];

    candidates.push({
      id: `sig-${client.id}-${meta.key}`,
      symptom: meta.key,
      label: meta.label,
      logged: `You logged ${daysLogged} of the last ${WINDOW_DAYS} days. On ${lowDays} of them you rated your ${meta.label.toLowerCase()} ${
        meta.higherIsBetter ? "below" : "above"
      } the middle of the scale.`,
      lowDays,
      daysLogged,
      windowDays: WINDOW_DAYS,
      markers,
      whyTheseMarkers: markers.length
        ? `${markerPhrase} ${
            markers.length === 1 ? "is a result" : "are results"
          } already on your ${labs.panelName} that ${
            provider?.name ?? "your provider"
          } would usually want in front of them when someone raises this. Showing ${
            markers.length === 1 ? "it" : "them"
          } here saves you both looking ${markers.length === 1 ? "it" : "them"} up.`
        : `We don't have a panel we routinely read alongside this one, so there's no number to put next to it. That doesn't make what you logged less worth raising — tell ${
            coach?.name ?? "your coach"
          } anyway.`,
      notAConclusion:
        "Two things on the same screen, nothing more. What you logged did not come from this number and this number did not come from what you logged — and neither of us can tell from here whether they have anything to do with each other.",
      bringThis: `Take this to ${
        provider?.name ?? "your provider"
      }: "I rated my ${meta.label.toLowerCase()} ${
        meta.higherIsBetter ? "below" : "above"
      } the middle of the scale on ${lowDays} days in the last month — is there anything on my panel worth looking at alongside that?" That is the whole question, and they are the one who can answer it.`,
    });
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "nothing-standing-out",
      daysLogged,
      windowDays: WINDOW_DAYS,
      message: `You logged ${daysLogged} of the last ${WINDOW_DAYS} days, and nothing sat below the middle of the scale often enough for us to raise it. That is not us telling you nothing is wrong — it is us having nothing to point at. Keep logging; the month this changes is the month it matters.`,
    };
  }

  // Most-logged first. Ties broken on the symptom's fixed order so the list is
  // stable across renders rather than shuffling under the member.
  const order = SYMPTOMS.map((s) => s.key);
  return {
    ok: true,
    daysLogged,
    windowDays: WINDOW_DAYS,
    signals: candidates
      .sort((a, b) => b.lowDays - a.lowDays || order.indexOf(a.symptom) - order.indexOf(b.symptom))
      .slice(0, MAX_SIGNALS),
  };
}

/**
 * The ledger event for a member routing one of these to their provider.
 *
 * This is the affordance that makes the safety rule real rather than editorial.
 * The module refuses to interpret; the button hands the observation to someone
 * who can. Recorded as a `create`/`note` because that is what it becomes on the
 * clinical side — an item on the provider's list with the member's own numbers
 * attached, not a message that has to be re-typed from memory at the visit.
 */
export function flagForProviderEvent(client: Client, signal: SymptomSignal): LedgerDraft {
  return {
    actorId: client.id,
    actorName: `${client.firstName} ${client.lastName}`,
    actorRole: "Client",
    action: "create",
    entity: "note",
    entityId: signal.id,
    subjectId: client.id,
    subjectName: `${client.firstName} ${client.lastName}`,
    locationId: client.locationId,
    reason: "Member sent a journal observation to their provider for review",
    after: {
      symptom: signal.label,
      lowDays: signal.lowDays,
      daysLogged: signal.daysLogged,
      windowDays: signal.windowDays,
      markers: signal.markers.map((m) => `${m.name} ${m.value} ${m.unit}`),
      interpretation: "none — routed to provider",
    },
  };
}
