import { NextRequest, NextResponse } from "next/server";
import { exchangePatientMagicLink } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  if (!body || typeof body.token !== "string") {
    return NextResponse.json({ ok: false, error: "The sign-in link is invalid." }, { status: 400 });
  }
  const session = await exchangePatientMagicLink(body.token, request.headers.get("user-agent"));
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "This sign-in link is invalid, expired, or already used." },
      { status: 401 },
    );
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PATIENT_SESSION_COOKIE, session.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  return response;
}
