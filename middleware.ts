import { NextRequest, NextResponse } from "next/server";

import {
  isFixtureOnlyApiPath,
  isFixtureOnlyPath,
} from "@/lib/productionSurfaces";

function demoEnabled() {
  return process.env.APEX_DEMO_MODE === "true";
}

/**
 * Fixture-only screens are denied at the request boundary in every shared
 * environment. Hiding a sidebar item is useful UX; it is not enforcement.
 */
export function middleware(request: NextRequest) {
  if (demoEnabled()) {
    return NextResponse.next();
  }

  if (isFixtureOnlyApiPath(request.nextUrl.pathname)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This retired demonstration endpoint is unavailable in the shared Apex environment.",
      },
      {
        status: 410,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  if (!isFixtureOnlyPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const target = request.nextUrl.clone();
  target.pathname = "/not-ready";
  target.search = "";
  target.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(target, 307);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icon.svg|\\.auth|access-pending|not-ready|patient-sign-in).*)",
  ],
};
