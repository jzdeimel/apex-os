/**
 * APPEND → READ BACK → VERIFY, against a real Postgres.
 *
 * This exists because the chain was silently broken: the write path hashed a
 * SPARSE payload (optional fields absent) while Postgres returns those columns
 * present-and-NULL, and `at` returns as a Date rather than the ISO string that
 * was hashed. `canonicalJson` treats absent, null and Date differently, so
 * every durable row failed `verifyChain` with "hash-mismatch" — the signal that
 * means "somebody tampered with this record". A tamper-evidence mechanism that
 * fires on untouched rows is worse than not having one.
 *
 * A unit test over in-memory payloads could not catch it: the fault only exists
 * across the database round trip. So this test round-trips.
 *
 * Requires DATABASE_URL. Skips (exit 0) without one, so CI without a database
 * stays green while a database-having environment gets the real check.
 *
 * IT DOES NOT CLEAN UP AFTER ITSELF, and that is deliberate. The ledger is
 * append-only and now enforced as such by a database trigger, so nothing —
 * including this test — can delete from it. That is the correct behaviour: a
 * log you can tidy is not evidence. The rows it writes are honest audit
 * entries (actor "system-verify") recording that a chain verification ran, and
 * a verification IS an auditable event.
 */
import { createHash } from "node:crypto";
import postgres from "postgres";

const URL_ = process.env.DATABASE_URL;
if (!URL_) {
  console.log("skip  ledger-verify — no DATABASE_URL");
  process.exit(0);
}

// Mirrors lib/trace/hash.ts + lib/trace/ledger.ts. Duplicated deliberately: if
// this test imported the app's implementation it would agree with it by
// construction, including when both are wrong.
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}
function normalize(p) {
  const at = p.at instanceof Date ? p.at.toISOString() : String(p.at);
  return {
    seq: Number(p.seq), at,
    actorId: p.actorId, actorName: p.actorName, actorRole: p.actorRole,
    action: p.action, entity: p.entity, entityId: p.entityId,
    subjectId: p.subjectId ?? null, subjectName: p.subjectName ?? null,
    locationId: p.locationId ?? null, reason: p.reason ?? null,
    before: p.before ?? null, after: p.after ?? null,
  };
}
const hashRow = (prev, payload) => sha256(prev + canonicalJson(normalize(payload)));
const GENESIS = "0".repeat(64);

const sql = postgres(URL_, { ssl: "require", connect_timeout: 20 });
const MARK = `ledger-verify-${process.pid}`;
let failed = false;
const fail = (m) => { console.error(`LEDGER-VERIFY FAIL: ${m}`); failed = true; };

try {
  // Two rows: one SPARSE (the shape that broke it) and one fully populated.
  const drafts = [
    { actorId: "system-verify", actorName: "Chain verification", actorRole: "System",
      action: "view", entity: "chart", entityId: MARK },
    { actorId: "system-verify", actorName: "Chain verification", actorRole: "System",
      action: "view", entity: "chart", entityId: MARK,
      subjectId: "c-001", subjectName: "Test Subject", locationId: "raleigh",
      reason: "populated row", before: { status: "a" }, after: { status: "b" } },
  ];

  const written = [];
  for (const draft of drafts) {
    const row = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(4242)`;
      const [tail] = await tx`SELECT seq, hash FROM ledger ORDER BY seq DESC LIMIT 1`;
      const seq = (tail?.seq ?? 0) + 1;
      const prevHash = tail?.hash ?? GENESIS;
      const at = new Date().toISOString();
      const hash = hashRow(prevHash, { ...draft, seq, at });
      const id = `led-${String(seq).padStart(5, "0")}`;
      await tx`INSERT INTO ledger ${tx({
        id, seq, at: new Date(at),
        actor_id: draft.actorId, actor_name: draft.actorName, actor_role: draft.actorRole,
        action: draft.action, entity: draft.entity, entity_id: draft.entityId,
        subject_id: draft.subjectId ?? null, subject_name: draft.subjectName ?? null,
        location_id: draft.locationId ?? null, reason: draft.reason ?? null,
        before: draft.before ?? null, after: draft.after ?? null,
        prev_hash: prevHash, hash,
      })}`;
      return { id, seq, hash, prevHash };
    });
    written.push(row);
  }
  console.log(`ok    appended ${written.length} rows (${written.map((w) => w.id).join(", ")})`);

  // READ BACK from the database — the whole point.
  const rows = await sql`
    SELECT * FROM ledger WHERE entity_id = ${MARK} ORDER BY seq ASC`;
  if (rows.length !== drafts.length) fail(`read back ${rows.length} rows, expected ${drafts.length}`);

  for (const r of rows) {
    const payload = {
      seq: r.seq, at: r.at,
      actorId: r.actor_id, actorName: r.actor_name, actorRole: r.actor_role,
      action: r.action, entity: r.entity, entityId: r.entity_id,
      subjectId: r.subject_id, subjectName: r.subject_name,
      locationId: r.location_id, reason: r.reason,
      before: r.before, after: r.after,
    };
    const recomputed = hashRow(r.prev_hash, payload);
    if (recomputed !== r.hash) {
      fail(`${r.id} hash-mismatch on read-back — the sparse-vs-NULL/Date normalization regressed`);
    } else {
      console.log(`ok    ${r.id} verifies after a database round trip`);
    }
  }

  // Chain linkage: each row's prevHash must be the previous row's hash.
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].prev_hash !== rows[i - 1].hash) fail(`${rows[i].id} link-mismatch`);
  }
  if (rows.length > 1) console.log("ok    chain links hold across rows");
} catch (err) {
  fail(err?.message ?? String(err));
} finally {
  // No DELETE: the ledger is append-only and a trigger enforces it.
  await sql.end();
}

if (failed) process.exit(1);
console.log("\nLEDGER VERIFY PASS");
