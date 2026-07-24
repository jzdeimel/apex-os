import { NextResponse } from "next/server";

import { guard } from "@/lib/auth/guard";
import { signHistoryPhysical, completeSegment } from "@/lib/db/repo";
import { nowIso } from "@/lib/clock";
import { parseCredential } from "@/lib/scheduling/credentials";

export const dynamic = "force-dynamic";

/**
 * PART TWO OF THE VISIT — the provider signs the History & Physical.
 *
 * Matt Chilson: "our doctor will come in, he will do the history and physical,
 * and then he will complete part two, which then completes that entire
 * appointment."
 *
 * ── TWO INDEPENDENT GATES, BOTH REQUIRED ───────────────────────────────────
 * `sign:encounter` is the APP's answer — this role may sign clinical records.
 * `isProvider(credential)` inside the repository is the LICENCE's answer — this
 * person is an NP, PA or physician. They are different questions and neither
 * substitutes for the other: an Admin with a mis-granted capability still
 * cannot sign, and an NP whose staff row lacks the capability still cannot
 * either. The audited system had exactly one of these checks and it was the
 * wrong one, read from client state.
 *
 * ── THE ATTESTATION IS STORED VERBATIM ─────────────────────────────────────
 * Not a boolean, not an id pointing at copy that can be rewritten. What the
 * signer was shown at the moment they signed is what is kept, for the same
 * reason `consent.textSha256` exists one table over.
 */

const ATTESTATION =
  "I personally performed this history and physical examination, the findings recorded are my own, " +
  "and this record is complete and accurate to the best of my knowledge.";

export async function POST(req: Request) {
  let body: {
    clientId?: string;
    encounterId?: string;
    segmentId?: string;
    chiefComplaint?: string;
    historyNarrative?: string;
    examNarrative?: string;
    assessment?: string;
    labIndications?: string;
    /** Must be true. An unticked attestation is an unsigned record. */
    attested?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  if (!body.clientId) {
    return NextResponse.json({ ok: false, error: "clientId is required." }, { status: 400 });
  }
  if (body.attested !== true) {
    return NextResponse.json(
      { ok: false, error: "The attestation must be accepted before this can be signed." },
      { status: 400 },
    );
  }
  if (!body.examNarrative?.trim()) {
    // A physical exam with no exam recorded is a signature on an empty page.
    return NextResponse.json(
      { ok: false, error: "Record the examination findings before signing." },
      { status: 400 },
    );
  }

  const g = await guard("sign:encounter");
  if (!g.ok) return g.res;

  const credential = parseCredential(g.principal.credentials);
  const at = nowIso();

  try {
    const signed = await signHistoryPhysical({
      id: `hp-${body.encounterId ?? body.clientId}-${Date.parse(at)}`,
      clientId: body.clientId,
      encounterId: body.encounterId,
      segmentId: body.segmentId,
      providerId: g.actor.id,
      providerName: g.principal.name,
      providerCredential: credential,
      actorRole: g.actor.role,
      chiefComplaint: body.chiefComplaint,
      historyNarrative: body.historyNarrative,
      examNarrative: body.examNarrative,
      assessment: body.assessment,
      labIndications: body.labIndications,
      attestation: ATTESTATION,
      at,
    });

    if (!signed.ok) {
      return NextResponse.json({ ok: false, error: signed.error }, { status: 403 });
    }

    // Closing the segment is deliberately a second call — see the repository
    // docblock. If it fails, the signature still stands and the visit stays
    // visibly open, which is the recoverable order.
    let segment: Awaited<ReturnType<typeof completeSegment>> | null = null;
    if (body.segmentId) {
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
      hpId: signed.hpId,
      ledger: { id: signed.ledger.id, hash: signed.ledger.hash },
      /**
       * Returned so the provider knows whether the visit is actually finished.
       * "Signed" and "visit complete" are different facts, and a screen that
       * conflates them is how a lab draw goes missing for a day.
       */
      encounterComplete: segment?.ok ? segment.encounterComplete : null,
      outstanding: segment?.ok ? segment.outstanding : null,
      /**
       * THE CONTINUITY HOOK. Matt Chilson: "the H&P has to match the same guy
       * who did the plan of care." Whoever signs the plan of care can be checked
       * against this. Not enforced here — Stephanie Butler's scheduling spec
       * says assign whoever is available, and the two requirements have not
       * been reconciled (docs/AUG7_CUTOVER.md §6). Encoding either silently
       * would decide it.
       */
      planOfCareShouldBeSignedBy: g.actor.id,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Write failed." },
      { status: 500 },
    );
  }
}
