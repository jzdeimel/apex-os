import { BRAND } from "@/lib/brand";
import {
  emergencyCardSnapshot,
  readEmergencyCard,
} from "@/lib/db/repo";
import { isFeatureEnabledFor } from "@/lib/features/server";
import { tokenSha256 } from "@/lib/auth/patientTokens";

export const CARD_DISCLAIMER =
  "This is a current emergency summary the patient chose to share, not a prescription. It never lists amounts. Call Alpha Health to confirm anything on it before acting.";

export type CardStaleness = "current" | "aging" | "stale";

export type AuthoritativeEmergencyCard = {
  cardId: string;
  name: string;
  mrn: string;
  dateOfBirth: string | null;
  age: number | null;
  sex: string | null;
  prescribed: Array<{ name: string; route?: string }>;
  allergies: string[];
  allergiesRecorded: boolean;
  noKnownAllergies: boolean;
  riskFlags: Array<{ label: string; detail: string }>;
  careTeam: {
    provider: { name: string; credentials: string | null } | null;
    coach: { name: string; credentials: string | null } | null;
    location: {
      name: string;
      address: string;
    } | null;
    phone: string;
  };
  generatedOn: string;
  expiresOn: string;
  sourcedOn: string;
  daysOld: number;
  staleness: CardStaleness;
  stalenessNote: string;
};

function ageOn(dateOfBirth: string | null, now: Date) {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.getTime()) || dob > now) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() &&
      now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function staleness(daysOld: number, expiresAt: Date) {
  const hoursToExpiry = (expiresAt.getTime() - Date.now()) / 3_600_000;
  if (hoursToExpiry <= 24) {
    return {
      level: "aging" as const,
      note: "This link expires within 24 hours. Confirm the current record with Alpha Health.",
    };
  }
  if (daysOld > 7) {
    return {
      level: "aging" as const,
      note: `This summary was issued ${daysOld} days ago. Confirm it with Alpha Health before relying on it.`,
    };
  }
  return {
    level: "current" as const,
    note:
      daysOld === 0
        ? "Issued today from the current Apex record."
        : `Issued ${daysOld} day${daysOld === 1 ? "" : "s"} ago from the Apex record.`,
  };
}

export async function authoritativeEmergencyCardForToken(
  token: string,
  context: { ip?: string; userAgent?: string },
): Promise<AuthoritativeEmergencyCard | null> {
  if (token.length < 32 || token.length > 256) return null;
  const now = new Date();
  const grant = await readEmergencyCard(
    tokenSha256(token),
    now.toISOString(),
    context,
  );
  if (!grant) return null;
  if (
    !(await isFeatureEnabledFor("emergency-card", {
      clientId: grant.clientId,
    }))
  ) {
    return null;
  }
  const snapshot = await emergencyCardSnapshot(grant.clientId);
  if (!snapshot) return null;

  const daysOld = Math.max(
    0,
    Math.floor((now.getTime() - grant.createdAt.getTime()) / 86_400_000),
  );
  const stale = staleness(daysOld, grant.expiresAt);
  const allergies = snapshot.allergies
    .filter((row) => !row.noKnownAllergies)
    .map((row) =>
      [row.substance, row.reaction, row.severity !== "unknown" ? row.severity : null]
        .filter(Boolean)
        .join(" · "),
    );
  const noKnownAllergies = snapshot.allergies.some(
    (row) => row.noKnownAllergies,
  );
  const prescribed = [
    ...snapshot.medications.map((row) => ({
      name: row.external ? `${row.name} (patient-reported)` : row.name,
    })),
    ...snapshot.prescriptions.map((row) => ({
      // The prescription table currently owns the exact SKU but not a
      // denormalized display claim. Showing the recorded identifier is safer
      // than expanding it through the old code catalog.
      name: row.sku,
    })),
  ].filter(
    (row, index, all) =>
      all.findIndex(
        (candidate) => candidate.name.toLowerCase() === row.name.toLowerCase(),
      ) === index,
  );
  const locationAddress = snapshot.location
    ? [
        snapshot.location.address1,
        snapshot.location.city,
        snapshot.location.state,
        snapshot.location.zip,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  return {
    cardId: grant.cardId,
    name: `${snapshot.patient.preferredName || snapshot.patient.firstName} ${snapshot.patient.lastName}`,
    mrn: snapshot.patient.mrn,
    dateOfBirth: snapshot.patient.dateOfBirth,
    age: ageOn(snapshot.patient.dateOfBirth, now),
    sex: snapshot.patient.sex,
    prescribed,
    allergies,
    allergiesRecorded: snapshot.allergies.length > 0,
    noKnownAllergies,
    riskFlags: snapshot.problems.map((row) => ({
      label: row.label,
      detail: row.icd10 ? `Recorded diagnosis · ${row.icd10}` : "Active problem on the Apex chart",
    })),
    careTeam: {
      provider: snapshot.provider
        ? {
            name: snapshot.provider.name,
            credentials: snapshot.provider.credentials,
          }
        : null,
      coach: snapshot.coach
        ? {
            name: snapshot.coach.name,
            credentials: snapshot.coach.credentials,
          }
        : null,
      location: snapshot.location
        ? { name: snapshot.location.name, address: locationAddress }
        : null,
      phone: BRAND.telehealthPhone,
    },
    generatedOn: grant.createdAt.toISOString(),
    expiresOn: grant.expiresAt.toISOString(),
    sourcedOn: snapshot.sourcedAt.toISOString(),
    daysOld,
    staleness: stale.level,
    stalenessNote: stale.note,
  };
}
