import { NextResponse } from "next/server";
import { fail, serverError } from "@/lib/api/respond";
import { createHash, createHmac } from "crypto";
import { currentPrincipal } from "@/lib/auth/principal";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { can } from "@/lib/authz/capabilities";

/**
 * ACS identity token endpoint — zero-dependency.
 *
 * Mints a real Azure Communication Services user and a VoIP access token by
 * calling the ACS Identity REST API directly, signed with the account key using
 * Node's built-in crypto (HMAC-SHA256). No SDK: the Azure JS SDK is a
 * serverExternalPackage that Next's standalone trace did not carry into the
 * runtime image, so importing it would fail at runtime; `crypto` and `fetch` are
 * always present. The token this returns is issued and signed by the `acs-apex`
 * resource in apex-prod — it is the real thing the Calling SDK would use.
 *
 * THE ACCOUNT KEY NEVER LEAVES THE SERVER. It is read from the
 * `acs-connection-string` secret, used only to sign this request, and the
 * browser receives only the short-lived scoped user token. That split is the
 * entire security model of an identity endpoint.
 *
 * The app sits behind Entra EasyAuth, so only a signed-in staff member reaches
 * this route.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_VERSION = "2022-10-01";

/**
 * One ACS identity + token per signed-in staff member, cached in memory.
 *
 * Two reasons. Security: minting is now behind an explicit principal check, not
 * only the EasyAuth path config — a single mis-set exclusion should not let the
 * open internet mint VoIP tokens. Hygiene: the old handler created a BRAND-NEW
 * ACS identity on every POST, so the resource would accumulate orphaned
 * identities forever. Keying by the caller's stable Entra objectId and reusing
 * the token until it is near expiry keeps one identity per staff member per
 * replica and stops the churn. (Durable per-staff identities belong in the DB
 * once the write path exists; this is the interim that does not leak.)
 */
interface CachedToken {
  userId: string;
  token: string;
  expiresOn: string;
}
const tokenByPrincipal = new Map<string, CachedToken>();
/** Reissue a little before expiry so a call never hands back a stale token. */
const RENEW_BEFORE_MS = 5 * 60 * 1000;

function parseConnectionString(cs: string): { endpoint: string; accessKey: string } | null {
  // Format: endpoint=https://…;accesskey=BASE64
  const parts = Object.fromEntries(
    cs
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i).toLowerCase(), p.slice(i + 1)];
      }),
  );
  const endpoint = parts["endpoint"];
  const accessKey = parts["accesskey"];
  if (!endpoint || !accessKey) return null;
  return { endpoint: endpoint.replace(/\/+$/, ""), accessKey };
}

export async function POST() {
  // Defense in depth: EasyAuth gates the path, but this handler mints a
  // real credential, so it verifies the caller itself. No principal → no token.
  const principal = await currentPrincipal();
  if (!principal) {
    return fail(401, "Not authenticated.");
  }

  const actor = actorFromPrincipal(principal);
  if (!actor) {
    return fail(403, "No staff record for this sign-in.");
  }

  const decision = can(actor, "write:contact");
  if (!decision.allowed) {
    return fail(403, decision.reason);
  }

  // Reuse this staff member's identity + token while it is still fresh.
  const cached = tokenByPrincipal.get(principal.objectId);
  if (cached && new Date(cached.expiresOn).getTime() - Date.now() > RENEW_BEFORE_MS) {
    return NextResponse.json({ ok: true, ...cached });
  }

  const cs = process.env.ACS_CONNECTION_STRING;
  if (!cs) {
    // Honest failure: no faked token.
    return fail(503, "Calling is not configured on this deployment.");
  }

  const parsed = parseConnectionString(cs);
  if (!parsed) {
    return serverError("acs.token.config", new Error("ACS connection string is malformed."), "Calling is temporarily unavailable.");
  }

  const { endpoint, accessKey } = parsed;
  const url = new URL(`${endpoint}/identities?api-version=${API_VERSION}`);
  const body = JSON.stringify({ createTokenWithScopes: ["voip"] });

  // --- Azure Communication Services HMAC signing ---------------------------
  const contentHash = createHash("sha256").update(body, "utf8").digest("base64");
  const date = new Date().toUTCString();
  const host = url.host;
  const pathAndQuery = url.pathname + url.search;
  const stringToSign = `POST\n${pathAndQuery}\n${date};${host};${contentHash}`;
  const signature = createHmac("sha256", Buffer.from(accessKey, "base64"))
    .update(stringToSign, "utf8")
    .digest("base64");
  const authorization = `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`;

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ms-date": date,
        "x-ms-content-sha256": contentHash,
        Authorization: authorization,
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      return serverError(
        "acs.token.upstream",
        new Error(`ACS identity API returned ${res.status}: ${text.slice(0, 500)}`),
        "Calling is temporarily unavailable.",
        502,
      );
    }

    const data = (await res.json()) as {
      identity?: { id?: string };
      accessToken?: { token?: string; expiresOn?: string };
    };

    const userId = data.identity?.id ?? null;
    const token = data.accessToken?.token ?? null;
    const expiresOn = data.accessToken?.expiresOn ?? null;

    // Cache for this staff member so a later call in the same window reuses the
    // identity instead of minting another.
    if (userId && token && expiresOn) {
      tokenByPrincipal.set(principal.objectId, { userId, token, expiresOn });
    }

    return NextResponse.json({ ok: true, userId, token, expiresOn });
  } catch (err) {
    return serverError("acs.token", err, 'Calling is temporarily unavailable.', 500);
  }
}
