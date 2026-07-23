import { NextResponse } from "next/server";
import { CommunicationIdentityClient } from "@azure/communication-identity";

import { fail, serverError } from "@/lib/api/respond";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { currentPrincipal } from "@/lib/auth/principal";
import { can } from "@/lib/authz/capabilities";
import { normalizeUsPhoneNumber } from "@/lib/communications/calling";

/**
 * Issue a short-lived, VoIP-only ACS user token to an authenticated staff
 * member. The ACS account key remains server-side in Key Vault; the browser
 * receives only the scoped token needed by the Calling SDK.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CachedToken {
  userId: string;
  token: string;
  expiresOn: string;
}

const tokenByPrincipal = new Map<string, CachedToken>();
const RENEW_BEFORE_MS = 5 * 60 * 1000;

function response(token: CachedToken, callerId: string | null) {
  return NextResponse.json({
    ok: true,
    ...token,
    displayName: "Alpha Health",
    callerId,
    pstnConfigured: callerId !== null,
  });
}

export async function POST() {
  const principal = await currentPrincipal();
  if (!principal) return fail(401, "Not authenticated.");

  const actor = actorFromPrincipal(principal);
  if (!actor) return fail(403, "No staff record for this sign-in.");

  const decision = can(actor, "call:patient");
  if (!decision.allowed) return fail(403, decision.reason);

  const connectionString = process.env.ACS_CONNECTION_STRING;
  if (!connectionString) {
    return fail(503, "Calling is not configured on this deployment.");
  }

  const rawCallerId = process.env.ACS_CALLER_ID;
  const callerId = normalizeUsPhoneNumber(rawCallerId);
  if (rawCallerId && !callerId) {
    return serverError(
      "acs.token.caller-id",
      new Error("ACS_CALLER_ID is not a valid E.164 number."),
      "Calling is temporarily unavailable.",
    );
  }

  const cached = tokenByPrincipal.get(principal.objectId);
  if (
    cached &&
    new Date(cached.expiresOn).getTime() - Date.now() > RENEW_BEFORE_MS
  ) {
    return response(cached, callerId);
  }

  try {
    const identityClient = new CommunicationIdentityClient(connectionString);
    const issued = await identityClient.createUserAndToken(
      ["voip"],
      { tokenExpiresInMinutes: 480 },
    );
    const token: CachedToken = {
      userId: issued.user.communicationUserId,
      token: issued.token,
      expiresOn: issued.expiresOn.toISOString(),
    };
    tokenByPrincipal.set(principal.objectId, token);
    return response(token, callerId);
  } catch (error) {
    return serverError(
      "acs.token.upstream",
      error,
      "Calling is temporarily unavailable.",
      502,
    );
  }
}
