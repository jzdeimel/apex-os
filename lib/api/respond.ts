import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

/**
 * One way to answer an API caller, and one way to fail.
 *
 * WHY THIS EXISTS. Route handlers were returning `err.message` straight to the
 * caller — `{ error: err instanceof Error ? err.message : "…" }`. That message
 * is the Postgres driver's, so a failed write could hand an unauthenticated or
 * merely-curious caller table names, column names, constraint names and
 * connection strings. It is also useless to the person reading it: "duplicate
 * key value violates unique constraint consult_draft_unique" is not something a
 * clinician can act on.
 *
 * So: the CALLER gets a stable, human message plus a correlation id. The SERVER
 * LOG gets the real error, tagged with the same id. Support can join the two;
 * an attacker gets a uuid.
 *
 * The correlation id is returned in the body AND as `x-apex-correlation-id`, so
 * it is visible whether someone is reading JSON or a network panel.
 */

export interface ApiFailure {
  ok: false;
  error: string;
  correlationId: string;
}

/** A failure the caller is ALLOWED to understand: validation, auth, conflict. */
export function fail(status: number, message: string): NextResponse {
  const correlationId = randomUUID();
  return NextResponse.json<ApiFailure>(
    { ok: false, error: message, correlationId },
    { status, headers: { "x-apex-correlation-id": correlationId } },
  );
}

/**
 * A failure the caller must NOT see the internals of.
 *
 * `context` is a short, stable string naming the operation ("consult.draft.put")
 * so a log search finds every instance, not just this one.
 */
export function serverError(
  context: string,
  err: unknown,
  publicMessage = "Something went wrong on our end. Please try again.",
  status = 500,
): NextResponse {
  const correlationId = randomUUID();
  // Structured, single-line, greppable. The message may contain schema text —
  // which is exactly why it goes here and not to the caller — but never patient
  // data, because we log the error, not the request body.
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      context,
      correlationId,
      message: err instanceof Error ? err.message : String(err),
    }),
  );
  return NextResponse.json<ApiFailure>(
    { ok: false, error: publicMessage, correlationId },
    { status, headers: { "x-apex-correlation-id": correlationId } },
  );
}

/**
 * The specific case of "there is no database".
 *
 * Distinguished from a generic 500 because it is operationally different — the
 * app is up, the write path is not — and because the honest user-facing message
 * is different: try again later, or phone us.
 */
export function unavailable(context: string, err: unknown, publicMessage: string): NextResponse {
  return serverError(context, err, publicMessage, 503);
}

/** Did this fail because no DATABASE_URL is configured? */
export function isNoDatabase(err: unknown): boolean {
  return err instanceof Error && /DATABASE_URL|no database/i.test(err.message);
}
