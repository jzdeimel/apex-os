import { asc } from "drizzle-orm";

import { requireDb } from "@/lib/db/client";
import {
  appointment,
  client,
  clinicLocation,
  consult,
  ledger,
  staff,
  workTask,
} from "@/lib/db/schema";
import { verifyChain, type LedgerRow } from "@/lib/trace/chain";

type IntegrityProblem = {
  kind: string;
  entity: string;
  count: number;
};

/**
 * Production integrity audit over authoritative Apex records.
 *
 * It deliberately returns aggregate findings rather than patient identifiers.
 * An operator can establish whether a relationship is broken without turning
 * the audit endpoint into a bulk PHI export.
 */
export async function authoritativeIntegrityAudit() {
  const db = requireDb();
  const [clients, staffRows, locations, consults, appointments, tasks, ledgerRows] =
    await Promise.all([
      db
        .select({
          id: client.id,
          assignedCoachId: client.assignedCoachId,
          assignedProviderId: client.assignedProviderId,
          homeLocationId: client.homeLocationId,
        })
        .from(client),
      db.select({ id: staff.id }).from(staff),
      db.select({ id: clinicLocation.id }).from(clinicLocation),
      db
        .select({ id: consult.id, clientId: consult.clientId, authorId: consult.authorId })
        .from(consult),
      db
        .select({
          id: appointment.id,
          clientId: appointment.clientId,
          staffId: appointment.staffId,
          locationId: appointment.locationId,
        })
        .from(appointment),
      db
        .select({
          id: workTask.id,
          clientId: workTask.clientId,
          assigneeStaffId: workTask.assigneeStaffId,
        })
        .from(workTask),
      db.select().from(ledger).orderBy(asc(ledger.seq)),
    ]);

  const clientIds = new Set(clients.map((row) => row.id));
  const staffIds = new Set(staffRows.map((row) => row.id));
  const locationIds = new Set(locations.map((row) => row.id));
  const problems: IntegrityProblem[] = [];
  const add = (kind: string, entity: string, count: number) => {
    if (count > 0) problems.push({ kind, entity, count });
  };

  add(
    "missing-reference",
    "client.assignedCoachId",
    clients.filter((row) => row.assignedCoachId && !staffIds.has(row.assignedCoachId)).length,
  );
  add(
    "missing-reference",
    "client.assignedProviderId",
    clients.filter((row) => row.assignedProviderId && !staffIds.has(row.assignedProviderId)).length,
  );
  add(
    "missing-reference",
    "client.homeLocationId",
    clients.filter((row) => row.homeLocationId && !locationIds.has(row.homeLocationId)).length,
  );
  add(
    "missing-reference",
    "consult.clientId",
    consults.filter((row) => !clientIds.has(row.clientId)).length,
  );
  add(
    "missing-reference",
    "consult.authorId",
    consults.filter((row) => !staffIds.has(row.authorId)).length,
  );
  add(
    "missing-reference",
    "appointment.clientId",
    appointments.filter((row) => !clientIds.has(row.clientId)).length,
  );
  add(
    "missing-reference",
    "appointment.staffId",
    appointments.filter((row) => row.staffId && !staffIds.has(row.staffId)).length,
  );
  add(
    "missing-reference",
    "appointment.locationId",
    appointments.filter((row) => row.locationId && !locationIds.has(row.locationId)).length,
  );
  add(
    "missing-reference",
    "workTask.clientId",
    tasks.filter((row) => row.clientId && !clientIds.has(row.clientId)).length,
  );
  add(
    "missing-reference",
    "workTask.assigneeStaffId",
    tasks.filter((row) => !staffIds.has(row.assigneeStaffId)).length,
  );

  const chainRows = ledgerRows.map(
    (row) =>
      ({
        ...row,
        at: row.at.toISOString(),
        subjectId: row.subjectId ?? undefined,
        subjectName: row.subjectName ?? undefined,
        locationId: row.locationId ?? undefined,
        reason: row.reason ?? undefined,
        before: row.before ?? undefined,
        after: row.after ?? undefined,
      }) as LedgerRow,
  );
  const chain = verifyChain(chainRows);
  if (!chain.ok) problems.push({ kind: "hash-chain", entity: "ledger", count: 1 });

  return {
    ok: problems.length === 0,
    authoritative: true,
    counts: {
      clients: clients.length,
      staff: staffRows.length,
      locations: locations.length,
      consults: consults.length,
      appointments: appointments.length,
      tasks: tasks.length,
      ledgerRows: ledgerRows.length,
    },
    ledgerChain: {
      ok: chain.ok,
      rowsChecked: ledgerRows.length,
    },
    problems,
  };
}
