import type { Principal } from "@/lib/auth/principal";
import type { Actor } from "@/lib/authz/capabilities";

/**
 * Turn an authenticated principal into an authorization Actor.
 *
 * The Actor is what `can()` reasons over — id, role, and the locations the
 * person covers. Role comes from the mapped staff record (never a default), and
 * locationIds come from that same record. An unmapped principal (authenticated,
 * but not a staff member) has no role and therefore is NOT an actor: every write
 * path treats that as "cannot", which is the correct fail-closed answer.
 *
 * The location scope now travels with the principal from the same staff row
 * that supplied the role. Keeping role in the DB but scope in the seeded roster
 * would let a database revocation/deployment drift leave the app authorizing
 * against two different staff records.
 */
export function actorFromPrincipal(p: Principal): Actor | null {
  if (!p.staffId || !p.role) return null;
  return {
    id: p.staffId,
    role: p.role,
    locationIds: p.locationIds,
  };
}
