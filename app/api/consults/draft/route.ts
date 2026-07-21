import { NextResponse } from "next/server";
import { fail, serverError, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { currentPrincipal } from "@/lib/auth/principal";
import { getConsultDraft, upsertConsultDraft, signConsultDraft } from "@/lib/db/repo";
import { getClient, clientName } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";

/**
 * Consult drafts — server-side, so unsigned clinical PHI never persists on a
 * shared workstation (audit P0 #8). Keyed by the AUTHENTICATED author + client:
 *   GET  ?clientId=   → the caller's single live draft (or null)
 *   PUT  {clientId, rawNotes, aiSummary?}  → autosave upsert
 *   POST {clientId, attestation}           → author-sign: Draft → Signed, witnessed
 *
 * Every verb is gated on `write:consult`, scoped to the client's care team and
 * location — a clinician off this client's care team is refused here, not merely
 * hidden in the UI, and can never read another author's draft. No DATABASE_URL →
 * honest 503; nothing is faked.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ATTESTATION =
  "I attest that this note is accurate and complete to the best of my knowledge.";

function scope(clientId: string) {
  const client = getClient(clientId);
  if (!client) return null;
  return {
    client,
    subject: { coachId: client.coachId, providerId: client.providerId, locationId: client.locationId },
  };
}

export async function GET(req: Request) {
  if (!(await currentPrincipal())) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "clientId is required." }, { status: 400 });
  }
  const s = scope(clientId);
  if (!s) return NextResponse.json({ ok: false, error: "Unknown client." }, { status: 404 });

  const g = await guard("write:consult", s.subject);
  if (!g.ok) return g.res;

  try {
    const draft = await getConsultDraft(g.actor.id, clientId);
    return NextResponse.json({ ok: true, draft });
  } catch (err) {
    return unavailable("consult.draft", err, 'The draft store is unavailable. Your notes are not backed up.');
  }
}

export async function PUT(req: Request) {
  if (!(await currentPrincipal())) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }
  let body: { clientId?: string; rawNotes?: string; aiSummary?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed body." }, { status: 400 });
  }
  if (!body.clientId || typeof body.rawNotes !== "string") {
    return NextResponse.json({ ok: false, error: "clientId and rawNotes are required." }, { status: 400 });
  }
  const s = scope(body.clientId);
  if (!s) return NextResponse.json({ ok: false, error: "Unknown client." }, { status: 404 });

  const g = await guard("write:consult", s.subject);
  if (!g.ok) return g.res;

  try {
    const saved = await upsertConsultDraft({
      clientId: body.clientId,
      authorId: g.actor.id,
      rawNotes: body.rawNotes,
      aiSummary: body.aiSummary,
      at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, durable: true, ...saved });
  } catch (err) {
    return unavailable("consult.draft", err, 'The draft store is unavailable. Your notes are not backed up.');
  }
}

export async function POST(req: Request) {
  if (!(await currentPrincipal())) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }
  let body: { clientId?: string; attestation?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed body." }, { status: 400 });
  }
  if (!body.clientId) {
    return NextResponse.json({ ok: false, error: "clientId is required." }, { status: 400 });
  }
  const s = scope(body.clientId);
  if (!s) return NextResponse.json({ ok: false, error: "Unknown client." }, { status: 404 });

  const g = await guard("write:consult", s.subject);
  if (!g.ok) return g.res;

  const me = staffMap[g.actor.id];
  try {
    const result = await signConsultDraft({
      authorId: g.actor.id,
      clientId: body.clientId,
      signedBy: g.actor.id,
      signerName: g.principal.name ?? me?.name ?? g.actor.id,
      actorRole: g.actor.role,
      signerCredential: me?.credentials,
      attestation: body.attestation?.trim() || DEFAULT_ATTESTATION,
      subjectName: clientName(s.client),
      locationId: s.client.locationId,
      at: new Date().toISOString(),
    });
    if (!result) {
      // No live draft — already signed, or never saved. Not an error the caller
      // should retry into a second signature.
      return NextResponse.json(
        { ok: false, error: "No draft to sign — it may already be signed." },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      durable: true,
      consultId: result.consultId,
      ledger: { id: result.ledger.id, seq: result.ledger.seq, hash: result.ledger.hash },
    });
  } catch (err) {
    return unavailable("consult.draft", err, 'The draft store is unavailable. Your notes are not backed up.');
  }
}
