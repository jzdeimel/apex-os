import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  doseLog,
  memberDay,
  memberPrefs,
  membership,
} from "@/lib/db/schema";

/**
 * Patient-facing experience data. Every query is scoped from an authenticated
 * patient session by the caller; this repository does not accept an email,
 * search term, or arbitrary list of client ids.
 */
export async function readPatientExperience(
  clientId: string,
  sinceDate: string,
) {
  const db = requireDb();
  const [days, doses, preferences, memberships] = await Promise.all([
    db
      .select()
      .from(memberDay)
      .where(and(eq(memberDay.clientId, clientId), gte(memberDay.date, sinceDate)))
      .orderBy(desc(memberDay.date)),
    db
      .select()
      .from(doseLog)
      .where(and(eq(doseLog.clientId, clientId), gte(doseLog.date, sinceDate)))
      .orderBy(desc(doseLog.date)),
    db
      .select()
      .from(memberPrefs)
      .where(eq(memberPrefs.clientId, clientId))
      .limit(1),
    db
      .select()
      .from(membership)
      .where(
        and(
          eq(membership.clientId, clientId),
          inArray(membership.status, ["active", "paused", "past_due"]),
        ),
      )
      .orderBy(desc(membership.updatedAt))
      .limit(1),
  ]);

  return {
    days,
    doses,
    preferences: preferences[0] ?? {
      clientId,
      gamificationEnabled: true,
      leaderboardOptIn: false,
      communityOptIn: false,
      notificationPrefs: null,
      quietHoursStart: 21,
      quietHoursEnd: 8,
      updatedAt: null,
    },
    membership: memberships[0] ?? null,
  };
}
