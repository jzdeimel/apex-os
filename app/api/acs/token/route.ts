import { NextResponse } from "next/server";
import { createHash, createHmac } from "crypto";

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
  const cs = process.env.ACS_CONNECTION_STRING;
  if (!cs) {
    // Honest failure: no faked token.
    return NextResponse.json(
      { ok: false, error: "ACS is not configured on this deployment (no connection string)." },
      { status: 503 },
    );
  }

  const parsed = parseConnectionString(cs);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: "ACS connection string is malformed." }, { status: 500 });
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
      return NextResponse.json(
        { ok: false, error: `ACS identity API returned ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      identity?: { id?: string };
      accessToken?: { token?: string; expiresOn?: string };
    };

    return NextResponse.json({
      ok: true,
      userId: data.identity?.id ?? null,
      token: data.accessToken?.token ?? null,
      expiresOn: data.accessToken?.expiresOn ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to mint ACS token." },
      { status: 500 },
    );
  }
}
