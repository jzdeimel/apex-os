/**
 * CI smoke test — boots the built standalone server and asserts the contract
 * that must never regress:
 *   - GET  /api/health returns a JSON body with a `status` field
 *   - GET  /api/me       is 401 for an unauthenticated caller (auth is enforced)
 *   - GET  /api/audit    is 403 for an unauthenticated caller (admin-gated)
 *   - POST /api/acs/token is 401 for an unauthenticated caller
 *   - GET  /             renders (200) — the app boots
 *
 * No browser: these are the cheap, reliable invariants. The UI smoke
 * (scripts/smoke-ui.mjs) covers rendering. Exits non-zero on any failure so CI
 * goes red.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";

const PORT = process.env.SMOKE_PORT || "4100";
const BASE = `http://127.0.0.1:${PORT}`;

// The standalone server needs static + public copied beside it (they are not
// part of Next's traced output) — same as the Dockerfile does.
if (existsSync(".next/standalone")) {
  try { cpSync(".next/static", ".next/standalone/.next/static", { recursive: true }); } catch {}
  try { if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true }); } catch {}
}

const server = spawn("node", [".next/standalone/server.js"], {
  env: { ...process.env, PORT, HOSTNAME: "127.0.0.1", TZ: "UTC" },
  stdio: "inherit",
});

const fail = (msg) => {
  console.error(`SMOKE FAIL: ${msg}`);
  server.kill("SIGKILL");
  process.exit(1);
};

async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.status) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail("server did not start in time");
}

async function expectStatus(method, path, want) {
  const r = await fetch(`${BASE}${path}`, { method });
  if (r.status !== want) fail(`${method} ${path} => ${r.status}, expected ${want}`);
  console.log(`ok  ${method} ${path} => ${r.status}`);
  return r;
}

try {
  await waitForServer();

  const health = await fetch(`${BASE}/api/health`);
  const body = await health.json().catch(() => ({}));
  if (typeof body.status !== "string") fail(`/api/health missing string 'status' (got ${JSON.stringify(body).slice(0, 120)})`);
  console.log(`ok  GET /api/health => status:${body.status}`);

  await expectStatus("GET", "/api/me", 401);
  await expectStatus("GET", "/api/audit", 403);
  await expectStatus("GET", "/api/escalations", 401);
  await expectStatus("GET", "/api/coach/messages", 401);
  await expectStatus("GET", "/api/patient/messages", 401);
  await expectStatus("POST", "/api/acs/token", 401);

  // Every mutating endpoint fails closed without a principal.
  for (const path of ["/api/consults/sign", "/api/tasks/complete", "/api/orders/create", "/api/member/log"]) {
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (r.status !== 401) fail(`POST ${path} unauthenticated => ${r.status}, expected 401`);
    console.log(`ok  POST ${path} (unauth) => 401`);
  }

  // The consult-draft endpoint (PHI drafts, server-side) fails closed on every
  // verb — GET reads a draft, PUT autosaves, POST signs; none may leak to an
  // anonymous caller.
  for (const [method, path] of [
    ["GET", "/api/consults/draft?clientId=c-001"],
    ["PUT", "/api/consults/draft"],
    ["POST", "/api/consults/draft"],
  ]) {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify({ clientId: "c-001", rawNotes: "x" }),
    });
    if (r.status !== 401) fail(`${method} ${path} unauthenticated => ${r.status}, expected 401`);
    console.log(`ok  ${method} ${path.split("?")[0]} (unauth) => 401`);
  }

  // AUTHORIZATION BOUNDARY: role comes from the server-resolved principal, and
  // can() refuses a coach a provider-only capability. Uses a crafted EasyAuth
  // header, which is exactly what the platform injects — so this tests the same
  // code path production runs. (No DATABASE_URL in CI, so mapToStaff exercises
  // its seeded fallback; the capability check is identical either way.)
  const principal = (email, name) =>
    Buffer.from(
      JSON.stringify({ claims: [{ typ: "email", val: email }, { typ: "oid", val: `oid-${name}` }, { typ: "name", val: name }] }),
    ).toString("base64");

  {
    const r = await fetch(`${BASE}/api/me`, { headers: { "x-ms-client-principal": principal("m.vale@alphahealth.demo", "vale") } });
    const body = await r.json();
    if (body.role !== "Medical" || body.staffId !== "st-001") fail(`provider /api/me resolved ${body.role}/${body.staffId}, expected Medical/st-001`);
    console.log("ok  /api/me (provider) => Medical st-001");
  }
  {
    // The client scope is resolved from the server-owned chart. A coach cannot
    // smuggle another member into their own Medical handoff by supplying ids.
    const r = await fetch(`${BASE}/api/messages/escalate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ms-client-principal": principal("t.brooks@alphahealth.demo", "brooks"),
      },
      body: JSON.stringify({
        clientId: "c-002",
        kind: "Clinical question",
        priority: "Prompt",
        question: "Please review this member's question.",
        memberQuote: "Can my coach ask the clinical team?",
      }),
    });
    if (r.status !== 403) fail(`off-book Medical handoff => ${r.status}, expected 403`);
    console.log("ok  POST /api/messages/escalate (off-book coach) => 403 refused");
  }
  {
    // A valid handoff reaches the database boundary. CI intentionally has no
    // database, so the route must fail honestly without exposing internals.
    const r = await fetch(`${BASE}/api/messages/escalate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ms-client-principal": principal("t.brooks@alphahealth.demo", "brooks"),
      },
      body: JSON.stringify({
        clientId: "c-001",
        kind: "Clinical question",
        priority: "Prompt",
        question: "Please review this member's question.",
        memberQuote: "Can my coach ask the clinical team?",
      }),
    });
    const body = await r.json();
    if (r.status !== 503 || !body.correlationId || /DATABASE_URL|postgresql:/i.test(body.error ?? "")) {
      fail(`Medical handoff database failure was not safely contained (${r.status} ${JSON.stringify(body).slice(0, 180)})`);
    }
    console.log("ok  POST /api/messages/escalate DB failure => 503, generic and traceable");
  }
  {
    // A COACH must be refused sign:encounter — 403 with the capability reason,
    // not a silent success. This is the audit's core invariant.
    const r = await fetch(`${BASE}/api/consults/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ms-client-principal": principal("m.vega@alphahealth.demo", "vega") },
      // A REAL consult id (con-<last3 of clientId>-<index>). The route now loads
      // the consult and derives the client from it, so a made-up id would 404
      // before authorization ever runs and the test would prove nothing.
      body: JSON.stringify({ consultId: "con-001-1" }),
    });
    if (r.status !== 403) fail(`coach consult-sign => ${r.status}, expected 403`);
    console.log("ok  POST /api/consults/sign (coach) => 403 refused");
  }
  {
    // CARE-TEAM SCOPE: a provider who is NOT on this client's care team is
    // refused a draft write (guard runs before any DB access, so this holds in
    // CI without a database). Dr. Park is off c-001's team.
    const r = await fetch(`${BASE}/api/consults/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-ms-client-principal": principal("e.park@alphahealth.demo", "park") },
      body: JSON.stringify({ clientId: "c-001", rawNotes: "probe" }),
    });
    if (r.status !== 403) fail(`off-care-team draft PUT => ${r.status}, expected 403`);
    console.log("ok  PUT /api/consults/draft (off-care-team) => 403 refused");
  }
  {
    // STEWARD WORKFLOW: Medical is on c-001's care team, but cannot forge a
    // coach-authored contact note.
    const r = await fetch(`${BASE}/api/consults/draft`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-ms-client-principal": principal("m.vale@alphahealth.demo", "vale"),
      },
      body: JSON.stringify({
        clientId: "c-001",
        kind: "Coach consult",
        channel: "In person",
        rawNotes: "probe",
      }),
    });
    if (r.status !== 400) fail(`Medical direct-client consult => ${r.status}, expected 400`);
    console.log("ok  PUT /api/consults/draft (Medical direct-client note) => 400 refused");
  }
  {
    // Medical documents visits, but Messaging is deliberately not a Medical
    // encounter channel. Patient communication stays with the coach.
    const r = await fetch(`${BASE}/api/consults/draft`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-ms-client-principal": principal("m.vale@alphahealth.demo", "vale"),
      },
      body: JSON.stringify({
        clientId: "c-001",
        kind: "Medical visit",
        channel: "Messaging",
        rawNotes: "probe",
        clinicalNote: { subjective: "s", objective: "o", assessment: "a", plan: "p" },
      }),
    });
    if (r.status !== 400) fail(`Medical messaging visit => ${r.status}, expected 400`);
    console.log("ok  PUT /api/consults/draft (Medical Messaging channel) => 400 refused");
  }
  {
    // The inverse is also enforced: the coach cannot author the internal
    // Medical review type, even by bypassing the select control.
    const r = await fetch(`${BASE}/api/consults/draft`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-ms-client-principal": principal("t.brooks@alphahealth.demo", "brooks"),
      },
      body: JSON.stringify({
        clientId: "c-001",
        kind: "Medical chart review",
        channel: "Chart review",
        rawNotes: "probe",
      }),
    });
    if (r.status !== 400) fail(`coach Medical review => ${r.status}, expected 400`);
    console.log("ok  PUT /api/consults/draft (coach Medical review) => 400 refused");
  }

  // PUBLIC endpoints: reachable without auth (they sit outside EasyAuth), but
  // they must validate, not just accept. A public write that trusts its input
  // is the one place an unauthenticated attacker can reach the database.
  {
    const r = await fetch(`${BASE}/api/public/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "A" }),
    });
    if (r.status !== 400) fail(`public leads (invalid) => ${r.status}, expected 400`);
    console.log("ok  POST /api/public/leads (invalid) => 400 validated");
  }
  {
    // A bogus token must produce ONE generic failure — never an oracle that
    // confirms which intake links exist.
    const r = await fetch(`${BASE}/api/public/intake?token=NOTAREALTOKEN`);
    const body = await r.json().catch(() => ({}));
    // With a database: 400 + the ONE generic message. Without one (CI): 503,
    // because the lookup cannot run — which is the honest answer, not a
    // pretend-valid 200. Either way it must never confirm the token exists.
    if (![400, 503].includes(r.status)) fail(`public intake (bogus token) => ${r.status}, expected 400 or 503`);
    if (r.status === 400 && !/no longer valid/i.test(body.error ?? "")) {
      fail("bogus token did not return the generic failure");
    }
    if (/found|exists|unknown token|expired token/i.test(body.error ?? "")) {
      fail(`bogus-token response leaks token state: ${body.error}`);
    }
    console.log(`ok  GET /api/public/intake (bogus token) => ${r.status} no oracle`);
  }
  {
    // The staff walk-in path is NOT public.
    const r = await fetch(`${BASE}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (r.status !== 401) fail(`staff lead capture (unauth) => ${r.status}, expected 401`);
    console.log("ok  POST /api/leads (unauth) => 401");
  }
  {
    // Acquisition is OWNER-only: a coach holds read:financial but must not see
    // business-wide funnel performance.
    const r = await fetch(`${BASE}/api/leads`, {
      headers: { "x-ms-client-principal": principal("m.vega@alphahealth.demo", "vega") },
    });
    if (r.status !== 403) fail(`coach acquisition read => ${r.status}, expected 403`);
    console.log("ok  GET /api/leads (coach) => 403 owner-only");
  }

  {
    /**
     * THE PRESCRIBER GATE, server-side.
     *
     * /api/orders/create used to take {clientId, sku, quantity}, check only the
     * broad write:order capability, and append a ledger row — bypassing
     * validateOrder and therefore RULE 4. A COACH could place a
     * prescriber-required item by POSTing to it. Tyler Brooks (st-005) is a
     * Coach ON c-001's care team, so scope passes and this isolates the gate
     * rather than accidentally testing care-team scoping.
     */
    const r = await fetch(`${BASE}/api/orders/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ms-client-principal": principal("t.brooks@alphahealth.demo", "brooks"),
      },
      body: JSON.stringify({
        requestId: "smoke-order-prescriber-gate-0001",
        clientId: "c-001",
        lines: [{ sku: "PEP-SERM-15", qty: 1 }],
        shipping: "ship",
        shipTo: { line1: "12 Oak St", city: "Raleigh", state: "NC", postal: "27601" },
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.status !== 422) fail(`coach ordering a prescriber-required SKU => ${r.status}, expected 422`);
    if (!/requires a prescriber/i.test(body.error ?? "")) {
      fail(`coach order refusal did not cite the prescriber gate: ${body.error}`);
    }
    console.log("ok  POST /api/orders/create (coach + Rx-required SKU) => 422 prescriber gate");
  }
  {
    // Every failure carries a correlation id, so support can join a user report
    // to a server log without the caller ever seeing driver text.
    const r = await fetch(`${BASE}/api/orders/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ms-client-principal": principal("t.brooks@alphahealth.demo", "brooks") },
      body: JSON.stringify({ clientId: "c-001" }),
    });
    const body = await r.json().catch(() => ({}));
    if (!body.correlationId) fail("API failure did not include a correlationId");
    if (/postgres|relation|constraint|column/i.test(body.error ?? "")) {
      fail(`API failure leaked backend detail: ${body.error}`);
    }
    console.log("ok  API failures carry a correlationId and leak no backend detail");
  }

  const home = await fetch(`${BASE}/`);
  if (home.status !== 200) fail(`GET / => ${home.status}, expected 200`);
  console.log("ok  GET / => 200");

  console.log("\nSMOKE PASS");
  server.kill("SIGKILL");
  process.exit(0);
} catch (err) {
  fail(err?.message ?? String(err));
}
