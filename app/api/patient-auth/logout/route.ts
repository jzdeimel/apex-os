import { NextRequest, NextResponse } from "next/server";
import { revokePatientSession } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";

export async function POST(request: NextRequest) {
  await revokePatientSession(request.cookies.get(PATIENT_SESSION_COOKIE)?.value);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PATIENT_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
  return response;
}
