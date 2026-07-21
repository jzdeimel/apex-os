import { NextResponse } from "next/server";
import { fail, serverError, unavailable } from "@/lib/api/respond";
import { currentPrincipal } from "@/lib/auth/principal";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { can } from "@/lib/authz/capabilities";
import { logDose, retractDose, upsertMemberDay } from "@/lib/db/repo";
import { getClient } from "@/lib/mock/clients";
import { isDemoMemberId } from "@/lib/viewer";
import { IS_DEMO } from "@/lib/config";

/**
 * Member log — the durable write path for what a member records about
 * themselves: doses (append-only, with retraction), the day's weight and
 * check-in scores.
 *
 * AUTH SHAPE, HONESTLY. The whole app currently sits behind STAFF EasyAuth —
 * there is no separate member identity yet (CIAM is the production plan). So the
 * honest gate today is "an authenticated session exists"; the body's clientId
 * says whose log it is, exactly as the seeded portal does client-side. When
 * member identity lands, the clientId comes from the session and the body's
 * claim is ignored — the seam is this route, and nothing downstream changes.
 *
 * Writes are append-only where they should be (a dose), upsert where that is
 * the right semantics (a day's weight — re-logging corrects the day). Every
 * failure is a real HTTP error; nothing fakes success.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  op?: "dose" | "retract" | "day";
  clientId?: string;
  // dose
  doseId?: string;
  prescriptionId?: string;
  date?: string; // YYYY-MM-DD
  takenAt?: string; // ISO
  site?: string;
  skipped?: boolean;
  skipReason?: string;
  // day
  weightLb?: number;
  feel?: Record<string, number>;
}

export async function POST(req: Request) {
  const principal = await currentPrincipal();
  if (!principal) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed body." }, { status: 400 });
  }
  if (!body.clientId || !body.op) {
    return NextResponse.json({ ok: false, error: "clientId and op are required." }, { status: 400 });
  }

  /**
   * AUTHORIZE THE SUBJECT — do not simply believe the body.
   *
   * This route used to accept whatever clientId it was handed, so any
   * authenticated staff session could write dose and weight entries onto ANY
   * patient's chart, and the portal's demo member switcher (a localStorage
   * value) effectively chose the subject. Identity from the client is not
   * identity.
   *
   * There is no member sign-in yet — the whole app sits behind staff EasyAuth,
   * and patient identity needs CIAM — so the honest rule is:
   *   · staff may write a member's log only with `write:adherence` on THAT
   *     member, which enforces care team and location; and
   *   · in DEMO builds only, the seeded demo members remain writable so the
   *     portal walkthrough works.
   * When member auth lands, the subject comes from the session and the body's
   * clientId is ignored entirely. This is the seam.
   */
  const client = getClient(body.clientId);
  if (!client) {
    return NextResponse.json({ ok: false, error: "Unknown member." }, { status: 404 });
  }
  const actor = actorFromPrincipal(principal);
  const staffMayWrite =
    !!actor &&
    can(actor, "write:adherence", {
      coachId: client.coachId,
      providerId: client.providerId,
      locationId: client.locationId,
    }).allowed;
  const demoMemberWrite = IS_DEMO && isDemoMemberId(body.clientId);

  if (!staffMayWrite && !demoMemberWrite) {
    return NextResponse.json(
      { ok: false, error: "You are not permitted to write to this member's log." },
      { status: 403 },
    );
  }

  try {
    if (body.op === "dose") {
      if (!body.doseId || !body.prescriptionId || !body.date || !body.takenAt) {
        return NextResponse.json(
          { ok: false, error: "doseId, prescriptionId, date and takenAt are required." },
          { status: 400 },
        );
      }
      await logDose({
        id: body.doseId,
        clientId: body.clientId,
        prescriptionId: body.prescriptionId,
        date: body.date,
        takenAt: body.takenAt,
        site: body.site,
        skipped: body.skipped,
        skipReason: body.skipReason,
      });
      return NextResponse.json({ ok: true, durable: true });
    }

    if (body.op === "retract") {
      if (!body.doseId) {
        return NextResponse.json({ ok: false, error: "doseId is required." }, { status: 400 });
      }
      const retracted = await retractDose(body.doseId, body.clientId, new Date().toISOString());
      if (!retracted) {
        // Either the dose is not this member's, or it was already retracted.
        // One answer for both, so the endpoint is not an existence oracle.
        return NextResponse.json(
          { ok: false, error: "That dose could not be retracted." },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: true, durable: true });
    }

    if (body.op === "day") {
      if (!body.date) {
        return NextResponse.json({ ok: false, error: "date is required." }, { status: 400 });
      }
      await upsertMemberDay({
        clientId: body.clientId,
        date: body.date,
        weightLb: body.weightLb,
        feel: body.feel,
      });
      return NextResponse.json({ ok: true, durable: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown op." }, { status: 400 });
  } catch (err) {
    // requireDb throws when DATABASE_URL is absent — the honest 503, never a
    // fake success. The client-side log keeps its local record either way.
    return unavailable("member.log", err, 'We could not save that. Please try again.');
  }
}
