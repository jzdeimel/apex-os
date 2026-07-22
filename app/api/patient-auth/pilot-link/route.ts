import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth/guard";
import { issuePatientMagicLink } from "@/lib/auth/patientRepo";
import { patientSignInUrl } from "@/lib/auth/patientTokens";

export async function POST(request: NextRequest) {
  const auth = await guard("admin:roles");
  if (!auth.ok) return auth.res;

  const body = (await request.json().catch(() => null)) as { clientId?: unknown } | null;
  if (!body || typeof body.clientId !== "string" || body.clientId.length > 128) {
    return NextResponse.json({ ok: false, error: "A valid clientId is required." }, { status: 400 });
  }
  try {
    const issued = await issuePatientMagicLink(body.clientId, auth.actor.id);
    return NextResponse.json({
      ok: true,
      signInUrl: patientSignInUrl(request.nextUrl.origin, issued.rawToken),
      expiresAt: issued.expiresAt.toISOString(),
      warning: "This URL is shown once. Deliver it only to the selected pilot patient.",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not issue patient access." },
      { status: 409 },
    );
  }
}
