import { NextResponse } from "next/server";
import { unavailable } from "@/lib/api/respond";
import { findInviteByTokenHash, submitIntake, type ConsentDecision } from "@/lib/db/repo";
import { sha256 } from "@/lib/trace/hash";
import { GENERIC_TOKEN_FAILURE } from "@/lib/intake/tokens";
import { rateLimit, clientIp } from "@/lib/api/rateLimit";

/**
 * PUBLIC — resolve an intake token (GET) and submit the completed intake (POST).
 *
 * ONE GENERIC FAILURE, ALWAYS. Unknown token, expired token, already-used
 * token and malformed token all return the SAME message and the same status.
 * Distinguishing them would turn this endpoint into an oracle that confirms
 * which tokens exist — and each valid token opens a form collecting medical
 * history. lib/intake/tokens.ts states this rule; this enforces it.
 *
 * The token arrives in the BODY, not the path, so it does not land in access
 * logs, referrer headers or browser history as a URL component. It is hashed
 * immediately and only the hash is ever compared or stored.
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

  const token = new URL(req.url).searchParams.get("token");
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
  signatureName?: string;
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

  const consents = Array.isArray(body.consents) ? body.consents : [];
  const grantedScopes = new Set(consents.filter((c) => c?.granted).map((c) => c?.scope));
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

  try {
    const result = await submitIntake({
      tokenSha256: sha256(body.token),
      dateOfBirth: body.dateOfBirth,
      sex: body.sex,
      goals: body.goals,
      symptoms: body.symptoms,
      history: body.history,
      consents,
      signatureName: body.signatureName.trim(),
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
