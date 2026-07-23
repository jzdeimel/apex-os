import { NextResponse } from "next/server";
import { fail, serverError, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { currentPrincipal } from "@/lib/auth/principal";
import { createLeadWithInvite, updateLeadPipeline } from "@/lib/db/repo";
import {
  addLeadNoteWithLedger,
  assignLeadOwnerWithLedger,
  completeLeadTaskWithLedger,
  createLeadTaskWithLedger,
  readLeadWorkQueue,
} from "@/lib/db/crmRepo";
import { intakeEntryPath, mintIntakeToken } from "@/lib/intake/mint";
import { sha256 } from "@/lib/trace/hash";
import { requestIsSameOrigin } from "@/lib/api/origin";
import {
  DEFAULT_FIRST_RESPONSE_MINUTES,
  leadNoteAcceptable,
  leadTaskAcceptable,
} from "@/lib/crm/work";

/**
 * STAFF lead capture — the walk-in desk, and the acquisition read model.
 *
 * POST: a front-desk walk-in. Same durable path as the public form (one
 * transaction creating the lead and its single-use intake invite), but
 * authenticated and attributed: `source` records that a person walked in rather
 * than arriving from the website, which is the difference between knowing your
 * marketing works and guessing.
 *
 * Gated on `write:demographics` — held by Admin, Coach and Medical, which is
 * exactly the set of people who staff a desk. It is deliberately NOT public:
 * the unauthenticated path is /api/public/leads, which is rate-limited and
 * validated for a hostile internet; this one trusts a signed-in colleague.
 *
 * GET: the lead list for the acquisition console. Gated on
 * `read:business-metrics`, deliberately distinct from `read:financial`, which
 * coaches hold so they can discuss a member's own plan costs. Funnel
 * performance across the business is not that.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  track?: string;
  locationId?: string;
  reason?: string;
  /** "walk-in" | "phone" | "referral" | "event" — how they reached us. */
  source?: string;
}

const SOURCES = new Set(["walk-in", "phone", "referral", "event", "website"]);

export async function POST(req: Request) {
  if (!(await currentPrincipal())) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed body." }, { status: 400 });
  }

  const firstName = (body.firstName ?? "").trim();
  const lastName = (body.lastName ?? "").trim();
  const phone = (body.phone ?? "").trim();
  if (!firstName || !lastName) {
    return NextResponse.json({ ok: false, error: "First and last name are required." }, { status: 400 });
  }
  if (phone.replace(/\D/g, "").length < 10) {
    return NextResponse.json(
      { ok: false, error: "A phone number is required — it is how we reach them." },
      { status: 400 },
    );
  }

  // Scoped to the location they walked into, so a desk cannot create leads
  // against a site it does not staff.
  const g = await guard("write:demographics", { locationId: body.locationId });
  if (!g.ok) return g.res;

  const at = new Date().toISOString();
  const minted = mintIntakeToken(at);

  try {
    const { leadId } = await createLeadWithInvite({
      firstName,
      lastName,
      email: (body.email ?? "").trim().toLowerCase() || undefined,
      phone,
      track: body.track,
      preferredLocationId: body.locationId,
      reason: (body.reason ?? "").trim().slice(0, 2000) || undefined,
      source: body.source && SOURCES.has(body.source) ? body.source : "walk-in",
      mode: "coach-guided",
      capturedBy: g.actor.id,
      tokenSha256: sha256(minted.token),
      expiresAt: minted.expiresAt,
      at,
    });

    return NextResponse.json({
      ok: true,
      durable: true,
      leadId,
      // Hand the tablet over, or text this. The raw token exists only here.
      intakePath: intakeEntryPath(minted.token),
      expiresAt: minted.expiresAt,
    });
  } catch (err) {
    return unavailable("leads", err, 'We could not complete that. Please try again.');
  }
}

export async function GET() {
  if (!(await currentPrincipal())) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }
  // read:business-metrics, NOT read:financial. A coach legitimately holds
  // read:financial — they discuss plan costs with their own members — but
  // channel performance across the whole funnel is an ownership question, and
  // "money only on the owner console" has to be enforced by the capability, not
  // by which page happens to call this.
  const g = await guard("read:business-metrics");
  if (!g.ok) return g.res;

  try {
    const queue = await readLeadWorkQueue(500);
    return NextResponse.json({
      ok: true,
      ...queue,
      firstResponseTargetMinutes: DEFAULT_FIRST_RESPONSE_MINUTES,
    });
  } catch (err) {
    return unavailable("leads", err, 'We could not complete that. Please try again.');
  }
}

interface PatchBody {
  leadId?: string;
  action?: "claim" | "release" | "advance" | "assign" | "add-note" | "create-task" | "complete-task";
  toStage?: string;
  note?: string;
  assigneeStaffId?: string | null;
  taskId?: string;
  title?: string;
  dueAt?: string;
}

export async function PATCH(req: Request) {
  if (!requestIsSameOrigin(req)) {
    return NextResponse.json({ ok: false, error: "This CRM action came from an untrusted origin." }, { status: 403 });
  }
  const g = await guard("write:crm");
  if (!g.ok) return g.res;

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed body." }, { status: 400 });
  }

  const leadId = body.leadId?.trim();
  if (!body.action || (!leadId && body.action !== "complete-task")) {
    return NextResponse.json({ ok: false, error: "Lead and action are required." }, { status: 400 });
  }

  try {
    const actor = {
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.accessProfile,
      at: new Date().toISOString(),
    };
    const allowAnyOwner = g.actor.accessProfile === "operations" || g.actor.accessProfile === "owner";
    if (body.action === "add-note") {
      if (!leadNoteAcceptable(body.note)) {
        return NextResponse.json({ ok: false, error: "A note between 2 and 2,000 characters is required." }, { status: 400 });
      }
      const result = await addLeadNoteWithLedger({
        ...actor,
        leadId: leadId!,
        body: body.note,
        allowAnyOwner,
      });
      if (result.status === "missing") return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
      if (result.status === "forbidden") return NextResponse.json({ ok: false, error: "This lead belongs to another owner." }, { status: 403 });
      return NextResponse.json({ ok: true, durable: true, note: result.note, ledgerId: result.ledger.id });
    }
    if (body.action === "create-task") {
      if (!leadTaskAcceptable({ title: body.title, dueAt: body.dueAt }) || !body.assigneeStaffId) {
        return NextResponse.json({ ok: false, error: "Task title, valid due time, and assignee are required." }, { status: 400 });
      }
      const result = await createLeadTaskWithLedger({
        ...actor,
        leadId: leadId!,
        title: body.title!,
        dueAt: body.dueAt!,
        assigneeStaffId: body.assigneeStaffId,
        allowAnyOwner,
      });
      if (result.status === "missing") return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
      if (result.status === "forbidden") return NextResponse.json({ ok: false, error: "This lead belongs to another owner." }, { status: 403 });
      if (result.status === "invalid-assignee") return NextResponse.json({ ok: false, error: "Choose an active CRM team member." }, { status: 400 });
      return NextResponse.json({ ok: true, durable: true, task: result.task, ledgerId: result.ledger.id });
    }
    if (body.action === "complete-task") {
      if (!body.taskId?.trim()) {
        return NextResponse.json({ ok: false, error: "Task is required." }, { status: 400 });
      }
      const result = await completeLeadTaskWithLedger({
        ...actor,
        taskId: body.taskId.trim(),
        completionNote: body.note,
        allowAnyOwner,
      });
      if (result.status === "missing") return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
      if (result.status === "forbidden") return NextResponse.json({ ok: false, error: "This task belongs to another owner." }, { status: 403 });
      if (result.status === "conflict") return NextResponse.json({ ok: false, error: "That task is already complete." }, { status: 409 });
      return NextResponse.json({ ok: true, durable: true, task: result.task, ledgerId: result.ledger.id });
    }
    if (body.action === "assign") {
      if (!body.note?.trim()) {
        return NextResponse.json({ ok: false, error: "A reassignment reason is required." }, { status: 400 });
      }
      const result = await assignLeadOwnerWithLedger({
        ...actor,
        leadId: leadId!,
        assigneeStaffId: body.assigneeStaffId?.trim() || null,
        reason: body.note.slice(0, 1_000),
      });
      if (result.status === "missing") return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
      if (result.status === "invalid-assignee") return NextResponse.json({ ok: false, error: "Choose an active CRM team member." }, { status: 400 });
      if (result.status === "conflict") return NextResponse.json({ ok: false, error: "The owner did not change or the lead changed. Refresh and try again." }, { status: 409 });
      return NextResponse.json({ ok: true, durable: true, lead: result.lead, ledgerId: result.ledger.id });
    }
    const result = await updateLeadPipeline({
      leadId: leadId!,
      action: body.action,
      toStage: body.toStage?.trim(),
      note: body.note,
      ...actor,
    });
    if (result.ok) {
      return NextResponse.json({ ok: true, durable: true, lead: result.lead });
    }

    if (result.reason === "not-found") {
      return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }
    const messages = {
      "already-owned": "This lead is already owned by another staff member.",
      "not-owner": "Only the current owner can release this lead.",
      "invalid-transition": "That pipeline transition is not allowed.",
      conflict: "The lead changed at the same time. Refresh and try again.",
    } as const;
    return NextResponse.json({ ok: false, error: messages[result.reason] }, { status: 409 });
  } catch (err) {
    return unavailable("leads", err, "We could not update this lead. Please try again.");
  }
}
