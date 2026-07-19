import { getClient, clientName } from "@/lib/mock/clients";
import { latestConsult, consultsForClient } from "@/lib/mock/consults";
import { escalations } from "@/lib/mock/escalations";
import { ordersForClient } from "@/lib/mock/orders";
import { contactLogForClient, lastInboundFor, daysSinceTouch } from "@/lib/mock/contactLog";
import { getLabsForClient } from "@/lib/mock/labs";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { alphaScore } from "@/lib/alphaScore";
import { buildDailyPlan } from "@/lib/daily/today";
import { staffName } from "@/lib/mock/staff";
import { formatDate, relativeDays } from "@/lib/utils";

/**
 * Visit prep — the two minutes before a coach walks into the room.
 *
 * This is the one AI surface here that is COACH-FACING, and the difference
 * matters. The member-facing files in this directory are constrained by what a
 * member can safely read alone; this one is constrained by something else
 * entirely: whether it saves the coach any time.
 *
 * ── Why generic prep sheets get ignored ──────────────────────────────────
 * "Review labs. Discuss adherence. Confirm goals." Every coach already knows
 * that, so the sheet gets skimmed once and never opened again — and then the
 * consult opens with "so, how've you been?", which is the question that tells
 * the member nobody read their file.
 *
 * So every line below has to be *unfalsifiably specific to this member*. The
 * strongest source is what they said last time, in their own words: the consult
 * summarizer already extracts action items and escalations with the exact
 * quote they came from (`ExtractedItem.sourceQuote`), so a question here can be
 * "last time you said weekend doses were getting missed — how did that go?"
 * That question cannot be asked of anybody else, and it is the entire point.
 *
 * ── Provenance ───────────────────────────────────────────────────────────
 * Every item carries `basis`: the record it was derived from. A coach who is
 * about to repeat a line to a member's face needs to be able to check it in one
 * click, and anything that can't name its source doesn't get generated.
 *
 * Deterministic. Pinned clock, seeded fixtures, no wall time.
 */

const NOW = "2026-06-12T09:00:00";

export type PrepTone = "good" | "watch" | "neutral";

export interface PrepItem {
  id: string;
  text: string;
  /** The record this came from — shown as the small print under the line. */
  basis: string;
  tone: PrepTone;
}

export interface VisitPrep {
  clientId: string;
  clientName: string;
  /** Date of the last consult, or undefined if this is the first. */
  since?: string;
  sinceLabel: string;
  /** Who ran that consult — the coach may not be the same person. */
  sinceWith?: string;
  whatChanged: PrepItem[];
  whatToAsk: PrepItem[];
  whatToWatch: PrepItem[];
  winsToMention: PrepItem[];
  openLoops: PrepItem[];
  /** True when there is genuinely nothing new — say so rather than padding. */
  quiet: boolean;
}

const after = (iso: string | undefined, since: string | undefined) =>
  !!iso && (!since || iso > since);

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

/** Trim a member quote to something a coach can read aloud without stumbling. */
function quote(raw: string, max = 120): string {
  const clean = raw.trim().replace(/\s+/g, " ");
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function prepFor(clientId: string): VisitPrep | null {
  const client = getClient(clientId);
  if (!client) return null;

  const last = latestConsult(clientId);
  const since = last?.startedAt;

  const whatChanged: PrepItem[] = [];
  const whatToAsk: PrepItem[] = [];
  const whatToWatch: PrepItem[] = [];
  const winsToMention: PrepItem[] = [];
  const openLoops: PrepItem[] = [];

  // ── What they committed to last time ────────────────────────────────────
  // Highest-value source in the file. These are the member's own words, already
  // extracted with their source quote, so the follow-up question is theirs too.
  const summary = last?.finalSummary ?? last?.aiSummary;
  if (last && summary) {
    for (const [i, item] of summary.actionItems.slice(0, 4).entries()) {
      whatToAsk.push({
        id: `ask-action-${i}`,
        text: `Last time you said "${quote(item.sourceQuote)}" — how did that go?`,
        basis: `${last.kind} on ${formatDate(last.startedAt)}, action item ${i + 1}`,
        tone: "neutral",
      });
    }
    for (const [i, esc] of summary.escalations.slice(0, 2).entries()) {
      openLoops.push({
        id: `loop-consult-esc-${i}`,
        text: `Flagged for the provider in your last note: "${quote(esc.sourceQuote)}". Confirm it landed before they ask you about it.`,
        basis: `${last.kind} on ${formatDate(last.startedAt)}, escalation extracted from your notes`,
        tone: "watch",
      });
    }
    if (summary.symptomsRaised.length) {
      whatToAsk.push({
        id: "ask-symptoms",
        text: `They raised ${summary.symptomsRaised.slice(0, 3).join(", ").toLowerCase()} last time — better, worse or the same?`,
        basis: `Symptoms extracted from the ${formatDate(last.startedAt)} consult`,
        tone: "neutral",
      });
    }
  }

  // ── Labs since ──────────────────────────────────────────────────────────
  const labs = getLabsForClient(clientId);
  if (labs && after(labs.resultedOn, since?.slice(0, 10))) {
    const off = labs.biomarkers.filter((b) => b.status === "low" || b.status === "high");
    const watch = labs.biomarkers.filter((b) => b.status === "watch");
    whatChanged.push({
      id: "chg-labs",
      text: `New panel resulted ${formatDate(labs.resultedOn)} — ${off.length} out of range, ${watch.length} sub-optimal. They may have already seen it in the portal.`,
      basis: `${labs.panelName}, collected ${formatDate(labs.collectedOn)}`,
      tone: off.length ? "watch" : "good",
    });
    if (off.length) {
      whatToWatch.push({
        id: "watch-labs",
        text: `Out of range: ${off.slice(0, 4).map((b) => `${b.name} ${b.value}${b.unit ? " " + b.unit : ""}`).join(", ")}. Interpretation is the provider's — don't get pulled into it.`,
        basis: `${labs.panelName}, ${formatDate(labs.resultedOn)}`,
        tone: "watch",
      });
    }
    whatToAsk.push({
      id: "ask-labs",
      text: `Have you had a look at the new results? Anything on there you want to go through?`,
      basis: `Panel resulted ${formatDate(labs.resultedOn)} and is visible in their portal`,
      tone: "neutral",
    });
  }

  // ── Body composition movement ───────────────────────────────────────────
  const scan = getScanForClient(clientId);
  const scanHistory = scan?.history ?? [];
  if (scan && scanHistory.length >= 2) {
    const first = scanHistory[0];
    const prev = scanHistory[scanHistory.length - 2];
    const now = scanHistory[scanHistory.length - 1];
    const bfDelta = Math.round((now.bodyFatPct - prev.bodyFatPct) * 10) / 10;
    const leanDelta = Math.round((now.skeletalMuscleKg - prev.skeletalMuscleKg) * 10) / 10;

    if (Math.abs(bfDelta) >= 0.3 || Math.abs(leanDelta) >= 0.3) {
      whatChanged.push({
        id: "chg-scan",
        text: `Since the ${formatDate(prev.date)} scan: body fat ${bfDelta <= 0 ? "down" : "up"} ${Math.abs(bfDelta)}%, lean mass ${leanDelta >= 0 ? "up" : "down"} ${Math.abs(leanDelta)} kg.`,
        basis: `${scan.device}, scanned ${formatDate(scan.scannedOn)}`,
        tone: bfDelta <= 0 && leanDelta >= 0 ? "good" : "watch",
      });
    }
    // Losing fat AND muscle together is the one body-comp pattern a coach must
    // catch in the room, because the scale is telling the member it's working.
    if (bfDelta < 0 && leanDelta <= -0.4) {
      whatToWatch.push({
        id: "watch-lean",
        text: `They're down ${Math.abs(bfDelta)}% body fat but also ${Math.abs(leanDelta)} kg of lean mass. Protein and training volume first — the scale looks great to them right now.`,
        basis: `Scan trend ${formatDate(prev.date)} → ${formatDate(now.date)}`,
        tone: "watch",
      });
    }
    const totalDrop = Math.round((first.bodyFatPct - now.bodyFatPct) * 10) / 10;
    if (totalDrop >= 2) {
      winsToMention.push({
        id: "win-bf",
        text: `Down ${totalDrop}% body fat since their first scan on ${formatDate(first.date)}. Measured, not estimated — worth saying out loud.`,
        basis: `Scan history, ${formatDate(first.date)} → ${formatDate(now.date)}`,
        tone: "good",
      });
    }
    const leanTotal = Math.round((now.skeletalMuscleKg - first.skeletalMuscleKg) * 10) / 10;
    if (leanTotal >= 0.8) {
      winsToMention.push({
        id: "win-lean",
        text: `+${leanTotal} kg skeletal muscle since baseline while losing fat. That's the hard part and most members don't know they did it.`,
        basis: `Scan history, ${formatDate(first.date)} → ${formatDate(now.date)}`,
        tone: "good",
      });
    }
  }

  // ── Alpha Score movement ────────────────────────────────────────────────
  const score = alphaScore(client);
  if (score.hasLabs && score.trend.length >= 2) {
    const delta = score.score - score.trend[0].value;
    if (Math.abs(delta) >= 4) {
      const item: PrepItem = {
        id: "chg-score",
        text: `Alpha Score ${delta > 0 ? "up" : "down"} ${Math.abs(delta)} points since January, now ${score.score} (${score.label}).`,
        basis: "Alpha Score trend, computed from their panel and scan",
        tone: delta > 0 ? "good" : "watch",
      };
      whatChanged.push(item);
      if (delta > 0) winsToMention.push({ ...item, id: "win-score" });
    }
  }

  // ── Adherence ───────────────────────────────────────────────────────────
  const daily = buildDailyPlan(client, NOW);
  const openRings = daily.rings.filter((r) => r.progress < 1);
  if (daily.streak.current >= 7) {
    winsToMention.push({
      id: "win-streak",
      text: `${daily.streak.current}-day streak, best is ${daily.streak.best}. Name the number — they've been counting.`,
      basis: "Daily ring history",
      tone: "good",
    });
  }
  const fuel = daily.rings.find((r) => r.id === "fuel");
  if (fuel && fuel.progress < 0.8) {
    whatToAsk.push({
      id: "ask-protein",
      text: `Protein is the ring they're missing — ${fuel.done}g against a ${fuel.target}g target today. What does a normal weekday of eating actually look like?`,
      basis: "Fuel ring, today",
      tone: "watch",
    });
  }
  const held = daily.doses.filter((d) => d.heldReason);
  if (held.length) {
    openLoops.push({
      id: "loop-held",
      text: `${held.length} protocol item${held.length === 1 ? " is" : "s are"} on a provider hold. Confirm they know why — a silent hold reads as "it stopped working".`,
      basis: "Today's protocol schedule",
      tone: "watch",
    });
  }

  // ── Escalations ─────────────────────────────────────────────────────────
  const mine = escalations.filter((e) => e.clientId === clientId);
  for (const e of mine) {
    const open = e.status !== "Closed";
    if (open) {
      openLoops.push({
        id: `loop-esc-${e.id}`,
        text:
          e.status === "Answered"
            ? `${e.priority} ${e.kind.toLowerCase()} has been answered but not closed with them — that answer is yours to deliver today.`
            // The priority word is dropped when the kind already carries it —
            // "Urgent urgent symptom" is how a coach learns to stop reading.
            : `${e.kind}${
                e.kind.toLowerCase().includes(e.priority.toLowerCase()) ? "" : ` (${e.priority})`
              } raised ${relativeDays(e.raisedAt).toLowerCase()}, still ${e.status.toLowerCase()}. If they ask, you can say it's with ${staffName(e.assignedToStaffId)}.`,
        basis: `Escalation ${e.id}, raised ${formatDate(e.raisedAt)}`,
        tone: "watch",
      });
      if (e.priority === "Urgent") {
        whatToWatch.push({
          id: `watch-esc-${e.id}`,
          text: `Open urgent escalation: "${quote(e.question, 140)}"`,
          basis: `Escalation ${e.id}, ${formatDate(e.raisedAt)}`,
          tone: "watch",
        });
      }
    } else if (e.answeredAt && after(e.answeredAt, since)) {
      whatChanged.push({
        id: `chg-esc-${e.id}`,
        text: `${staffName(e.answeredByStaffId ?? e.assignedToStaffId)} answered their ${e.kind.toLowerCase()} on ${formatDate(e.answeredAt)}.`,
        basis: `Escalation ${e.id}`,
        tone: "good",
      });
    }
  }

  // ── Orders ──────────────────────────────────────────────────────────────
  for (const o of ordersForClient(clientId).filter((x) => x.visibleToClient)) {
    if (o.delayed && o.status !== "Delivered" && o.status !== "Cancelled") {
      openLoops.push({
        id: `loop-order-${o.id}`,
        text: `Order ${o.id} is delayed${o.delayReason ? ` — ${o.delayReason.toLowerCase()}` : ""}. Get to it before they do; a member who raises a late order first has already lost some trust.`,
        basis: `Order ${o.id}, last movement ${formatDate(o.lastActivity ?? o.placedAt)}`,
        tone: "watch",
      });
    } else if (after(o.placedAt, since)) {
      whatChanged.push({
        id: `chg-order-${o.id}`,
        text: `New order since you last spoke: ${o.lines.map((l) => l.name).slice(0, 3).join(", ")} — currently ${o.status}.`,
        basis: `Order ${o.id}, placed ${formatDate(o.placedAt)}`,
        tone: "neutral",
      });
    }
  }

  // ── Messages ────────────────────────────────────────────────────────────
  const inbound = lastInboundFor(clientId);
  if (inbound) {
    const replied = contactLogForClient(clientId).some(
      (c) => c.direction === "outbound" && c.at > inbound.at,
    );
    if (!replied) {
      openLoops.push({
        id: "loop-inbound",
        text: `Their last message hasn't been answered: "${quote(inbound.body, 140)}"`,
        basis: `Inbound ${inbound.channel}, ${formatDate(inbound.at)}`,
        tone: "watch",
      });
    }
  }
  const gap = daysSinceTouch(clientId);
  if (gap >= 21) {
    whatToWatch.push({
      id: "watch-gap",
      text: `${gap} days since any contact. Open by acknowledging the gap rather than hoping they haven't noticed.`,
      basis: "Contact log",
      tone: "watch",
    });
  }

  // ── Risk flags ──────────────────────────────────────────────────────────
  for (const [i, f] of client.riskFlags.entries()) {
    whatToWatch.push({
      id: `watch-risk-${i}`,
      text: `${f.label} flag (${f.level}): ${f.detail} Clinical read stays with the provider.`,
      basis: "Client risk flags",
      tone: "watch",
    });
  }

  // ── Goals, when there is nothing sharper to ask ─────────────────────────
  if (whatToAsk.length < 3 && client.goals.length) {
    whatToAsk.push({
      id: "ask-goals",
      text: `They joined for ${client.goals.join(", ").toLowerCase()}. Which of those has actually moved for them — in how they feel, not what the chart says?`,
      basis: `Goals recorded at intake, ${formatDate(client.joinedOn)}`,
      tone: "neutral",
    });
  }
  if (!last) {
    whatToAsk.push({
      id: "ask-first",
      text: `First consult on record — no history to follow up on. Get the baseline: sleep, a normal day of eating, training, alcohol, stress.`,
      basis: `No prior consult; member since ${formatDate(client.joinedOn)}`,
      tone: "neutral",
    });
  }

  const sinceLabel = last
    ? `${daysBetween(NOW, last.startedAt)} days since your last ${last.kind.toLowerCase()} on ${formatDate(last.startedAt)}`
    : `No prior consult — member since ${formatDate(client.joinedOn)}`;

  return {
    clientId,
    clientName: clientName(client),
    since,
    sinceLabel,
    sinceWith: last ? staffName(last.authorId) : undefined,
    whatChanged: dedupe(whatChanged),
    whatToAsk: dedupe(whatToAsk).slice(0, 6),
    whatToWatch: dedupe(whatToWatch),
    winsToMention: dedupe(winsToMention).slice(0, 3),
    openLoops: dedupe(openLoops),
    // "Nothing has changed" is a useful, honest answer. Padding the sheet to
    // look busy is how a coach learns to stop reading it.
    quiet: whatChanged.length === 0 && openLoops.length === 0,
  };
}

function dedupe(items: PrepItem[]): PrepItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Consult count — used by the header to say how far back the record goes. */
export function consultDepth(clientId: string): number {
  return consultsForClient(clientId).length;
}
