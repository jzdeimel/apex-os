import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/authz/capabilities";
import { nowIso } from "@/lib/clock";
import {
  changeChartFundamentalsWithLedger,
  readChartFundamentals,
  readClientCareScope,
} from "@/lib/db/repo";

export const dynamic = "force-dynamic";

const KINDS = new Set(["allergy", "problem", "medication", "reconcile"]);
const OPERATIONS = new Set(["add", "end", "reconcile"]);
const SEVERITIES = new Set(["mild", "moderate", "severe", "anaphylaxis", "unknown"]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

async function scopeAndGuard(clientId: string, capability: "read:clinical" | "write:clinical-history") {
  const g = await guard(capability);
  if (!g.ok) return { error: g.res } as const;
  const scope = await readClientCareScope(clientId);
  if (!scope || scope.status !== "active") return { error: fail(404, "Unknown active patient.") } as const;
  const decision = can(g.actor, capability, {
    coachId: scope.assignedCoachId ?? undefined,
    providerId: scope.assignedProviderId ?? undefined,
    locationId: scope.locationId ?? undefined,
  });
  if (!decision.allowed) return { error: fail(403, decision.reason) } as const;
  return { scope, g } as const;
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return fail(400, "clientId is required.");
  try {
    const auth = await scopeAndGuard(clientId, "read:clinical");
    if ("error" in auth) return auth.error;
    const fundamentals = await readChartFundamentals(clientId);
    return NextResponse.json({ ok: true, fundamentals, canEdit: auth.g.actor.role === "Medical" });
  } catch (error) {
    return unavailable("chart.fundamentals.list", error, "Chart reconciliation data is temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This chart request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.clientId !== "string" || typeof body.kind !== "string" || typeof body.operation !== "string") {
    return fail(400, "clientId, kind, and operation are required.");
  }
  if (!KINDS.has(body.kind) || !OPERATIONS.has(body.operation)) return fail(400, "Unsupported chart-fundamentals operation.");
  const textFields = ["substance", "reaction", "label", "icd10", "name", "dose", "frequency", "prescriber", "reason"];
  for (const field of textFields) {
    if (body[field] !== undefined && typeof body[field] !== "string") return fail(400, `${field} must be text.`);
    if (typeof body[field] === "string" && body[field].length > 2_000) return fail(400, `${field} is too long.`);
  }
  if (body.operation === "end" && (typeof body.id !== "string" || !body.id || typeof body.reason !== "string" || !body.reason.trim())) {
    return fail(400, "The record id and a correction reason are required.");
  }
  if (body.kind === "allergy" && body.operation === "add" && body.noKnownAllergies !== true && (typeof body.substance !== "string" || !body.substance.trim())) {
    return fail(400, "An allergen is required.");
  }
  if (body.kind === "allergy" && body.severity !== undefined && (typeof body.severity !== "string" || !SEVERITIES.has(body.severity))) return fail(400, "Unknown allergy severity.");
  if (body.kind === "problem" && body.operation === "add" && (typeof body.label !== "string" || !body.label.trim())) return fail(400, "A problem label is required.");
  if (body.kind === "medication" && body.operation === "add" && (typeof body.name !== "string" || !body.name.trim())) return fail(400, "A medication name is required.");

  try {
    const auth = await scopeAndGuard(body.clientId, "write:clinical-history");
    if ("error" in auth) return auth.error;
    if (auth.g.actor.role !== "Medical") return fail(403, "Only Medical can reconcile clinical history.");
    const result = await changeChartFundamentalsWithLedger({
      id: typeof body.id === "string" ? body.id : `cf-${randomUUID()}`,
      clientId: body.clientId,
      kind: body.kind as "allergy" | "problem" | "medication" | "reconcile",
      operation: body.operation as "add" | "end" | "reconcile",
      actorId: auth.g.actor.id,
      actorName: auth.g.principal.name,
      actorRole: auth.g.actor.role,
      at: nowIso(),
      substance: typeof body.substance === "string" ? body.substance : undefined,
      reaction: typeof body.reaction === "string" ? body.reaction : undefined,
      severity: typeof body.severity === "string" ? body.severity : undefined,
      noKnownAllergies: body.noKnownAllergies === true,
      label: typeof body.label === "string" ? body.label : undefined,
      icd10: typeof body.icd10 === "string" ? body.icd10 : undefined,
      onsetOn: typeof body.onsetOn === "string" ? body.onsetOn : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      dose: typeof body.dose === "string" ? body.dose : undefined,
      frequency: typeof body.frequency === "string" ? body.frequency : undefined,
      prescriber: typeof body.prescriber === "string" ? body.prescriber : undefined,
      startedOn: typeof body.startedOn === "string" ? body.startedOn : undefined,
      reason: typeof body.reason === "string" ? body.reason : undefined,
    });
    if (result.status === "missing") return fail(404, "Unknown active patient.");
    if (result.status !== "ok") return fail(result.status === "conflict" ? 409 : 400, result.reason);
    const fundamentals = await readChartFundamentals(body.clientId);
    return NextResponse.json({ ok: true, fundamentals, ledgerId: result.ledger.id });
  } catch (error) {
    return unavailable("chart.fundamentals.change", error, "The chart update was not confirmed. Please retry.");
  }
}
