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
  await expectStatus("POST", "/api/acs/token", 401);

  const home = await fetch(`${BASE}/`);
  if (home.status !== 200) fail(`GET / => ${home.status}, expected 200`);
  console.log("ok  GET / => 200");

  console.log("\nSMOKE PASS");
  server.kill("SIGKILL");
  process.exit(0);
} catch (err) {
  fail(err?.message ?? String(err));
}
