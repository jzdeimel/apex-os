import { and, asc, desc, eq, gt, inArray, isNull, notInArray } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  appointment,
  client,
  clinicLocation,
  message,
  patientIdentity,
  patientMagicLink,
  patientSession,
  signedDocument,
  staff,
  staffPatientLink,
} from "@/lib/db/schema";
import {
  MAGIC_LINK_TTL_MS,
  PATIENT_SESSION_IDLE_TTL_MS,
  PATIENT_SESSION_TTL_MS,
  authRecordId,
  normalizePatientEmail,
  opaqueToken,
  tokenSha256,
} from "@/lib/auth/patientTokens";
import { staffPatientPilotPolicy } from "@/lib/auth/pilotPolicy";

export interface PatientSessionSubject {
  identityId: string;
  clientId: string;
  email: string;
  firstName: string;
  lastName: string;
  expiresAt: Date;
}

export interface PatientPortalSummary {
  patient: {
    id: string;
    firstName: string;
    preferredName: string | null;
    homeLocation: string | null;
    timezone: string;
  };
  careTeam: Array<{
    id: string;
    name: string;
    title: string | null;
    role: string;
    relationship: "coach" | "provider";
  }>;
  appointments: Array<{
    id: string;
    visitType: string;
    modality: string;
    startAt: Date;
    endAt: Date;
    status: string;
    locationName: string | null;
    staffName: string | null;
  }>;
  messages: Array<{
    id: string;
    thread: string;
    senderKind: string;
    body: string;
    sentAt: Date;
    readAt: Date | null;
    escalationId: string | null;
  }>;
  signedDocuments: Array<{
    id: string;
    title: string;
    version: string;
    signedAt: Date;
  }>;
}

/**
 * Explicitly enable one imported client for the portal and issue a single-use
 * pilot link. This never searches by a public email address, so it cannot be
 * used for account enumeration.
 */
export async function issuePatientMagicLink(
  clientId: string,
  issuedBy: string,
  staffId?: string,
  now = new Date(),
) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    const [person] = await tx
      .select({ id: client.id, email: client.email, status: client.status, synthetic: client.synthetic })
      .from(client)
      .where(eq(client.id, clientId))
      .limit(1);
    if (!person || person.status !== "active") throw new Error("Client is not eligible for portal access.");
    if (!person.email) throw new Error("Client has no email address for portal identity.");

    let linkedStaff: { id: string; active: boolean } | undefined;
    if (staffId) {
      [linkedStaff] = await tx
        .select({ id: staff.id, active: staff.active })
        .from(staff)
        .where(eq(staff.id, staffId))
        .limit(1);
    }
    const policyProblem = staffPatientPilotPolicy({
      clientSynthetic: person.synthetic,
      staffId,
      staffActive: linkedStaff?.active,
    });
    if (policyProblem) throw new Error(policyProblem);
    if (staffId) {
      const [existingLink] = await tx
        .select({ staffId: staffPatientLink.staffId })
        .from(staffPatientLink)
        .where(eq(staffPatientLink.clientId, person.id))
        .limit(1);
      if (existingLink && existingLink.staffId !== staffId) {
        throw new Error("This synthetic client is already linked to another staff identity.");
      }
      if (!existingLink) {
        await tx.insert(staffPatientLink).values({
          staffId,
          clientId: person.id,
          createdBy: issuedBy,
        });
      }
    }

    const email = normalizePatientEmail(person.email);
    await tx
      .insert(patientIdentity)
      .values({
        id: authRecordId("identity"),
        clientId: person.id,
        emailNormalized: email,
        status: "active",
      })
      .onConflictDoNothing({ target: patientIdentity.clientId });
    const [identity] = await tx
      .select({ id: patientIdentity.id, status: patientIdentity.status })
      .from(patientIdentity)
      .where(eq(patientIdentity.clientId, person.id))
      .limit(1);
    if (!identity || identity.status !== "active") throw new Error("Patient identity is not active.");

    const rawToken = opaqueToken();
    const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS);
    await tx.insert(patientMagicLink).values({
      id: authRecordId("link"),
      identityId: identity.id,
      tokenSha256: tokenSha256(rawToken),
      createdAt: now,
      expiresAt,
      issuedBy,
    });
    return { rawToken, expiresAt };
  });
}

/** Atomically consume the link and create a hash-only browser session. */
export async function exchangePatientMagicLink(
  rawToken: string,
  userAgent: string | null,
  now = new Date(),
) {
  if (rawToken.length < 32 || rawToken.length > 256) return null;
  const db = requireDb();
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(patientMagicLink)
      .set({ usedAt: now })
      .where(
        and(
          eq(patientMagicLink.tokenSha256, tokenSha256(rawToken)),
          isNull(patientMagicLink.usedAt),
          gt(patientMagicLink.expiresAt, now),
        ),
      )
      .returning({ identityId: patientMagicLink.identityId });
    if (!claimed) return null;

    const [identity] = await tx
      .select({ id: patientIdentity.id, status: patientIdentity.status })
      .from(patientIdentity)
      .where(eq(patientIdentity.id, claimed.identityId))
      .limit(1);
    if (!identity || identity.status !== "active") return null;

    const sessionToken = opaqueToken();
    const expiresAt = new Date(now.getTime() + PATIENT_SESSION_TTL_MS);
    await tx.insert(patientSession).values({
      id: authRecordId("session"),
      identityId: identity.id,
      tokenSha256: tokenSha256(sessionToken),
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      userAgentSha256: userAgent ? tokenSha256(userAgent) : null,
    });
    return { sessionToken, expiresAt };
  });
}

export async function patientSubjectForToken(
  rawToken: string | null | undefined,
  now = new Date(),
): Promise<PatientSessionSubject | null> {
  if (!rawToken) return null;
  const db = requireDb();
  const idleCutoff = new Date(now.getTime() - PATIENT_SESSION_IDLE_TTL_MS);
  return db.transaction(async (tx) => {
    // The conditional update is the session claim: an absolute-expired,
    // revoked, or idle-expired session cannot be refreshed back to life.
    const [activeSession] = await tx
      .update(patientSession)
      .set({ lastSeenAt: now })
      .where(
        and(
          eq(patientSession.tokenSha256, tokenSha256(rawToken)),
          isNull(patientSession.revokedAt),
          gt(patientSession.expiresAt, now),
          gt(patientSession.lastSeenAt, idleCutoff),
        ),
      )
      .returning({ identityId: patientSession.identityId, expiresAt: patientSession.expiresAt });
    if (!activeSession) return null;

    const [row] = await tx
      .select({
        identityId: patientIdentity.id,
        clientId: client.id,
        email: patientIdentity.emailNormalized,
        firstName: client.firstName,
        lastName: client.lastName,
      })
      .from(patientIdentity)
      .innerJoin(client, eq(patientIdentity.clientId, client.id))
      .where(
        and(
          eq(patientIdentity.id, activeSession.identityId),
          eq(patientIdentity.status, "active"),
          eq(client.status, "active"),
        ),
      )
      .limit(1);
    return row ? { ...row, expiresAt: activeSession.expiresAt } : null;
  });
}

/**
 * The patient pilot read model. Every row is scoped from the authenticated
 * session's client id; callers cannot supply another patient id from a URL.
 */
export async function patientPortalSummary(
  clientId: string,
  now = new Date(),
): Promise<PatientPortalSummary | null> {
  const db = requireDb();
  const [person] = await db
    .select({
      id: client.id,
      firstName: client.firstName,
      preferredName: client.preferredName,
      assignedCoachId: client.assignedCoachId,
      assignedProviderId: client.assignedProviderId,
      homeLocation: clinicLocation.name,
      timezone: clinicLocation.timezone,
    })
    .from(client)
    .leftJoin(clinicLocation, eq(client.homeLocationId, clinicLocation.id))
    .where(and(eq(client.id, clientId), eq(client.status, "active")))
    .limit(1);
  if (!person) return null;

  const careIds = [...new Set([person.assignedCoachId, person.assignedProviderId].filter((id): id is string => Boolean(id)))];
  const [careRows, appointmentRows, messageRows, documentRows] = await Promise.all([
    careIds.length
      ? db
          .select({ id: staff.id, name: staff.name, title: staff.title, role: staff.role })
          .from(staff)
          .where(and(inArray(staff.id, careIds), eq(staff.active, true)))
      : Promise.resolve([]),
    db
      .select({
        id: appointment.id,
        visitType: appointment.visitType,
        modality: appointment.modality,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        status: appointment.status,
        locationName: clinicLocation.name,
        staffName: staff.name,
      })
      .from(appointment)
      .leftJoin(clinicLocation, eq(appointment.locationId, clinicLocation.id))
      .leftJoin(staff, eq(appointment.staffId, staff.id))
      .where(
        and(
          eq(appointment.clientId, clientId),
          gt(appointment.endAt, now),
          notInArray(appointment.status, ["Cancelled", "Canceled", "No Show"]),
        ),
      )
      .orderBy(asc(appointment.startAt))
      .limit(5),
    db
      .select({
        id: message.id,
        thread: message.thread,
        senderKind: message.senderKind,
        body: message.body,
        sentAt: message.sentAt,
        readAt: message.readAt,
        escalationId: message.escalationId,
      })
      .from(message)
      .where(eq(message.clientId, clientId))
      .orderBy(desc(message.sentAt))
      .limit(100),
    db
      .select({
        id: signedDocument.id,
        title: signedDocument.title,
        version: signedDocument.version,
        signedAt: signedDocument.signedAt,
      })
      .from(signedDocument)
      .where(eq(signedDocument.clientId, clientId))
      .orderBy(desc(signedDocument.signedAt))
      .limit(10),
  ]);

  const careById = new Map(careRows.map((row) => [row.id, row]));
  const careTeam: PatientPortalSummary["careTeam"] = [];
  const coach = person.assignedCoachId ? careById.get(person.assignedCoachId) : undefined;
  const provider = person.assignedProviderId ? careById.get(person.assignedProviderId) : undefined;
  if (coach) careTeam.push({ ...coach, relationship: "coach" });
  if (provider && provider.id !== coach?.id) careTeam.push({ ...provider, relationship: "provider" });

  return {
    patient: {
      id: person.id,
      firstName: person.firstName,
      preferredName: person.preferredName,
      homeLocation: person.homeLocation,
      timezone: person.timezone ?? "America/New_York",
    },
    careTeam,
    appointments: appointmentRows,
    messages: messageRows,
    signedDocuments: documentRows,
  };
}

export async function revokePatientSession(rawToken: string | null | undefined, now = new Date()) {
  if (!rawToken) return;
  const db = requireDb();
  await db
    .update(patientSession)
    .set({ revokedAt: now })
    .where(and(eq(patientSession.tokenSha256, tokenSha256(rawToken)), isNull(patientSession.revokedAt)));
}
