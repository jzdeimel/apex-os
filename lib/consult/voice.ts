import { sha256 } from "@/lib/trace/hash";
import { seededRandom, clamp } from "@/lib/utils";
import {
  SEGMENT_CONFIDENCE_FLOOR,
  timecode,
  type SpeakerRole,
} from "@/lib/azure/speech";

/**
 * VOICE CONSULT — the dictation side of the scribe.
 *
 * The claim this module exists to make good on: **the contract does not change
 * when the medium does.** A coach who talks and a coach who types both end up
 * at the same place — raw source retained verbatim, a summary derived from it,
 * every extracted item citing a character offset into that source, one human
 * signature over both. `lib/consult/summarize.ts` is not modified, extended, or
 * special-cased for speech. It takes a string. This module produces a string.
 * That is the entire integration, and it is deliberate: the moment the spoken
 * path needs its own summarizer, the two paths start drifting and only one of
 * them stays defensible.
 *
 * WHAT THIS IS
 *   A deterministic demo of live dictation. No microphone is opened, no audio
 *   is captured, and `navigator.mediaDevices` is never touched — a scripted
 *   consult is released segment by segment on a timer so the UI can render a
 *   transcript building in real time. `lib/azure/speech.ts` models the real
 *   Azure AI Speech call (batch, whole-file); this models the *streaming* shape
 *   that a coach actually experiences, which is a different UI problem.
 *
 * WHAT WOULD HAVE TO CHANGE TO MAKE IT REAL
 *   Replace `startDictation` with a Speech SDK `SpeechRecognizer` on a
 *   continuous-recognition websocket, push `recognizing` events as interim text
 *   and `recognized` events as final segments, and map `e.result` onto
 *   `VoiceSegment`. Everything downstream of `transcriptToNotes` — the
 *   summarizer, the offset mapping, the signature, the ledger row — is already
 *   correct and does not move. See the speech.ts header for the consent,
 *   BAA and Custom Speech vocabulary work that gates any of it.
 *
 * WHY THE MEMBER'S OWN WORDS ARE KEPT AND ATTRIBUTED
 *   This is the part that is easy to get wrong and expensive to have gotten
 *   wrong. "I got dizzy standing up a couple times this week" spoken by the
 *   member is a **symptom report** — first-hand evidence, in the member's own
 *   framing, with their own hedges and qualifiers intact. The same content
 *   written into a note by staff as "member reports intermittent orthostatic
 *   dizziness" is **hearsay**: it is a clinician's reading of what they think
 *   they heard, and it has already lost the two things a reviewer needs — the
 *   member's actual words and the fact that a translation step occurred. The
 *   translation may also be wrong, and once it is in the chart as a paraphrase
 *   nobody can tell.
 *
 *   So: speaker attribution is not formatting. It is what makes an assertion in
 *   the summary checkable, because an extracted item's offset resolves through
 *   `segmentForOffset` to a specific speaker at a specific timecode. "The member
 *   said this" becomes verifiable rather than assumed, and — the direction that
 *   actually bites — a care-team instruction can never be silently attributed to
 *   the member, or the member's report to a clinician.
 *
 * RETENTION
 *   The transcript is retained alongside the summary, permanently, exactly as
 *   raw typed notes are (lib/consult/types.ts: `rawNotes` is immutable and is
 *   never thrown away). A spoken consult's transcript IS its rawNotes and
 *   inherits the rule without amendment. The summary is derived; the transcript
 *   is the source; you never discard the source. Discarding the *audio* after
 *   transcription is correct and separate — audio is biometric-adjacent and
 *   rarely re-listened to — but a system holding only the polished summary
 *   cannot answer "did a person actually say this, or did the model invent it?",
 *   which is the first question anyone asks.
 */

export const VOICE_ENGINE = "apex-voice-fixture-1.0 (DEMO — no microphone, no Azure call)";

/** Below this a segment is surfaced for correction before signing. */
export const VOICE_CONFIDENCE_FLOOR = SEGMENT_CONFIDENCE_FLOOR;

export { timecode };
export type { SpeakerRole };

/**
 * How a speaker is stamped into the note text.
 *
 * Uppercase and colon-terminated so it is unmistakably a label rather than
 * something a speaker said, and so it survives copy/paste into any other system
 * without needing our markup to carry the meaning.
 */
export const SPEAKER_PREFIX: Record<SpeakerRole, string> = {
  coach: "COACH:",
  member: "MEMBER:",
  provider: "PROVIDER:",
  unknown: "UNATTRIBUTED:",
};

export interface VoiceSegment {
  /** Stable across re-renders — safe as a React key and as an offset join key. */
  id: string;
  index: number;
  /** Resolved role. Never inferred from turn order; see speech.ts. */
  speaker: SpeakerRole;
  /** The diarizer's own label, retained so the mapping can be corrected later. */
  rawSpeakerLabel: string;
  text: string;
  /** Real-time position in the conversation, in ms from the start of recording. */
  startMs: number;
  endMs: number;
  confidence: number;
  /**
   * Wall-clock delay before this segment appears in the UI, in ms.
   *
   * Compressed by DEMO_PACE against the real speaking duration — a faithful
   * replay of a four-minute consult is a four-minute demo. The transcript's own
   * `startMs`/`endMs` are NOT compressed, so the timecodes shown next to each
   * line remain the honest conversation timeline.
   */
  arriveAfterMs: number;
}

export interface DictationSession {
  consultId: string;
  /** Opaque handle. Never a path, never a URL, never audio. */
  audioRef: string;
  segments: VoiceSegment[];
  locale: string;
  engine: string;
  startedAt: string;
  /** Literal `true`. This build has no other value it could take. */
  demo: true;
}

export interface StoppedDictation {
  session: DictationSession;
  /** Only what was actually delivered — stopping early truncates honestly. */
  segments: VoiceSegment[];
  /** The rawNotes equivalent. What the summarizer consumes and what we retain. */
  text: string;
  /** Binds a summary's ProvenanceStamp.inputHash to this exact transcript. */
  textHash: string;
  durationMs: number;
  /** Surfaced for coach correction, never silently accepted. */
  lowConfidence: VoiceSegment[];
  stoppedAt: string;
}

// ---------------------------------------------------------------------------
// The script
// ---------------------------------------------------------------------------

/**
 * A coach check-in, written the way people actually talk rather than the way
 * notes get written afterwards: sentence fragments, a self-correction mid-
 * sentence, a number said out loud, an aside that has nothing to do with the
 * clinical picture, and one thing the coach correctly refuses to handle alone.
 *
 * CLINICAL SAFETY: this script contains no dose, no frequency, no route and no
 * lab value. Every number in it is a member-reported measurement or a calendar
 * interval. The coach's protocol line deliberately says "your current protocol"
 * rather than naming an agent and amount — a fabricated dose rendered in a
 * demo screenshot is indistinguishable from a real one, and we shipped exactly
 * that once and pulled it.
 */
const SCRIPT: Array<{ speaker: SpeakerRole; text: string }> = [
  { speaker: "coach", text: "Okay. Recording." },
  { speaker: "coach", text: "So how have the last four weeks actually felt?" },
  {
    speaker: "member",
    text: "Better, mostly. Mornings are good now. It's the afternoon that still gets me.",
  },
  { speaker: "coach", text: "Still the three o'clock thing?" },
  {
    speaker: "member",
    text: "Yeah, around three. Not as bad as it was but it's there.",
  },
  {
    speaker: "coach",
    text: "Scale said 214.4 lbs this morning, down 3.2 from last month.",
  },
  {
    speaker: "coach",
    text: "And you're on week ten — sorry, week twelve. Twelve.",
  },
  { speaker: "coach", text: "Sleep?" },
  {
    speaker: "member",
    text: "Sleep is the problem. I fall asleep fine, I'm just up two or three times a night.",
  },
  {
    speaker: "member",
    text: "My wife has me doing the 6am gym thing now, which I hate, but by nine at night I'm tired.",
  },
  {
    speaker: "member",
    text: "One thing — I got dizzy standing up too fast a couple of times this week. Probably nothing.",
  },
  {
    speaker: "coach",
    text: "Okay, I'm not going to guess on that one. That's above my scope so I'll flag it for the provider before we change anything.",
  },
  {
    speaker: "coach",
    text: "We're not touching your current protocol until that's been reviewed.",
  },
  {
    speaker: "member",
    text: "That's fine. I'd honestly rather have it checked.",
  },
  {
    speaker: "coach",
    text: "I'll add nutrition coaching for the sleep piece and rebook you in four weeks.",
  },
  { speaker: "member", text: "Works for me." },
];

/** Rough speaking rate. Produces plausible, strictly monotonic timings. */
const MS_PER_CHAR = 58;
/** Pause between turns — long enough to read as conversation, not dictation. */
const GAP_MS = 380;
/** UI delivery is compressed against real speech. See VoiceSegment.arriveAfterMs. */
const DEMO_PACE = 0.2;
/** Floor so a two-word segment still lands as a discrete, visible event. */
const MIN_ARRIVE_MS = 260;

/** Tokens where real ASR genuinely loses confidence: numbers and clinical terms. */
const HARD_TOKEN = /\d|lbs|protocol|dizzy|scope|provider|nutrition/i;

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/**
 * Begin a dictation session.
 *
 * Returns the whole scripted transcript up front with per-segment arrival
 * delays; the UI is responsible for releasing them on a timer. Building the
 * data synchronously and letting the view own the clock keeps this module pure
 * and testable — the alternative, an EventEmitter or a generator holding
 * timers, makes the transcript unreproducible and drags timing into a module
 * that has no business owning it.
 *
 * Deterministic: same `consultId`, same transcript, same confidences, forever.
 * The seed perturbs only confidence, so the low-confidence review path is
 * sometimes exercised rather than always empty.
 */
export function startDictation(
  consultId: string,
  opts: { locale?: string; at?: string } = {},
): DictationSession {
  const rand = seededRandom(`apex-voice:${consultId}`);

  // Diarization labels are assigned in order of first appearance; mapping them
  // to a role is ours to do explicitly, because guessing is how a member's
  // words end up attributed to a clinician for the life of the record.
  const label: Record<SpeakerRole, string> = {
    coach: "Guest-1",
    member: "Guest-2",
    provider: "Guest-3",
    unknown: "Guest-0",
  };

  const segments: VoiceSegment[] = [];
  let cursor = 0;

  SCRIPT.forEach((line, index) => {
    const spokenMs = Math.max(900, line.text.length * MS_PER_CHAR);
    const confidence =
      Math.round(
        clamp(0.97 - (HARD_TOKEN.test(line.text) ? 0.12 : 0) - rand() * 0.06, 0.6, 0.99) * 1000,
      ) / 1000;

    segments.push({
      id: `${consultId}-seg-${String(index).padStart(2, "0")}`,
      index,
      speaker: line.speaker,
      rawSpeakerLabel: label[line.speaker],
      text: line.text,
      startMs: cursor,
      endMs: cursor + spokenMs,
      confidence,
      arriveAfterMs: Math.max(MIN_ARRIVE_MS, Math.round((spokenMs + GAP_MS) * DEMO_PACE)),
    });

    cursor += spokenMs + GAP_MS;
  });

  return {
    consultId,
    audioRef: `demo://consult/${consultId}`,
    segments,
    locale: opts.locale ?? "en-US",
    engine: VOICE_ENGINE,
    startedAt: opts.at ?? DICTATION_NOW,
    demo: true,
  };
}

/**
 * End a dictation session over whatever was actually delivered.
 *
 * Takes `delivered` rather than reading the full session because stopping early
 * must truncate honestly: a coach who stops at segment six has a six-segment
 * transcript, not a sixteen-segment one that quietly includes words nobody
 * heard them say.
 */
export function stopDictation(
  session: DictationSession,
  delivered: VoiceSegment[],
  opts: { at?: string } = {},
): StoppedDictation {
  const text = transcriptToNotes(delivered);
  return {
    session,
    segments: delivered,
    text,
    textHash: sha256(text),
    durationMs: delivered.length ? delivered[delivered.length - 1].endMs : 0,
    lowConfidence: delivered.filter((s) => s.confidence < VOICE_CONFIDENCE_FLOOR),
    stoppedAt: opts.at ?? DICTATION_NOW,
  };
}

/** Pinned demo clock, matching every other timestamp in Apex. */
const DICTATION_NOW = "2026-06-12T09:00:00";

// ---------------------------------------------------------------------------
// Transcript → notes
// ---------------------------------------------------------------------------

/**
 * Render delivered segments as the raw note text the summarizer consumes.
 *
 * One segment per line, each prefixed with its speaker. Two reasons for the
 * line-per-segment shape specifically:
 *
 *   1. `summarize.ts::segment()` splits on newlines before it splits on
 *      sentence punctuation, so a turn boundary is always also a fragment
 *      boundary. A coach's commitment and a member's report can never be
 *      merged into one extracted item.
 *   2. The prefix travels with the words. Anyone reading this note in a year —
 *      in Apex, in a PDF, or pasted into an email — can still tell who said
 *      what, without needing our UI to tell them.
 *
 * Note that a multi-sentence turn still gets split *within* the line by the
 * summarizer, so an extracted item's `sourceQuote` may not carry the prefix
 * itself. That is what `segmentForOffset` is for: the offset always resolves
 * back to the owning speaker, so attribution survives the split even when the
 * quoted substring does not contain it.
 */
export function transcriptToNotes(segments: VoiceSegment[]): string {
  return segments.map((s) => `${SPEAKER_PREFIX[s.speaker]} ${s.text}`).join("\n");
}

/** Where one segment's line lives inside the string `transcriptToNotes` built. */
export interface NoteSpan {
  segmentId: string;
  index: number;
  /** Offset of the speaker prefix — the start of the whole line. */
  start: number;
  /** Offset of the first spoken character, past the prefix. */
  textStart: number;
  end: number;
}

/**
 * Compute line offsets for the same segments, in the same order.
 *
 * Derived by walking the identical construction `transcriptToNotes` uses rather
 * than by searching the output for each line: a member can legitimately say the
 * same short sentence twice ("Works for me."), and a search would resolve the
 * second one to the first one's speaker and timecode. Offsets are the only
 * unambiguous answer, which is exactly why `ExtractedItem` carries one.
 */
export function noteSpans(segments: VoiceSegment[]): NoteSpan[] {
  const spans: NoteSpan[] = [];
  let cursor = 0;

  for (const s of segments) {
    const prefix = SPEAKER_PREFIX[s.speaker];
    const line = `${prefix} ${s.text}`;
    spans.push({
      segmentId: s.id,
      index: s.index,
      start: cursor,
      textStart: cursor + prefix.length + 1,
      end: cursor + line.length,
    });
    cursor += line.length + 1; // the joining newline
  }

  return spans;
}

/**
 * Resolve a character offset in the note text back to the segment that produced
 * it — the join that lets the UI say "the member said this, 2:14 in".
 *
 * This is the same provenance contract the typed composer has, surviving a
 * change of medium. An extracted item cites an offset; the offset carries a
 * speaker and a timecode; therefore every assertion in the summary can be
 * traced to a person and a moment rather than to a wall of text.
 */
export function segmentForOffset(
  segments: VoiceSegment[],
  offset: number,
): VoiceSegment | undefined {
  const spans = noteSpans(segments);
  const hit = spans.find((sp) => offset >= sp.start && offset <= sp.end);
  return hit ? segments.find((s) => s.id === hit.segmentId) : undefined;
}

/** Everything one speaker said — the input to "what did the member report?". */
export function segmentsBySpeaker(
  segments: VoiceSegment[],
  speaker: SpeakerRole,
): VoiceSegment[] {
  return segments.filter((s) => s.speaker === speaker);
}

/**
 * Retention policy, stated in code so it is reviewable rather than assumed.
 * Mirrors SPEECH_RETENTION_POLICY — the spoken path inherits the typed path's
 * rules, it does not get its own.
 */
export const VOICE_RETENTION_POLICY = {
  /** Audio is never captured in this build, and is discarded in production. */
  audioRetainedAfterTranscription: false,
  /** The transcript is permanent. It is the rawNotes of a spoken consult. */
  transcriptRetained: true,
  /** Speaker attribution is retained verbatim, never flattened into prose. */
  speakerAttributionRetained: true,
  /** Recording a clinical conversation requires per-session member consent. */
  requiresPerSessionConsent: true,
} as const;
