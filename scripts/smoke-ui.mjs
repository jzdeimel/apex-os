/**
 * CI UI smoke — boots the standalone build and renders a couple of surfaces in
 * a real browser, asserting they paint content and throw no page errors. This is
 * the check that would have caught the blank-screen / hydration regressions the
 * Dockerfile comments are full of.
 *
 * Kept deliberately small: the entry screen (unauthenticated) and one persona
 * surface. Uses the base `playwright` package already in the tree.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { chromium } from "playwright";

const PORT = process.env.SMOKE_PORT || "4101";
const BASE = `http://127.0.0.1:${PORT}`;

if (existsSync(".next/standalone")) {
  try { cpSync(".next/static", ".next/standalone/.next/static", { recursive: true }); } catch {}
  try { if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true }); } catch {}
}

const server = spawn("node", [".next/standalone/server.js"], {
  env: { ...process.env, PORT, HOSTNAME: "127.0.0.1", TZ: "UTC" },
  stdio: "inherit",
});

let browser;
const done = (code, msg) => {
  if (msg) console[code ? "error" : "log"](msg);
  try { browser?.close(); } catch {}
  server.kill("SIGKILL");
  process.exit(code);
};

async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.status) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  done(1, "SMOKE-UI FAIL: server did not start");
}

try {
  await waitForServer();
  browser = await chromium.launch();
  const ctx = await browser.newContext({ timezoneId: "America/New_York" });

  // Entry screen (unauthenticated view).
  {
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 30000 });
    const text = (await p.evaluate(() => document.body.innerText)).trim();
    if (text.length < 100) done(1, `SMOKE-UI FAIL: entry screen rendered only ${text.length} chars`);
    if (errors.length) done(1, `SMOKE-UI FAIL: entry page errors: ${errors.slice(0, 3).join(" | ")}`);
    console.log(`ok  entry screen: ${text.length} chars, no page errors`);
    await p.close();
  }

  // One persona surface (coach dashboard).
  {
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await ctx.addInitScript((k) => { try { localStorage.setItem(k, "coach"); } catch {} }, "apex_portal_v1");
    await p.goto(`${BASE}/coach`, { waitUntil: "networkidle", timeout: 30000 });
    const text = (await p.evaluate(() => document.body.innerText)).trim();
    if (text.length < 200) done(1, `SMOKE-UI FAIL: /coach rendered only ${text.length} chars`);
    if (errors.length) done(1, `SMOKE-UI FAIL: /coach errors: ${errors.slice(0, 3).join(" | ")}`);
    console.log(`ok  /coach: ${text.length} chars, no page errors`);
    await p.close();
  }

  console.log("\nSMOKE-UI PASS");
  done(0);
} catch (err) {
  done(1, `SMOKE-UI FAIL: ${err?.message ?? err}`);
}
