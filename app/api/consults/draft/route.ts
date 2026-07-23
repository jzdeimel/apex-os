import { NextResponse } from "next/server";
import { fail, serverError, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { currentPrincipal } from "@/lib/auth/principal";
import { getConsultDraft, readClientCareScope, upsertConsultDraft, signConsultDraft } from "@/lib/db/repo";
import type { ClinicalNoteFields, ConsultKind } from "@/lib/consult/types";
import {
  consultChannelsForRole,
  consultChannelForRole,
  consultKindForRole,
  consultKindsForRole,
  defaultConsultChannel,
  defaultConsultKind,
  isConsultChannelAllowedForRole,
  isConsultKindAllowedForRole,
} from "@/lib/consult/metadata";

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

const CLINICAL_FIELDS = ["subjective", "objective", "assessment", "plan"] as const;
const MAX_CLINICAL_FIELD_LENGTH = 50_000;

function parseClinicalNote(value: unknown): ClinicalNoteFields | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (CLINICAL_FIELDS.some((field) => typeof record[field] !== "string")) return null;
  if (CLINICAL_FIELDS.some((field) => (record[field] as string).length > MAX_CLINICAL_FIELD_LENGTH)) {
    return null;
  }
  return {
    subjective: record.subjective as string,
    objective: record.objective as string,
    assessment: record.assessment as string,
    plan: record.plan as string,
  };
}

function requiredMedicalSections(kind: ConsultKind): readonly (keyof ClinicalNoteFields)[] {
  return kind === "Medical chart review"
    ? ["assessment", "plan"]
    : ["subjective", "objective", "assessment", "plan"];
}

async function scope(clientId: string) {
  const client = await readClientCareScope(clientId);
  if (!client) return null;
  return {
    client,
    subject: {
      coachId: client.assignedCoachId ?? undefined,
      providerId: client.assignedProviderId ?? undefined,
      locationId: client.locationId ?? undefined,
    },
  };
}

async function safeScope(clientId: string) {
  try {
    return { ok: true as const, value: await scope(clientId) };
  } catch (err) {
    return {
      ok: false as const,
      res: unavailable(
        "consult.scope",
        err,
        "The patient assignment store is unavailable. No note was read or changed.",
      ),
    };
  }
}

export async function GET(req: Request) {
  if (!(await currentPrincipal())) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "clientId is required." }, { status: 400 });
  }
  const loaded = await safeScope(clientId);
  if (!loaded.ok) return loaded.res;
  const s = loaded.value;
  if (!s) return NextResponse.json({ ok: false, error: "Unknown client." }, { status: 404 });

  const g = await guard("write:consult", s.subject);
  if (!g.ok) return g.res;

  try {
    const draft = await getConsultDraft(g.actor.id, clientId);
    return NextResponse.json({
      ok: true,
      authorRole: g.actor.role,
      allowedKinds: consultKindsForRole(g.actor.role),
      allowedChannels: consultChannelsForRole(g.actor.role),
      suggestedKind: defaultConsultKind(g.actor.role),
      suggestedChannel: defaultConsultChannel(g.actor.role),
      draft: draft
        ? {
            ...draft,
            kind: consultKindForRole(draft.kind, g.actor.role),
            channel: consultChannelForRole(draft.channel, g.actor.role),
          }
        : null,
    });
  } catch (err) {
    return unavailable("consult.draft", err, 'The draft store is unavailable. Your notes are not backed up.');
  }
}

export async function PUT(req: Request) {
  if (!(await currentPrincipal())) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }
  let body: {
    clientId?: string;
    kind?: unknown;
    channel?: unknown;
    rawNotes?: string;
    clinicalNote?: unknown;
    aiSummary?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed body." }, { status: 400 });
  }
  if (!body.clientId || typeof body.rawNotes !== "string") {
    return NextResponse.json({ ok: false, error: "clientId and rawNotes are required." }, { status: 400 });
  }

  // Validate the role-bound note shape before touching the patient record.
  // This keeps malformed/forbidden requests deterministic while the database
  // is unavailable, without ever falling back to a seeded patient assignment.
  const roleGate = await guard("write:consult");
  if (!roleGate.ok) return roleGate.res;

  const kind = body.kind === undefined ? defaultConsultKind(roleGate.actor.role) : body.kind;
  const channel = body.channel === undefined ? defaultConsultChannel(roleGate.actor.role) : body.channel;
  if (
    !isConsultKindAllowedForRole(kind, roleGate.actor.role) ||
    !isConsultChannelAllowedForRole(channel, roleGate.actor.role)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          roleGate.actor.role === "Medical"
            ? "Medical notes must use a clinical visit or chart-review type. Messaging remains with the coach."
            : "Coach notes must use a member-contact consult type and channel.",
      },
      { status: 400 },
    );
  }

  const clinicalNote = parseClinicalNote(body.clinicalNote);
  if (body.clinicalNote !== undefined && !clinicalNote) {
    return NextResponse.json(
      { ok: false, error: "clinicalNote must contain Subjective, Objective, Assessment, and Plan text fields." },
      { status: 400 },
    );
  }
  if (roleGate.actor.role !== "Medical" && clinicalNote) {
    return NextResponse.json(
      { ok: false, error: "Only Medical staff can author the clinical SOAP record." },
      { status: 403 },
    );
  }

  const loaded = await safeScope(body.clientId);
  if (!loaded.ok) return loaded.res;
  const s = loaded.value;
  if (!s) return NextResponse.json({ ok: false, error: "Unknown client." }, { status: 404 });

  const g = await guard("write:consult", s.subject);
  if (!g.ok) return g.res;

  try {
    const saved = await upsertConsultDraft({
      clientId: body.clientId,
      authorId: g.actor.id,
      kind,
      channel,
      rawNotes: body.rawNotes,
      clinicalNote: clinicalNote ?? undefined,
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
  const loaded = await safeScope(body.clientId);
  if (!loaded.ok) return loaded.res;
  const s = loaded.value;
  if (!s) return NextResponse.json({ ok: false, error: "Unknown client." }, { status: 404 });

  const g = await guard("write:consult", s.subject);
  if (!g.ok) return g.res;

  try {
    // Old unsigned drafts predate the steward workflow and may carry a
    // provider-visit/client channel combination. Upgrade that draft before it
    // can be signed; signed historical records are never rewritten.
    const draft = await getConsultDraft(g.actor.id, body.clientId);
    if (!draft) {
      return NextResponse.json(
        { ok: false, error: "No draft to sign — it may already be signed." },
        { status: 409 },
      );
    }
    const kind = consultKindForRole(draft.kind, g.actor.role);
    const channel = consultChannelForRole(draft.channel, g.actor.role);
    if (!draft.rawNotes.trim()) {
      return NextResponse.json(
        { ok: false, error: "Add the encounter narrative before signing." },
        { status: 422 },
      );
    }
    if (g.actor.role === "Medical") {
      const missing = requiredMedicalSections(kind).filter(
        (field) => !draft.clinicalNote[field].trim(),
      );
      if (missing.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `Complete the Medical note before signing: ${missing.join(", ")}.`,
          },
          { status: 422 },
        );
      }
    }
    if (kind !== draft.kind || channel !== draft.channel) {
      await upsertConsultDraft({
        clientId: body.clientId,
        authorId: g.actor.id,
        kind,
        channel,
        rawNotes: draft.rawNotes,
        clinicalNote: draft.clinicalNote,
        aiSummary: draft.aiSummary,
        at: new Date().toISOString(),
      });
    }
    const result = await signConsultDraft({
      authorId: g.actor.id,
      clientId: body.clientId,
      signedBy: g.actor.id,
      signerName: g.principal.name ?? g.actor.id,
      actorRole: g.actor.role,
      signerCredential: g.principal.credentials ?? undefined,
      attestation: body.attestation?.trim() || DEFAULT_ATTESTATION,
      subjectName: `${s.client.preferredName || s.client.firstName} ${s.client.lastName}`,
      locationId: s.client.locationId ?? "unresolved",
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
