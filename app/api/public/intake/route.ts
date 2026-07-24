import { NextResponse } from "next/server";
import { unavailable } from "@/lib/api/respond";
import { findInviteByTokenHash, submitIntake, type ConsentDecision } from "@/lib/db/repo";
import { sha256 } from "@/lib/trace/hash";
import {
  formVersion,
  formSha256,
  validateSubmission,
} from "@/lib/intake/formDefinition";
import {
  CONSENT_DEFINITIONS,
  consentTextHash,
} from "@/lib/intake/content";
import { GENERIC_TOKEN_FAILURE } from "@/lib/intake/tokens";
import { rateLimit, clientIp } from "@/lib/api/rateLimit";
import { IS_DEMO } from "@/lib/config";

/**
 * PUBLIC — resolve an intake token (GET) and submit the completed intake (POST).
 *
 * ONE GENERIC FAILURE, ALWAYS. Unknown token, expired token, already-used
 * token and malformed token all return the SAME message and the same status.
 * Distinguishing them would turn this endpoint into an oracle that confirms
 * which tokens exist — and each valid token opens a form collecting medical
 * history. lib/intake/tokens.ts states this rule; this enforces it.
 *
 * Submission tokens arrive in the BODY. Resolve tokens arrive in a header
 * (`x-apex-intake-token`). Demo builds may still accept `?token=` so old demo
 * links keep working, but production never reads bearer credentials from query
 * strings.
 *
 * Single use is closed at the database inside repo.submitIntake — a conditional
 * UPDATE that claims the invite — so two concurrent submissions cannot both
 * succeed. This route does not attempt to check-then-write.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESOLVE_LIMIT = 20;
const SUBMIT_LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;

/** Every consent Apex requires before a clinician may see the person. */
const REQUIRED_SCOPES = ["treatment", "telehealth", "hipaaNotice"];

function generic() {
  return NextResponse.json({ ok: false, error: GENERIC_TOKEN_FAILURE }, { status: 400 });
}

/** Resolve a token to its prefill, for the wizard to render. */
export async function GET(req: Request) {
  const now = Date.now();
  const rl = rateLimit(`intake-get:${clientIp(req.headers)}`, RESOLVE_LIMIT, WINDOW_MS, now);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const token =
    req.headers.get("x-apex-intake-token") ??
    (IS_DEMO ? new URL(req.url).searchParams.get("token") : null);
  if (!token) return generic();

  try {
    const invite = await findInviteByTokenHash(sha256(token));
    // Unknown, spent, or expired — one answer for all three.
    if (!invite || invite.usedAt || new Date(invite.expiresAt).getTime() <= now) return generic();
    return NextResponse.json({ ok: true, prefill: invite.prefill, expiresAt: invite.expiresAt });
  } catch (err) {
    return unavailable("public.intake.resolve", err, "Intake is temporarily unavailable. Please call us.");
  }
}

interface Body {
  token?: string;
  dateOfBirth?: string;
  sex?: string;
  goals?: unknown;
  symptoms?: unknown;
  history?: unknown;
  /** Answers keyed by question id, against `formVersion`. */
  answers?: Record<string, unknown>;
  /** Which published form version was rendered. */
  formVersion?: string;
  signatureName?: string;
  electronicConsentGiven?: boolean;
  attestedRead?: boolean;
  consents?: ConsentDecision[];
}

export async function POST(req: Request) {
  const now = Date.now();
  const ip = clientIp(req.headers);
  const rl = rateLimit(`intake-post:${ip}`, SUBMIT_LIMIT, WINDOW_MS, now);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return generic();
  }
  if (!body.token || typeof body.token !== "string") return generic();

  const presentedConsents = Array.isArray(body.consents) ? body.consents : [];
  const allowedScopes = new Set<string>(
    CONSENT_DEFINITIONS.map((definition) => definition.kind),
  );
  const presentedScopes = presentedConsents.map((decision) => decision?.scope);
  if (
    presentedScopes.some((scope) => typeof scope !== "string" || !allowedScopes.has(scope)) ||
    new Set(presentedScopes).size !== presentedScopes.length
  ) {
    return NextResponse.json(
      { ok: false, error: "The consent decisions do not match this intake version." },
      { status: 400 },
    );
  }
  const byScope = new Map(
    presentedConsents.map((decision) => [decision.scope, decision]),
  );
  const consents: ConsentDecision[] = CONSENT_DEFINITIONS.map((definition) => ({
    scope: definition.kind,
    documentVersion: definition.version,
    textSha256: consentTextHash(definition.kind),
    granted: byScope.get(definition.kind)?.granted === true,
  }));
  const grantedScopes = new Set(consents.filter((c) => c.granted).map((c) => c.scope));
  const missing = REQUIRED_SCOPES.filter((s) => !grantedScopes.has(s));
  if (missing.length) {
    // A content error, not a token error — safe to be specific, and the person
    // needs to know which box to tick.
    return NextResponse.json(
      { ok: false, error: `These consents are required to continue: ${missing.join(", ")}.` },
      { status: 400 },
    );
  }
  if (!body.signatureName || !body.signatureName.trim()) {
    return NextResponse.json(
      { ok: false, error: "A typed signature is required." },
      { status: 400 },
    );
  }
  if (body.electronicConsentGiven !== true || body.attestedRead !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "Confirm that you read the documents and agree to sign electronically.",
      },
      { status: 400 },
    );
  }

  /**
   * Validate the medical history against the form version it claims to answer.
   *
   * SERVER-SIDE BECAUSE THIS ENDPOINT IS PUBLIC. The wizard checks as it goes,
   * but that is a courtesy — this is the only unauthenticated write path in
   * Apex, so anything that must be true is enforced here or not at all.
   *
   * The five must-knows (allergies, missing organs, surgical history, major
   * diseases, cancer + family history) are `required` in the definition, so a
   * submission that skips one is refused rather than stored with a hole in it.
   * A medical history with a silent gap is worse than no history: it reads as
   * "asked and answered none".
   */
  if (
    typeof body.formVersion !== "string" ||
    !body.answers ||
    typeof body.answers !== "object" ||
    Array.isArray(body.answers)
  ) {
    return NextResponse.json(
      { ok: false, error: "A published intake form version and its complete answers are required." },
      { status: 400 },
    );
  }
  const definition = formVersion(body.formVersion);
  if (!definition) {
    return NextResponse.json(
      { ok: false, error: "Unknown intake form version." },
      { status: 400 },
    );
  }
  const answers = (body.answers ?? {}) as Record<string, unknown>;
  // Only enforced once the client is actually sending versioned answers. The
  // legacy `history` blob shape is still accepted while the wizard migrates —
  // rejecting it here would take intake down for a UI change that has not
  // shipped, which is a worse failure than a transitional gap.
  const track = body.sex === "female" ? "female" : body.sex === "male" ? "male" : undefined;
  const problems = validateSubmission(definition, answers, track);
  if (problems.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "Some required answers are missing.",
        problems: problems.map((p) => ({
          questionId: p.questionId,
          prompt: p.prompt,
          message: p.message,
          mustKnow: p.mustKnow,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const result = await submitIntake({
      tokenSha256: sha256(body.token),
      dateOfBirth: body.dateOfBirth,
      sex: body.sex,
      goals: body.goals,
      symptoms: body.symptoms,
      history: body.history,
      answers: body.answers,
      formVersion: definition.version,
      formSha256: formSha256(definition),
      consents,
      signatureName: body.signatureName.trim(),
      signedByRole: "patient",
      electronicConsentGiven: true,
      attestedRead: true,
      ipAddress: ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
      at: new Date(now).toISOString(),
    });

    // null = the invite could not be claimed (unknown / spent / expired).
    // Same generic answer as every other token failure.
    if (!result) return generic();

    return NextResponse.json({
      ok: true,
      durable: true,
      submissionId: result.submissionId,
      ledger: { id: result.ledger.id, hash: result.ledger.hash },
    });
  } catch (err) {
return unavailable("public.intake", err, 'We could not record your intake. Please call us.');
  }
}
