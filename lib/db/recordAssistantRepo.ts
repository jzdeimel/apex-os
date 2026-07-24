import { and, asc, eq, gte, ilike, inArray, lt, or } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  appointment,
  client,
  clinicLocation,
  staff,
  workTask,
} from "@/lib/db/schema";
import type { Actor } from "@/lib/authz/capabilities";

function patientScope(actor: Actor) {
  if (actor.accessProfile === "coach") return eq(client.assignedCoachId, actor.id);
  if (actor.accessProfile === "provider") return eq(client.assignedProviderId, actor.id);
  if (actor.accessProfile === "front-desk" || actor.accessProfile === "nursing") {
    return actor.locationIds.length
      ? inArray(client.homeLocationId, actor.locationIds)
      : eq(client.id, "__no-scope__");
  }
  return undefined;
}

export type RecordAnswer = {
  answer: string;
  facts: Array<{
    label: string;
    value: string;
    href?: string;
    recordId?: string;
  }>;
  scopeNote: string;
};

export async function answerRecordQuestion(
  query: string,
  actor: Actor,
  now = new Date(),
): Promise<RecordAnswer> {
  const db = requireDb();
  const normalized = query.trim().toLowerCase();
  const scope = patientScope(actor);

  if (/\b(task|to[- ]?do|work queue)\b/.test(normalized)) {
    const tasks = await db
      .select({
        id: workTask.id,
        title: workTask.title,
        priority: workTask.priority,
        dueAt: workTask.dueAt,
        clientId: workTask.clientId,
      })
      .from(workTask)
      .where(
        and(
          eq(workTask.assigneeStaffId, actor.id),
          inArray(workTask.status, ["open", "in_progress"]),
        ),
      )
      .orderBy(asc(workTask.dueAt))
      .limit(10);
    return {
      answer: tasks.length
        ? `You have ${tasks.length} open task${tasks.length === 1 ? "" : "s"} in the first page of your queue.`
        : "You have no open tasks assigned in Apex.",
      facts: tasks.map((task) => ({
        label: `${task.priority} priority`,
        value: `${task.title} · due ${task.dueAt.toLocaleString()}`,
        href: "/tasks",
        recordId: task.id,
      })),
      scopeNote: "Only tasks assigned to your staff identity were queried.",
    };
  }

  if (/\b(schedule|appointment|visit).*(today|tomorrow)?\b/.test(normalized)) {
    const tomorrow = /\btomorrow\b/.test(normalized);
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() + (tomorrow ? 1 : 0));
    day.setUTCHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setUTCDate(end.getUTCDate() + 1);
    const appointments = await db
      .select({
        id: appointment.id,
        startAt: appointment.startAt,
        visitType: appointment.visitType,
        status: appointment.status,
        clientId: appointment.clientId,
        firstName: client.firstName,
        lastName: client.lastName,
        preferredName: client.preferredName,
      })
      .from(appointment)
      .innerJoin(client, eq(appointment.clientId, client.id))
      .where(
        and(
          eq(appointment.staffId, actor.id),
          gte(appointment.startAt, day),
          lt(appointment.startAt, end),
        ),
      )
      .orderBy(asc(appointment.startAt))
      .limit(20);
    return {
      answer: `${appointments.length} appointment${appointments.length === 1 ? "" : "s"} are assigned to you ${tomorrow ? "tomorrow" : "today"} in Apex.`,
      facts: appointments.map((visit) => ({
        label: visit.visitType,
        value: `${visit.startAt.toLocaleString()} · ${visit.preferredName || visit.firstName} ${visit.lastName} · ${visit.status}`,
        href: `/clients/${visit.clientId}`,
        recordId: visit.id,
      })),
      scopeNote: "Only appointments assigned to your staff identity were queried.",
    };
  }

  if (/\b(how many|count).*(patient|client|member)\b/.test(normalized)) {
    const rows = await db
      .select({ id: client.id })
      .from(client)
      .where(
        scope
          ? and(eq(client.status, "active"), eq(client.synthetic, false), scope)
          : and(eq(client.status, "active"), eq(client.synthetic, false)),
      );
    return {
      answer: `${rows.length.toLocaleString()} active, non-synthetic patients are inside your current Apex scope.`,
      facts: [{ label: "Active patients", value: rows.length.toLocaleString(), href: "/clients" }],
      scopeNote: scope
        ? "The count is restricted to your assigned care or clinic scope."
        : "Your job profile permits the organization-wide directory count.",
    };
  }

  const patientMatch = normalized.match(
    /(?:find|search|patient|client|member)\s+(?:for\s+)?(.{2,80})/,
  );
  if (patientMatch) {
    const term = patientMatch[1].replace(/[?.,]+$/g, "").trim();
    const pattern = `%${term.replace(/[%_]/g, "")}%`;
    const rows = await db
      .select({
        id: client.id,
        mrn: client.mrn,
        firstName: client.firstName,
        lastName: client.lastName,
        preferredName: client.preferredName,
        status: client.status,
        locationName: clinicLocation.name,
      })
      .from(client)
      .leftJoin(clinicLocation, eq(client.homeLocationId, clinicLocation.id))
      .where(
        and(
          eq(client.synthetic, false),
          scope,
          or(
            ilike(client.firstName, pattern),
            ilike(client.lastName, pattern),
            ilike(client.preferredName, pattern),
            ilike(client.mrn, pattern),
          ),
        ),
      )
      .orderBy(client.lastName, client.firstName)
      .limit(10);
    return {
      answer: rows.length
        ? `I found ${rows.length} patient${rows.length === 1 ? "" : "s"} in your authorized directory scope.`
        : "No patient matched that name or MRN inside your authorized scope.",
      facts: rows.map((person) => ({
        label: person.mrn,
        value: `${person.preferredName || person.firstName} ${person.lastName} · ${person.status} · ${person.locationName ?? "Clinic unresolved"}`,
        href: `/clients/${person.id}`,
        recordId: person.id,
      })),
      scopeNote: "This is a directory search. Opening a chart performs its own authorization and audit witness.",
    };
  }

  return {
    answer:
      "I can query your live Apex task queue, your schedule for today or tomorrow, the active-patient count in your scope, or find a patient by name or MRN.",
    facts: [
      { label: "Try", value: "What is on my schedule today?" },
      { label: "Try", value: "Show my open tasks." },
      { label: "Try", value: "How many active patients are in my scope?" },
      { label: "Try", value: "Find patient Jordan." },
    ],
    scopeNote:
      "Ask Apex is currently deterministic record retrieval, not a generative clinical model.",
  };
}
