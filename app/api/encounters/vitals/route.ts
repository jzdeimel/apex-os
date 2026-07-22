import { NextResponse } from "next/server";

import { guard } from "@/lib/auth/guard";
import { recordVitals, completeSegment } from "@/lib/db/repo";
import { nowIso } from "@/lib/clock";
import { staffMap } from "@/lib/mock/staff";
import type { VitalsInput } from "@/lib/encounters/lifecycle";

export const dynamic = "force-dynamic";

/**
 * PART ONE OF THE VISIT — the nurse records vitals and closes her segment.
 *
 * Matt Chilson's flow, 2026-07-21: "she'd open that up, it would show all the
 * information that we could pull from the intake paperwork, so the only thing
 * she has to really leave is the vitals — blood pressure, resting heart rate,
 * any notes she needs. She will then save it. That is part one."
 *
 * TWO WRITES, ONE REQUEST, AND THE ORDER MATTERS. Vitals are recorded first and
 * the segment is closed second, because a segment marked complete with no
 * vitals behind it is a false statement about what happened in the room. If the
 * vitals write fails, the segment stays open and the work is still visible in
 * the queue — which is the recoverable failure. The reverse is not.
 *
 * `write:consult` rather than a new capability: recording vitals is clinical
 * authorship by someone on the care team, which is what that capability already
 * means. The CREDENTIAL check — that this person may perform a lab draw at all
 * — happens inside `completeSegment` against the tiers snapshotted on the row.
 */
export async function POST(req: Request) {
  let body: {
    clientId?: string;
    encounterId?: string;
    segmentId?: string;
    vitals?: VitalsInput;
    notes?: string;
    supersedesId?: string;
    correctionReason?: string;
    /** When false, record vitals without closing the segment. */
    completeSegment?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  if (!body.clientId) {
    return NextResponse.json({ ok: false, error: "clientId is required." }, { status: 400 });
  }
  if (!body.vitals || typeof body.vitals !== "object") {
    return NextResponse.json({ ok: false, error: "vitals are required." }, { status: 400 });
  }

  const g = await guard("write:consult");
  if (!g.ok) return g.res;

  // The credential held right now, from the roster the staff row points at.
  // Passed explicitly rather than looked up deeper down, so what was recorded
  // is what was checked.
  const credential = staffMap[g.actor.id]?.credentialClass ?? null;
  const at = nowIso();

  try {
    const recorded = await recordVitals({
      id: `vit-${g.actor.id}-${Date.parse(at)}`,
      clientId: body.clientId,
      encounterId: body.encounterId,
      segmentId: body.segmentId,
      values: body.vitals,
      notes: body.notes,
      takenBy: g.actor.id,
      takenByName: g.principal.name,
      takenByCredential: credential,
      actorRole: g.actor.role,
      supersedesId: body.supersedesId,
      correctionReason: body.correctionReason,
      at,
    });

    if (!recorded.ok) {
      // A range error is a data-entry problem the nurse can fix, so it is
      // reported specifically rather than generically.
      return NextResponse.json({ ok: false, error: recorded.error }, { status: 400 });
    }

    let segment: Awaited<ReturnType<typeof completeSegment>> | null = null;
    if (body.segmentId && body.completeSegment !== false) {
      segment = await completeSegment({
        segmentId: body.segmentId,
        performedBy: g.actor.id,
        performedByName: g.principal.name,
        performedByCredential: credential,
        actorRole: g.actor.role,
        at,
      });
    }

    return NextResponse.json({
      ok: true,
      vitalsId: recorded.vitalsId,
      /**
       * Surfaced, never swallowed. A systolic of 210 is stored as entered — see
       * validateVitals on why refusing a true reading is the worse failure —
       * but the person who typed it should be told it is unusual.
       */
      warnings: recorded.warnings,
      ledger: { id: recorded.ledger.id, hash: recorded.ledger.hash },
      segment:
        segment === null
          ? null
          : segment.ok
            ? {
                closed: true,
                encounterComplete: segment.encounterComplete,
                outstanding: segment.outstanding,
              }
            : { closed: false, error: segment.error },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Write failed." },
      { status: 500 },
    );
  }
}
