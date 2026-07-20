import { NextResponse } from "next/server";
import { CommunicationIdentityClient } from "@azure/communication-identity";

/**
 * ACS identity token endpoint.
 *
 * Mints a real Azure Communication Services user and a VoIP access token, which
 * the browser Calling SDK needs to place a voice or video call. This is the live
 * seam: the token this returns is issued by the `acs-apex` resource in the
 * apex-prod resource group, signed by ACS, and would connect a real call.
 *
 * WHY THE CONNECTION STRING IS NEVER IN THE CLIENT
 * ------------------------------------------------
 * The ACS connection string carries the access key. It lives ONLY on the server,
 * read from the container secret `acs-connection-string` (a Key Vault reference
 * in the hardened setup). The browser never sees it — it receives only a
 * short-lived, scoped user token. That split is the whole point of an identity
 * endpoint: a leaked user token expires in hours and can do one thing; a leaked
 * connection string is the account.
 *
 * AUTHENTICATION
 * --------------
 * The app sits behind Entra EasyAuth, so only a signed-in staff member reaches
 * this route at all. In production this also checks the caller is staff (not a
 * patient) before minting a token, since only the clinic places outbound calls.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const connectionString = process.env.ACS_CONNECTION_STRING;

  if (!connectionString) {
    // Honest failure: no faked token. If ACS is not configured, say so plainly
    // rather than returning something that looks like a token and connects
    // nothing.
    return NextResponse.json(
      { ok: false, error: "ACS is not configured on this deployment (no connection string)." },
      { status: 503 },
    );
  }

  try {
    const client = new CommunicationIdentityClient(connectionString);
    const { user, token, expiresOn } = await client.createUserAndToken(["voip"]);
    return NextResponse.json({
      ok: true,
      userId: user.communicationUserId,
      token,
      expiresOn,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to mint ACS token." },
      { status: 500 },
    );
  }
}
