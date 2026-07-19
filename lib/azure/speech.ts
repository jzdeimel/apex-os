import { sha256 } from "@/lib/trace/hash";
import { seededRandom, clamp } from "@/lib/utils";
import { adapterFail, adapterOk, AZURE_NOW, type AdapterResult } from "@/lib/azure/types";

/**
 * AZURE AI SPEECH — consult dictation.
 *
 * WHAT THE REAL SERVICE DOES
 *   Speech to Text, in two modes Apex would use differently:
 *     · Fast transcription / batch — a finished audio file in, a full transcript
 *       out, with per-phrase offsets, durations, confidence, and *diarization*
 *       (speaker separation) into "Guest-1", "Guest-2".
 *     · Real-time — a websocket stream producing interim then final phrases, for
 *       a coach who wants the note forming as they talk.
 *   Custom Speech lets you adapt the acoustic/language model with a domain
 *   phrase list, which matters here more than it sounds: "sermorelin",
 *   "tirzepatide" and "BPC-157" are not in a general model's vocabulary and come
 *   back as plausible-looking nonsense.
 *
 * WHAT THIS FILE DOES INSTEAD
 *   Returns a deterministic transcript from a fixture script, seeded by the
 *   audio reference string. No microphone is opened, no audio is captured,
 *   uploaded, or stored. `audioRef` is an opaque handle, not a file — this
 *   module cannot read one.
 *
 * WHAT WOULD HAVE TO CHANGE TO MAKE IT REAL
 *   1. Provision a Speech resource in the tenant (BAA-covered) and a Custom
 *      Speech endpoint with the Alpha Health protocol phrase list.
 *   2. Capture audio in the browser with explicit, per-session member consent —
 *      recording a clinical conversation without it is a separate legal problem
 *      from HIPAA and North Carolina is one-party consent, which is a floor and
 *      not a policy.
 *   3. Upload to Blob Storage, submit a batch transcription job, poll, and map
 *      `recognizedPhrases[]` onto `TranscriptSegment` — `offsetMilliseconds`,
 *      `durationMilliseconds`, `speaker` and `confidence` map directly.
 *   4. Persist the transcript as its own column and never overwrite it.
 *
 * WHY DIARIZATION IS NOT COSMETIC
 *   A consult transcript without speaker labels is a wall of text in which
 *   "I think we should stop the anastrozole" is unattributable. Whether the
 *   member said that or the coach said it is the difference between a member
 *   report and a care-team instruction, and it changes what the provider does
 *   next. Diarization is also what makes the transcript usable as evidence for
 *   the summary: an extracted action item cites a span, and the span carries who
 *   was talking, so "the member asked for X" can be checked rather than assumed.
 *   Speaker mapping is done explicitly here — `Guest-1` is not automatically the
 *   coach — because guessing the mapping is how you attribute a member's words
 *   to a clinician in the permanent record.
 *
 * WHY THE TRANSCRIPT MUST BE RETAINED ALONGSIDE THE SUMMARY
 *   lib/consult/types.ts already holds the rule: `rawNotes` is immutable and is
 *   never thrown away, because a system that keeps only the polished output
 *   cannot answer "did a person actually say this, or did the model invent it?".
 *   A transcript is rawNotes for a spoken consult, and it inherits the rule
 *   without amendment. Discarding audio after transcription is right — audio is
 *   biometric-adjacent, expensive to store and rarely re-listened to — but
 *   discarding the *transcript* and keeping the summary would leave every
 *   AI-derived assertion in that note permanently unverifiable. The summary is
 *   derived; the transcript is the source. You keep the source.
 */

export type SpeakerRole = "coach" | "member" | "provider" | "unknown";

export interface TranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
  /** Resolved role, not the raw "Guest-N" label. See the header. */
  speaker: SpeakerRole;
  /** The service's own diarization label, retained for re-mapping later. */
  rawSpeakerLabel: string;
  confidence: number;
}

export interface Transcript {
  /** Opaque handle. Never a path, never a URL, never audio. */
  audioRef: string;
  /** Concatenated segments — the `rawNotes` equivalent for a spoken consult. */
  text: string;
  segments: TranscriptSegment[];
  durationMs: number;
  locale: string;
  /** Stamped so a transcript can be reproduced or re-run on a better model. */
  engine: string;
  transcribedAt: string;
  /**
   * Hash of the transcript text. Lets a summary's ProvenanceStamp.inputHash bind
   * to the exact transcript it was derived from, the same way summarize.ts binds
   * to rawNotes today.
   */
  textHash: string;
  /** Segments below the review floor — surfaced, never silently accepted. */
  lowConfidenceSegments: TranscriptSegment[];
}

/**
 * Below this, a segment is flagged for the coach to correct before signing.
 * Drug names and numbers are where ASR fails, and both are exactly where an
 * error is expensive.
 */
export const SEGMENT_CONFIDENCE_FLOOR = 0.85;

/**
 * Fixture consult, written as an alternating exchange so diarization has
 * something real to separate. Deliberately includes a negated symptom
 * ("no chest pain") so the speech → NLP path can be demonstrated end to end
 * against lib/azure/textAnalyticsHealth.ts.
 */
const SCRIPT: Array<{ role: SpeakerRole; text: string }> = [
  { role: "coach", text: "Alright, we're recording. How have the last four weeks felt compared to when we started?" },
  { role: "member", text: "Honestly a lot better. Energy is up, I'm getting through the afternoon without the crash." },
  { role: "coach", text: "Good. And sleep?" },
  { role: "member", text: "Still not great. I fall asleep fine but I'm awake around three most nights." },
  { role: "coach", text: "Any chest pain, palpitations, swelling in the ankles?" },
  { role: "member", text: "No chest pain, no swelling. Heart rate feels normal." },
  { role: "coach", text: "Good. Your last panel came back with total testosterone at 640 ng/dL and hematocrit at 47.1 percent." },
  { role: "member", text: "Is the hematocrit something I should worry about?" },
  { role: "coach", text: "It's inside range but trending up, so we'll recheck it at eight weeks rather than twelve." },
  { role: "member", text: "That works. My father had a heart attack at sixty so I pay attention to that stuff." },
  { role: "coach", text: "Noted, and that's worth flagging for the provider. I'll add it to your history." },
  { role: "coach", text: "Sticking with testosterone cypionate twice a week, and I want to add nutrition coaching for the sleep piece." },
  { role: "member", text: "Fine by me. Do I need to come in for the recheck?" },
  { role: "coach", text: "Lab draw in clinic, then we can do the follow-up as a telehealth visit." },
];

/** Rough speaking rate — used to build plausible, monotonic timings. */
const MS_PER_CHAR = 58;
const GAP_MS = 420;

/**
 * Transcribe a consult recording.
 *
 * DEMO ONLY. Returns the fixture script above regardless of what `audioRef`
 * points at, because it points at nothing. The seed only perturbs per-segment
 * confidence so the low-confidence review path is exercised rather than always
 * empty.
 */
export function transcribe(
  audioRef: string,
  opts: { locale?: string; at?: string } = {},
): AdapterResult<Transcript> {
  const ref = audioRef.trim();
  if (!ref) {
    return adapterFail("No audio reference supplied.");
  }

  const rand = seededRandom(`apex-speech:${ref}`);
  const segments: TranscriptSegment[] = [];
  let cursor = 0;

  // Speaker labels are assigned by the service in order of first appearance;
  // the mapping to a role is ours to make explicitly.
  const labelForRole: Record<SpeakerRole, string> = {
    coach: "Guest-1",
    member: "Guest-2",
    provider: "Guest-3",
    unknown: "Guest-0",
  };

  for (const line of SCRIPT) {
    const durationMs = Math.max(900, line.text.length * MS_PER_CHAR);
    // Numbers and drug names genuinely score lower in real ASR output.
    const hard = /\d|cypionate|hematocrit|testosterone|ng\/dL/i.test(line.text);
    const confidence =
      Math.round(clamp(0.97 - (hard ? 0.13 : 0) - rand() * 0.06, 0.6, 0.99) * 1000) / 1000;

    segments.push({
      text: line.text,
      startMs: cursor,
      endMs: cursor + durationMs,
      speaker: line.role,
      rawSpeakerLabel: labelForRole[line.role],
      confidence,
    });
    cursor += durationMs + GAP_MS;
  }

  const text = segments.map((s) => s.text).join(" ");

  return adapterOk({
    audioRef: ref,
    text,
    segments,
    durationMs: cursor,
    locale: opts.locale ?? "en-US",
    engine: "apex-speech-fixture-1.0 (DEMO — Azure AI Speech was not called)",
    transcribedAt: opts.at ?? AZURE_NOW,
    textHash: sha256(text),
    lowConfidenceSegments: segments.filter((s) => s.confidence < SEGMENT_CONFIDENCE_FLOOR),
  });
}

/**
 * Re-map a raw diarization label to a role.
 *
 * Exposed because the service cannot know who is who and any automatic guess is
 * wrong roughly half the time. A coach confirms the mapping once at the top of
 * the transcript, and every segment follows — a small piece of UI that prevents
 * a member's words being attributed to a clinician for the life of the record.
 */
export function assignSpeaker(
  transcript: Transcript,
  rawSpeakerLabel: string,
  role: SpeakerRole,
): Transcript {
  const segments = transcript.segments.map((s) =>
    s.rawSpeakerLabel === rawSpeakerLabel ? { ...s, speaker: role } : s,
  );
  return { ...transcript, segments };
}

/** Everything one speaker said — the input to "what did the member report?". */
export function segmentsBySpeaker(transcript: Transcript, speaker: SpeakerRole): TranscriptSegment[] {
  return transcript.segments.filter((s) => s.speaker === speaker);
}

/** The segment containing a character offset into `transcript.text`.
 *
 * This is the join between speech and lib/azure/textAnalyticsHealth.ts: an
 * entity carries an offset, this resolves the offset to a speaker and a
 * timestamp, and the UI can therefore say "the member said this, 4:12 in".
 * Provenance that survives the medium change.
 */
export function segmentAtOffset(transcript: Transcript, offset: number): TranscriptSegment | undefined {
  let cursor = 0;
  for (const s of transcript.segments) {
    const end = cursor + s.text.length;
    if (offset >= cursor && offset < end) return s;
    cursor = end + 1; // the joining space
  }
  return undefined;
}

/** mm:ss for a segment start. */
export function timecode(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Retention policy, stated in code so it is reviewable rather than assumed. */
export const SPEECH_RETENTION_POLICY = {
  /** Audio is discarded once the transcript is committed. */
  audioRetainedAfterTranscription: false,
  /** The transcript is permanent — it is the rawNotes of a spoken consult. */
  transcriptRetained: true,
  /** Recording requires explicit member consent captured per session. */
  requiresPerSessionConsent: true,
} as const;
