import type { Principal } from "@/lib/auth/principal";
import type { Actor } from "@/lib/authz/capabilities";
import { staffMap } from "@/lib/mock/staff";

/**
 * Turn an authenticated principal into an authorization Actor.
 *
 * The Actor is what `can()` reasons over — id, role, and the locations the
 * person covers. Role comes from the mapped staff record (never a default), and
 * locationIds come from that same record. An unmapped principal (authenticated,
 * but not a staff member) has no role and therefore is NOT an actor: every write
 * path treats that as "cannot", which is the correct fail-closed answer.
 *
 * The staff lookup still reads the seeded roster (lib/mock/staff) at this stage;
 * when the staff table moves into Postgres (with an entraObjectId column), this
 * function reads it there and nothing downstream changes.
 */
export function actorFromPrincipal(p: Principal): Actor | null {
  if (!p.staffId || !p.role) return null;
  const s = staffMap[p.staffId];
  return {
    id: p.staffId,
    role: p.role,
    locationIds: s?.locationIds ?? [],
  };
}
