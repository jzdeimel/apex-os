import { and, eq, inArray, ne } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  appointment,
  client,
  contactEntry,
  labObservation,
  labResult,
  membership,
  sale,
} from "@/lib/db/schema";

export interface InsightScope {
  actorId: string;
  accessProfile: string;
  locationIds: string[];
}

function patientScope(scope: InsightScope) {
  if (scope.accessProfile === "coach") return eq(client.assignedCoachId, scope.actorId);
  if (scope.accessProfile === "provider" || scope.accessProfile === "nursing") {
    return eq(client.assignedProviderId, scope.actorId);
  }
  if (scope.locationIds.length) return inArray(client.homeLocationId, scope.locationIds);
  return undefined;
}

/**
 * A factual win-back queue. Candidates must have an inactive chart or a
 * terminal membership; an arbitrary gap in messages never labels an active
 * patient "lapsed."
 */
export async function readWinbackCandidates(scope: InsightScope) {
  const db = requireDb();
  const scoped = patientScope(scope);
  const patients = await db
    .select({
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      preferredName: client.preferredName,
      status: client.status,
      assignedCoachId: client.assignedCoachId,
      homeLocationId: client.homeLocationId,
      createdAt: client.createdAt,
    })
    .from(client)
    .where(
      scoped
        ? and(eq(client.synthetic, false), scoped)
        : eq(client.synthetic, false),
    );
  if (!patients.length) return [];
  const ids = patients.map((row) => row.id);
  const [memberships, contacts, sales, appointments] = await Promise.all([
    db
      .select()
      .from(membership)
      .where(inArray(membership.clientId, ids)),
    db
      .select({
        clientId: contactEntry.clientId,
        at: contactEntry.at,
      })
      .from(contactEntry)
      .where(inArray(contactEntry.clientId, ids)),
    db
      .select({
        clientId: sale.clientId,
        at: sale.occurredAt,
        totalCents: sale.totalCents,
      })
      .from(sale)
      .where(inArray(sale.clientId, ids)),
    db
      .select({
        clientId: appointment.clientId,
        startAt: appointment.startAt,
        status: appointment.status,
      })
      .from(appointment)
      .where(inArray(appointment.clientId, ids)),
  ]);

  const now = new Date();
  const terminal = new Set(["cancelled", "canceled", "expired", "ended", "inactive"]);
  const byPatient = new Map<
    string,
    {
      membershipStatus: string | null;
      membershipEndedAt: Date | null;
      lastContactAt: Date | null;
      lastSaleAt: Date | null;
      lifetimeValueCents: number;
      hasFutureVisit: boolean;
    }
  >();
  for (const person of patients) {
    byPatient.set(person.id, {
      membershipStatus: null,
      membershipEndedAt: null,
      lastContactAt: null,
      lastSaleAt: null,
      lifetimeValueCents: 0,
      hasFutureVisit: false,
    });
  }
  for (const row of memberships) {
    const item = byPatient.get(row.clientId);
    if (!item) continue;
    if (!item.membershipStatus || row.updatedAt > (item.membershipEndedAt ?? new Date(0))) {
      item.membershipStatus = row.status;
      item.membershipEndedAt = row.cancelledAt ?? row.updatedAt;
    }
  }
  for (const row of contacts) {
    const item = byPatient.get(row.clientId);
    if (item && (!item.lastContactAt || row.at > item.lastContactAt)) item.lastContactAt = row.at;
  }
  for (const row of sales) {
    const item = byPatient.get(row.clientId);
    if (!item) continue;
    item.lifetimeValueCents += row.totalCents;
    if (!item.lastSaleAt || row.at > item.lastSaleAt) item.lastSaleAt = row.at;
  }
  for (const row of appointments) {
    const item = byPatient.get(row.clientId);
    if (
      item &&
      row.startAt > now &&
      !["cancelled", "canceled", "no show"].includes(row.status.toLowerCase())
    ) {
      item.hasFutureVisit = true;
    }
  }

  return patients
    .map((person) => {
      const facts = byPatient.get(person.id)!;
      const chartInactive = person.status.toLowerCase() !== "active";
      const membershipInactive = facts.membershipStatus
        ? terminal.has(facts.membershipStatus.toLowerCase())
        : false;
      if ((!chartInactive && !membershipInactive) || facts.hasFutureVisit) return null;
      const lastActivity = [facts.lastContactAt, facts.lastSaleAt, facts.membershipEndedAt]
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? person.createdAt;
      const daysSinceActivity = Math.max(
        0,
        Math.floor((now.getTime() - lastActivity.getTime()) / 86_400_000),
      );
      // Recency is the primary ordering signal. Spend only breaks close ties.
      const winnability = Math.max(
        0,
        Math.min(
          100,
          100 - Math.floor(daysSinceActivity / 4) +
            Math.min(15, Math.floor(Math.max(0, facts.lifetimeValueCents) / 100_000)),
        ),
      );
      return {
        ...person,
        ...facts,
        lastActivity,
        daysSinceActivity,
        winnability,
        trigger: membershipInactive
          ? `Membership ${facts.membershipStatus}`
          : `Patient status ${person.status}`,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort(
      (a, b) =>
        b.winnability - a.winnability ||
        b.lifetimeValueCents - a.lifetimeValueCents,
    );
}

/** Aggregate current, non-preliminary observations over an authorized cohort. */
export async function readPopulationInsights(scope: InsightScope) {
  const db = requireDb();
  const scoped = patientScope(scope);
  const patients = await db
    .select({
      id: client.id,
      status: client.status,
      locationId: client.homeLocationId,
    })
    .from(client)
    .where(
      scoped
        ? and(eq(client.synthetic, false), scoped)
        : eq(client.synthetic, false),
    );
  if (!patients.length) {
    return { patients: 0, withLabs: 0, markers: [], flagCounts: {} as Record<string, number> };
  }
  const ids = patients.map((row) => row.id);
  const observations = await db
    .select({
      clientId: labResult.clientId,
      resultId: labResult.id,
      resultedAt: labResult.resultedAt,
      marker: labObservation.name,
      flag: labObservation.flag,
    })
    .from(labObservation)
    .innerJoin(labResult, eq(labObservation.labResultId, labResult.id))
    .where(
      and(
        inArray(labResult.clientId, ids),
        ne(labResult.status, "preliminary"),
      ),
    );

  // Keep the newest result per patient/marker so repeat testing does not make
  // one frequently monitored patient count five times.
  const latest = new Map<string, (typeof observations)[number]>();
  for (const row of observations) {
    const key = `${row.clientId}\u0000${row.marker}`;
    const previous = latest.get(key);
    if (!previous || row.resultedAt > previous.resultedAt) latest.set(key, row);
  }
  const withLabs = new Set<string>();
  const markers = new Map<string, { total: number; abnormal: number; critical: number }>();
  const flagCounts: Record<string, number> = {};
  for (const row of latest.values()) {
    withLabs.add(row.clientId);
    flagCounts[row.flag] = (flagCounts[row.flag] ?? 0) + 1;
    const marker = markers.get(row.marker) ?? { total: 0, abnormal: 0, critical: 0 };
    marker.total += 1;
    const flag = row.flag.toLowerCase();
    if (!["normal", "optimal", "within reference"].includes(flag)) marker.abnormal += 1;
    if (["critical", "critical-high", "critical-low"].includes(flag)) marker.critical += 1;
    markers.set(row.marker, marker);
  }
  return {
    patients: patients.length,
    withLabs: withLabs.size,
    flagCounts,
    markers: [...markers.entries()]
      .map(([name, counts]) => ({
        name,
        ...counts,
        abnormalRate: counts.total ? counts.abnormal / counts.total : 0,
      }))
      .sort((a, b) => b.abnormalRate - a.abnormalRate || b.total - a.total)
      .slice(0, 20),
  };
}
