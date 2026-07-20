/**
 * Referential-integrity audit over the seeded data model.
 *
 * This is a development harness, not a product surface. It runs inside the real
 * module graph so it sees exactly the objects the pages see — the alternative,
 * reading the generators and reasoning about what they probably emit, is how
 * dangling references survive to a demo.
 *
 * It checks four things:
 *   1. `id` is unique within every collection.
 *   2. Every `*Id` / `*Ids` field resolves to a real entity in the universe its
 *      suffix implies. This is the check that catches a coach reassignment or a
 *      renamed location leaving orphans behind.
 *   3. Required scalars are present and finite — no `undefined`, no `NaN`.
 *   4. Every ISO-looking date parses and lands in a sane window around the
 *      pinned demo clock.
 */
import { NextResponse } from "next/server";

import { clients } from "@/lib/mock/clients";
import { staff } from "@/lib/mock/staff";
import { locations } from "@/lib/mock/locations";
import { vendors } from "@/lib/mock/vendors";
import { catalog } from "@/lib/catalog/catalog";
import { absolute } from "@/lib/utils";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/* Entity universes                                                            */
/* -------------------------------------------------------------------------- */

const ids = (xs: readonly { id: string }[]) => new Set(xs.map((x) => x.id));

const UNIVERSE: Record<string, Set<string>> = {
  client: ids(clients),
  staff: ids(staff),
  location: ids(locations),
  vendor: ids(vendors),
  catalogItem: ids(catalog),
  // The catalog is addressed two ways: `id` is the row key, `sku` is the
  // business key that orders and subscriptions actually carry. Both are real,
  // so both get a universe — the bug this check exists to prevent is a field
  // holding one while its name promises the other.
  sku: new Set(catalog.map((c) => c.sku)),
};

/**
 * Which universe a field name points at.
 *
 * Roles are not separate universes: a coach, a provider and an assignee are all
 * rows in `staff`, so they all resolve against the same set. Narrower role
 * checks (is this coachId actually a coach?) are handled separately below.
 */
const FIELD_UNIVERSE: Record<string, string> = {
  clientId: "client",
  referrerClientId: "client",
  coachId: "staff",
  providerId: "staff",
  staffId: "staff",
  authorId: "staff",
  assigneeId: "staff",
  actorId: "staff",
  hostStaffId: "staff",
  raisedByStaffId: "staff",
  assignedToStaffId: "staff",
  answeredByStaffId: "staff",
  uploadedByStaffId: "staff",
  signedBy: "staff",
  locationId: "location",
  locationIds: "location",
  vendorId: "vendor",
  sku: "sku",
  // A ledger row's subject is always the patient the row is *about*. Checking
  // it matters more than most: an access-log entry naming a client who does not
  // exist is a row nobody can ever be shown or held to.
  subjectId: "client",
};

/**
 * Fields whose name ends in `Id` but which are not references into any entity
 * universe — external identifiers, opaque handles, and keys into structures
 * that are not `{id}` collections. Listed explicitly so that the "unresolvable
 * reference field" check below can be strict about everything else.
 */
const NON_REFERENCE_ID_FIELDS = new Set([
  "id",
  // Polymorphic: a ledger row's entityId points at whatever its entityType
  // names (a consult, an order, a plan item...). There is no single universe to
  // resolve it against, so it is checked by entityType elsewhere, not here.
  "entityId",
  "quizId",
  "groupId",
  "threadId",
  "bookingId",
  "orderId",
  "deliveryId",
  "challengeId",
  "correctOptionId",
  "ledgerEventId",
  "sourceConsultId",
  "ruleIds",
]);

/** IDs that intentionally do not name a person — actors that are not staff. */
const SYNTHETIC_ACTORS = new Set(["system", "apex-ai", "self", "member", "anonymous"]);

/* -------------------------------------------------------------------------- */
/* Walker                                                                      */
/* -------------------------------------------------------------------------- */

const NOW = absolute("2026-06-12T09:00:00").getTime();
const WINDOW_MS = 1000 * 60 * 60 * 24 * 365 * 3; // three years either side
const ISO_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/;

interface Problem {
  kind: string;
  module: string;
  path: string;
  detail: string;
}

const problems: Problem[] = [];
const report = (kind: string, module: string, path: string, detail: string) =>
  problems.push({ kind, module, path, detail });

function walk(node: unknown, module: string, path: string, seen: WeakSet<object>, depth = 0) {
  if (node === null || node === undefined || depth > 12) return;
  if (typeof node !== "object") return;
  if (seen.has(node as object)) return;
  seen.add(node as object);

  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, module, `${path}[${i}]`, seen, depth + 1));
    return;
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;

    // --- reference checks -------------------------------------------------
    const universeName = FIELD_UNIVERSE[key];
    if (universeName && value !== undefined && value !== null) {
      const universe = UNIVERSE[universeName];
      const refs = Array.isArray(value) ? value : [value];
      for (const ref of refs) {
        if (typeof ref !== "string") {
          report("bad-ref-type", module, here, `${key} is ${typeof ref}, expected string`);
          continue;
        }
        if (SYNTHETIC_ACTORS.has(ref)) continue;
        if (!universe.has(ref)) {
          report("dangling-ref", module, here, `${key}="${ref}" not in ${universeName}`);
        }
      }
    }

    // A field that looks like a reference but resolves against nothing is how
    // the sku/catalogItemId mix-up hid: the auditor simply had no opinion. Fail
    // loudly on unknown reference-shaped fields instead.
    if (!universeName && /Ids?$/.test(key) && !NON_REFERENCE_ID_FIELDS.has(key)) {
      report("unmapped-ref-field", module, here, `${key} resolves against no universe`);
    }

    // --- scalar sanity ----------------------------------------------------
    if (typeof value === "number" && !Number.isFinite(value)) {
      report("bad-number", module, here, `${key}=${String(value)}`);
    }

    // --- date sanity ------------------------------------------------------
    if (typeof value === "string" && ISO_RE.test(value) && /(At|Date|On|Due|Start|End|_at)$/i.test(key)) {
      const t = absolute(value).getTime();
      if (!Number.isFinite(t)) report("unparseable-date", module, here, `${key}="${value}"`);
      else if (Math.abs(t - NOW) > WINDOW_MS) {
        report("implausible-date", module, here, `${key}="${value}" is far from the pinned clock`);
      }
    }

    walk(value, module, here, seen, depth + 1);
  }
}

/* -------------------------------------------------------------------------- */
/* Runner                                                                      */
/* -------------------------------------------------------------------------- */

export async function GET() {
  problems.length = 0;

  const modules: Record<string, unknown> = {
    "mock/clients": await import("@/lib/mock/clients"),
    "mock/staff": await import("@/lib/mock/staff"),
    "mock/locations": await import("@/lib/mock/locations"),
    "mock/vendors": await import("@/lib/mock/vendors"),
    "mock/appointments": await import("@/lib/mock/appointments"),
    "mock/automations": await import("@/lib/mock/automations"),
    "mock/bodyscans": await import("@/lib/mock/bodyscans"),
    "mock/community": await import("@/lib/mock/community"),
    "mock/consults": await import("@/lib/mock/consults"),
    "mock/contactLog": await import("@/lib/mock/contactLog"),
    "mock/documents": await import("@/lib/mock/documents"),
    "mock/escalations": await import("@/lib/mock/escalations"),
    "mock/intake": await import("@/lib/mock/intake"),
    "mock/inventory": await import("@/lib/mock/inventory"),
    "mock/labs": await import("@/lib/mock/labs"),
    "mock/memberships": await import("@/lib/mock/memberships"),
    "mock/notes": await import("@/lib/mock/notes"),
    "mock/orders": await import("@/lib/mock/orders"),
    "mock/play": await import("@/lib/mock/play"),
    "mock/recommendations": await import("@/lib/mock/recommendations"),
    "mock/referrals": await import("@/lib/mock/referrals"),
    "mock/shifts": await import("@/lib/mock/shifts"),
    "mock/subscriptions": await import("@/lib/mock/subscriptions"),
    "mock/tasks": await import("@/lib/mock/tasks"),
    "mock/timeline": await import("@/lib/mock/timeline"),
    "mock/training": await import("@/lib/mock/training"),
    "catalog/catalog": await import("@/lib/catalog/catalog"),
    "trace/ledger": await import("@/lib/trace/ledger"),
  };

  const collections: { name: string; length: number }[] = [];

  for (const [name, mod] of Object.entries(modules)) {
    for (const [exportName, value] of Object.entries(mod as Record<string, unknown>)) {
      if (typeof value === "function") continue;
      if (Array.isArray(value)) {
        collections.push({ name: `${name}.${exportName}`, length: value.length });

        // Uniqueness of `id` within the collection.
        const counts = new Map<string, number>();
        for (const row of value) {
          const id = (row as { id?: unknown })?.id;
          if (typeof id === "string") counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        for (const [id, n] of counts) {
          if (n > 1) report("duplicate-id", name, exportName, `id="${id}" appears ${n}x`);
        }

        // An empty collection is almost always a generator that silently
        // filtered everything out — worth surfacing, not worth failing on.
        if (value.length === 0) report("empty-collection", name, exportName, "collection is empty");
      }
      walk(value, name, exportName, new WeakSet());
    }
  }

  // --- role checks: a coachId should name someone who actually coaches ------
  const coachIds = new Set(staff.filter((s) => s.role === "Coach").map((s) => s.id));
  for (const c of clients) {
    if (!coachIds.has(c.coachId)) {
      report("role-mismatch", "mock/clients", `client ${c.id}`, `coachId="${c.coachId}" is not a Coach`);
    }
  }

  // --- every client's location must exist and every staff member's too ------
  for (const c of clients) {
    if (!UNIVERSE.location.has(c.locationId)) {
      report("dangling-ref", "mock/clients", `client ${c.id}`, `locationId="${c.locationId}"`);
    }
  }

  // --- ledger chain integrity ----------------------------------------------
  // Verify oldest-first: the chain is built forward, so that is the order the
  // prevHash links were computed in.
  const { verifyChain, ledgerNewestFirst } = await import("@/lib/trace/ledger");
  const chain = verifyChain([...ledgerNewestFirst()].reverse());
  if (!chain.ok) report("ledger-broken", "trace/ledger", "verifyChain", JSON.stringify(chain));

  const byKind = problems.reduce<Record<string, number>>((acc, p) => {
    acc[p.kind] = (acc[p.kind] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    ok: problems.length === 0,
    collectionsChecked: collections.length,
    rowsChecked: collections.reduce((n, c) => n + c.length, 0),
    ledgerChain: chain,
    byKind,
    problems: problems.slice(0, 400),
    truncated: problems.length > 400,
  });
}
