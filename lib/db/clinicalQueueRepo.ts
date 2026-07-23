import { and, asc, eq } from "drizzle-orm";

import { requireDb } from "@/lib/db/client";
import { client, consult } from "@/lib/db/schema";

/** Unsigned clinical notes owned by the authenticated author. */
export async function readAuthorSigningQueue(authorId: string) {
  const db = requireDb();
  return db
    .select({
      id: consult.id,
      clientId: consult.clientId,
      patientFirstName: client.firstName,
      patientLastName: client.lastName,
      patientPreferredName: client.preferredName,
      mrn: client.mrn,
      kind: consult.kind,
      channel: consult.channel,
      startedAt: consult.startedAt,
      updatedAt: consult.updatedAt,
      rawNotes: consult.rawNotes,
      subjective: consult.subjective,
      objective: consult.objective,
      assessment: consult.assessment,
      plan: consult.plan,
      locationId: client.homeLocationId,
    })
    .from(consult)
    .innerJoin(client, eq(consult.clientId, client.id))
    .where(and(eq(consult.authorId, authorId), eq(consult.status, "Draft")))
    .orderBy(asc(consult.updatedAt));
}
