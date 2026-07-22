import { and, eq, gt, isNull } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  client,
  patientIdentity,
  patientMagicLink,
  patientSession,
} from "@/lib/db/schema";
import {
  MAGIC_LINK_TTL_MS,
  PATIENT_SESSION_TTL_MS,
  authRecordId,
  normalizePatientEmail,
  opaqueToken,
  tokenSha256,
} from "@/lib/auth/patientTokens";

export interface PatientSessionSubject {
  identityId: string;
  clientId: string;
  email: string;
  firstName: string;
  lastName: string;
  expiresAt: Date;
}

/**
 * Explicitly enable one imported client for the portal and issue a single-use
 * pilot link. This never searches by a public email address, so it cannot be
 * used for account enumeration.
 */
export async function issuePatientMagicLink(
  clientId: string,
  issuedBy: string,
  now = new Date(),
) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    const [person] = await tx
      .select({ id: client.id, email: client.email, status: client.status })
      .from(client)
      .where(eq(client.id, clientId))
      .limit(1);
    if (!person || person.status !== "active") throw new Error("Client is not eligible for portal access.");
    if (!person.email) throw new Error("Client has no email address for portal identity.");

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
  const [row] = await db
    .select({
      identityId: patientIdentity.id,
      clientId: client.id,
      email: patientIdentity.emailNormalized,
      firstName: client.firstName,
      lastName: client.lastName,
      expiresAt: patientSession.expiresAt,
    })
    .from(patientSession)
    .innerJoin(patientIdentity, eq(patientSession.identityId, patientIdentity.id))
    .innerJoin(client, eq(patientIdentity.clientId, client.id))
    .where(
      and(
        eq(patientSession.tokenSha256, tokenSha256(rawToken)),
        isNull(patientSession.revokedAt),
        gt(patientSession.expiresAt, now),
        eq(patientIdentity.status, "active"),
        eq(client.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function revokePatientSession(rawToken: string | null | undefined, now = new Date()) {
  if (!rawToken) return;
  const db = requireDb();
  await db
    .update(patientSession)
    .set({ revokedAt: now })
    .where(and(eq(patientSession.tokenSha256, tokenSha256(rawToken)), isNull(patientSession.revokedAt)));
}
