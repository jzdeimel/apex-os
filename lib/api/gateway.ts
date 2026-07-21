import { NextResponse } from "next/server";
import { currentPrincipal, type Principal } from "@/lib/auth/principal";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { can, type Actor, type Capability } from "@/lib/authz/capabilities";
import { fail, serverError, unavailable } from "@/lib/api/respond";

/**
 * ONE SHAPE FOR EVERY MUTATION.
 *
 * The audit's finding was not that any single route was wrong — it was that
 * each route invented its own order of operations, so each got a different
 * subset right. Some validated the body before authenticating (leaking field
 * names to anonymous callers). Some scoped authorization to an id taken FROM
 * the body rather than from the record. Some wrote a ledger row and no primary
 * row; some the reverse. Same class of bug, seven different spellings.
 *
 * So the order is fixed here, once, and routes supply only the parts that
 * differ:
 *
 *   1. AUTHENTICATE     — no principal, no information. 401 before anything.
 *   2. PARSE            — malformed body is a 400 and nothing else happens.
 *   3. LOAD THE SUBJECT — from the source of truth, BY ID, server-side. This is
 *                         the step routes were skipping: you cannot authorize
 *                         against a relationship the caller asserted.
 *   4. AUTHORIZE        — can(actor, capability, subjectScope) using the scope
 *                         read off the LOADED subject, never the request.
 *   5. VALIDATE         — domain rules, with the real subject in hand.
 *   6. EXECUTE          — the write, which is expected to be transactional and
 *                         to witness itself in the ledger.
 *   7. RESPOND          — typed success, or a generic failure with a
 *                         correlation id (lib/api/respond.ts).
 *
 * A route that uses this cannot forget step 3 or 4, because it cannot reach
 * `execute` without having supplied them.
 */

export interface MutationContext<TBody, TSubject> {
  body: TBody;
  subject: TSubject;
  actor: Actor;
  principal: Principal;
}

export interface MutationSpec<TBody, TSubject, TResult> {
  /** Stable operation name for logs and correlation, e.g. "orders.create". */
  context: string;
  /** The capability required. Checked against the LOADED subject's scope. */
  capability: Capability;
  /** Parse and shape-check the body. Return a string to reject with 400. */
  parse: (raw: unknown) => TBody | string;
  /**
   * Load the subject from the source of truth. Returning null is a 404.
   * This is the anti-forgery step: everything downstream authorizes and
   * validates against what the SERVER read, not what the caller sent.
   */
  loadSubject: (body: TBody) => Promise<TSubject | null> | TSubject | null;
  /** Care-team / location scope, read off the loaded subject. */
  scopeOf: (subject: TSubject) => { coachId?: string; providerId?: string; locationId?: string };
  /** Domain validation with the real subject. Return a string to reject with 422. */
  validate?: (ctx: MutationContext<TBody, TSubject>) => string | null;
  /** Perform the write. Should be transactional and append its own ledger row. */
  execute: (ctx: MutationContext<TBody, TSubject>) => Promise<TResult>;
  /** Message shown when the write path is unavailable (no DB, etc). */
  unavailableMessage?: string;
}

export async function runMutation<TBody, TSubject, TResult>(
  req: Request,
  spec: MutationSpec<TBody, TSubject, TResult>,
): Promise<NextResponse> {
  // 1. AUTHENTICATE FIRST. An unauthenticated caller learns nothing — not field
  //    names, not whether an id exists.
  const principal = await currentPrincipal();
  if (!principal) return fail(401, "Not authenticated.");

  const actor = actorFromPrincipal(principal);
  if (!actor) return fail(403, "No staff record for this sign-in.");

  // 2. PARSE
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Malformed body.");
  }
  const parsed = spec.parse(raw);
  if (typeof parsed === "string") return fail(400, parsed);

  // 3. LOAD THE SUBJECT from the source of truth.
  let subject: TSubject | null;
  try {
    subject = await spec.loadSubject(parsed);
  } catch (err) {
    return unavailable(
      `${spec.context}.load`,
      err,
      spec.unavailableMessage ?? "We could not complete that. Please try again.",
    );
  }
  if (subject === null || subject === undefined) return fail(404, "Not found.");

  // 4. AUTHORIZE against the LOADED subject's scope.
  const decision = can(actor, spec.capability, spec.scopeOf(subject));
  if (!decision.allowed) return fail(403, decision.reason);

  const ctx: MutationContext<TBody, TSubject> = { body: parsed, subject, actor, principal };

  // 5. VALIDATE with the real subject in hand.
  const problem = spec.validate?.(ctx);
  if (problem) return fail(422, problem);

  // 6. EXECUTE
  try {
    const result = await spec.execute(ctx);
    return NextResponse.json({ ok: true, durable: true, ...(result as object) });
  } catch (err) {
    // A domain refusal thrown as ConflictError is the caller's to see; anything
    // else is ours to keep.
    if (err instanceof ConflictError) return fail(409, err.message);
    if (err instanceof RefusedError) return fail(422, err.message);
    return serverError(
      spec.context,
      err,
      spec.unavailableMessage ?? "We could not complete that. Please try again.",
      503,
    );
  }
}

/** The write could not apply because the record moved (already signed, spent). */
export class ConflictError extends Error {}
/** The write is understood but not permitted by a domain rule. */
export class RefusedError extends Error {}
