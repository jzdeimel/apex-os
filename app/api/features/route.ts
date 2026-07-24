import { NextResponse } from "next/server";

import { guard } from "@/lib/auth/guard";
import { setFeatureFlag, clearFeatureFlag } from "@/lib/db/repo";
import { flagAdminView } from "@/lib/features/server";
import { featureDef, isFeatureKey } from "@/lib/features/catalog";
import { nowIso } from "@/lib/clock";

export const dynamic = "force-dynamic";

/**
 * The owner console's write path for feature flags.
 *
 * AUTHORITY. Gated on `admin:roles` — the capability that already means "may
 * change what someone else is allowed to do", which is exactly what a flag
 * scoped to a role or a staff member does. Deliberately NOT a new capability:
 * inventing `admin:features` would let it be granted to someone who cannot
 * change roles, and the two powers are the same power wearing different words.
 *
 * VALIDATION IS TOTAL. Key, scope and target are all checked before anything is
 * written. An unknown key would create a row nothing reads — a setting an owner
 * believes they made, that has no effect, and that nobody can find later.
 */

const SCOPES = new Set(["global", "role", "location", "staff", "client"]);

export async function GET() {
  const g = await guard("admin:roles");
  if (!g.ok) return g.res;
  return NextResponse.json({ ok: true, ...(await flagAdminView()) });
}

export async function POST(req: Request) {
  const g = await guard("admin:roles");
  if (!g.ok) return g.res;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  const {
    key,
    scope,
    targetId = "*",
    enabled,
    reason,
    clear,
  } = (body ?? {}) as {
    key?: string;
    scope?: string;
    targetId?: string;
    enabled?: boolean;
    reason?: string;
    clear?: boolean;
  };

  if (typeof key !== "string" || !isFeatureKey(key)) {
    return NextResponse.json(
      { ok: false, error: "Unknown feature key. See lib/features/catalog.ts." },
      { status: 400 },
    );
  }
  const definition = featureDef(key);
  if (enabled === true && definition.availableInShared === false) {
    return NextResponse.json(
      {
        ok: false,
        error:
          definition.unavailableReason ||
          "This feature is withheld from shared Apex until its operational controls are complete.",
      },
      { status: 409 },
    );
  }
  if (typeof scope !== "string" || !SCOPES.has(scope)) {
    return NextResponse.json({ ok: false, error: "Unknown scope." }, { status: 400 });
  }
  if (typeof targetId !== "string" || targetId.length === 0) {
    return NextResponse.json({ ok: false, error: "targetId is required." }, { status: 400 });
  }
  // Global is the only scope with a sentinel target, and it must BE the
  // sentinel — a global row with a real-looking target would never match.
  if (scope === "global" && targetId !== "*") {
    return NextResponse.json(
      { ok: false, error: "Global scope must use targetId '*'." },
      { status: 400 },
    );
  }
  if (scope !== "global" && targetId === "*") {
    return NextResponse.json(
      { ok: false, error: "'*' is reserved for global scope." },
      { status: 400 },
    );
  }

  const actor = {
    actorId: g.actor.id,
    actorName: g.principal.name,
    actorRole: g.actor.role,
    at: nowIso(),
  };

  try {
    if (clear === true) {
      const res = await clearFeatureFlag({ key, scope, targetId, ...actor });
      return NextResponse.json({
        ok: true,
        cleared: res !== null,
        ledgerId: res?.ledger.id ?? null,
      });
    }

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "enabled must be true or false (or pass clear:true)." },
        { status: 400 },
      );
    }

    const res = await setFeatureFlag({ key, scope, targetId, enabled, reason, ...actor });
    return NextResponse.json({ ok: true, ledgerId: res.ledger.id, hash: res.ledger.hash });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Write failed." },
      { status: 500 },
    );
  }
}
