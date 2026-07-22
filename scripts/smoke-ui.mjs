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

const principal = (email, name, oid) => Buffer.from(
  JSON.stringify({
    claims: [
      { typ: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", val: email },
      { typ: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name", val: name },
      { typ: "http://schemas.microsoft.com/identity/claims/objectidentifier", val: oid },
    ],
  }),
).toString("base64");

if (existsSync(".next/standalone")) {
  try { cpSync(".next/static", ".next/standalone/.next/static", { recursive: true }); } catch {}
  try { if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true }); } catch {}
}

const server = spawn("node", [".next/standalone/server.js"], {
  env: {
    ...process.env,
    PORT,
    HOSTNAME: "127.0.0.1",
    TZ: "UTC",
    APEX_FEATURE_PRESET: "full",
    APEX_UI_SKIN: "alpha-dark",
  },
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
    await p.waitForFunction(() => document.body.innerText.trim().length >= 100, null, { timeout: 10000 });
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
    await p.waitForFunction(() => document.body.innerText.trim().length >= 200, null, { timeout: 10000 });
    const text = (await p.evaluate(() => document.body.innerText)).trim();
    if (text.length < 200) done(1, `SMOKE-UI FAIL: /coach rendered only ${text.length} chars`);
    if (errors.length) done(1, `SMOKE-UI FAIL: /coach errors: ${errors.slice(0, 3).join(" | ")}`);
    const reviewPosture = await p.evaluate(() => ({
      skin: document.documentElement.dataset.skin,
      darkClass: document.documentElement.classList.contains("dark"),
      communityLinks: Array.from(document.querySelectorAll("a")).filter((a) =>
        a.getAttribute("href") === "/coach/community",
      ).length,
    }));
    if (reviewPosture.skin !== "apex" || !reviewPosture.darkClass) {
      done(1, `SMOKE-UI FAIL: shared review skin is not dark (${JSON.stringify(reviewPosture)})`);
    }
    if (reviewPosture.communityLinks < 1) {
      done(1, "SMOKE-UI FAIL: Community is hidden from the full coach navigation");
    }
    console.log(`ok  /coach: ${text.length} chars, dark skin, Community visible, no page errors`);
    await p.close();
  }

  // The owner-reported regression: Community existed in source but the review
  // preset turned its route and navigation off. Exercise the actual page so a
  // future preset change cannot pass by testing only the dashboard.
  {
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${BASE}/coach/community`, { waitUntil: "networkidle", timeout: 30000 });
    await p.waitForFunction(() => document.body.innerText.trim().length >= 200, null, { timeout: 10000 });
    const text = (await p.evaluate(() => document.body.innerText)).trim();
    if (!text.includes("Community")) done(1, "SMOKE-UI FAIL: /coach/community did not render Community");
    if (!text.includes("For you") || !text.toLowerCase().includes("next event")) {
      done(
        1,
        `SMOKE-UI FAIL: Community personalized landing view did not render (${JSON.stringify({
          hasForYou: text.includes("For you"),
          hasNextEvent: text.toLowerCase().includes("next event"),
          excerpt: text.slice(0, 500),
        })})`,
      );
    }
    if (errors.length) done(1, `SMOKE-UI FAIL: Community page errors: ${errors.slice(0, 3).join(" | ")}`);
    console.log(`ok  /coach/community: ${text.length} chars, personalized landing view, no page errors`);
    await p.close();
  }

  // A visit note must be reachable from the client profile for both Coach and
  // Medical workflows. Exercise the deep link used by the upcoming-call CTA.
  {
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.setExtraHTTPHeaders({
      "x-ms-client-principal": principal("t.brooks@alphahealth.demo", "Tyler Brooks", "oid-st-005"),
    });
    // This smoke owns the UI contract, not a local Postgres instance. Supply
    // the same role-constrained metadata the authenticated draft endpoint
    // returns; executable specs separately verify the server-side rules.
    await p.route("**/api/consults/draft*", async (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            durable: true,
            id: "con-smoke",
            updatedAt: "2026-07-22T12:00:00.000Z",
          }),
        });
      }
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          authorRole: "Coach",
          allowedKinds: ["Coach consult", "Check-in", "Intake", "Follow-up", "Telehealth"],
          allowedChannels: ["In person", "Phone", "Video", "Messaging"],
          suggestedKind: "Coach consult",
          suggestedChannel: "In person",
          draft: null,
        }),
      });
    });
    await p.goto(`${BASE}/clients/c-001?tab=consults&new=1`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await p.waitForFunction(() => document.body.innerText.trim().length >= 200, null, {
      timeout: 10000,
    });
    const text = (await p.evaluate(() => document.body.innerText)).trim();
    if (!text.toLowerCase().includes("structured summary")) {
      done(
        1,
        `SMOKE-UI FAIL: consult composer did not open (${JSON.stringify({ excerpt: text.slice(-700) })})`,
      );
    }
    const normalizedText = text.toLowerCase();
    if (!normalizedText.includes("note type") || !normalizedText.includes("visit channel")) {
      done(1, "SMOKE-UI FAIL: consult metadata controls did not render");
    }
    if (!normalizedText.includes("steward") || !normalizedText.includes("ai draft") || !normalizedText.includes("sign consult")) {
      done(1, "SMOKE-UI FAIL: AI review/sign workflow did not render");
    }
    const signButton = p.getByRole("button", { name: "Sign consult" });
    await p.getByRole("button", { name: "Load a sample consult" }).click();
    if (!(await signButton.isDisabled())) {
      done(1, "SMOKE-UI FAIL: a dirty note could be signed before its latest autosave");
    }
    await p.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")]
        .find((candidate) => candidate.textContent?.includes("Sign consult"));
      return button && !button.disabled;
    }, null, { timeout: 5000 });
    if (errors.length) done(1, `SMOKE-UI FAIL: consult composer errors: ${errors.slice(0, 3).join(" | ")}`);
    console.log(`ok  client consult: note metadata, AI review and signature workflow rendered`);
    await p.close();
  }

  // Medical documents real clinical visits with authored SOAP fields. The
  // coach remains the communication owner; Medical never gets Messaging as a
  // visit channel.
  {
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.setExtraHTTPHeaders({
      "x-ms-client-principal": principal("m.vale@alphahealth.demo", "Marcus Vale", "oid-st-001"),
    });
    await p.route("**/api/consults/draft*", async (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            durable: true,
            id: "con-medical-smoke",
            updatedAt: "2026-07-22T12:00:00.000Z",
          }),
        });
      }
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          authorRole: "Medical",
          allowedKinds: ["Medical visit", "Medical follow-up", "Medical telehealth", "Medical chart review"],
          allowedChannels: ["In person", "Phone", "Video", "Chart review"],
          suggestedKind: "Medical visit",
          suggestedChannel: "In person",
          draft: null,
        }),
      });
    });
    await p.goto(`${BASE}/clients/c-001?tab=consults&new=1`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await p.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("medical visit documentation"),
      null,
      { timeout: 10000 },
    );
    const text = (await p.evaluate(() => document.body.innerText)).trim().toLowerCase();
    if (
      !text.includes("medical visit documentation") ||
      !text.includes("coach remains") ||
      !text.includes("clinical note · soap") ||
      !text.includes("subjective") ||
      !text.includes("assessment") ||
      !text.includes("visit channel")
    ) {
      done(1, "SMOKE-UI FAIL: Medical visit note or coach-owned messaging boundary did not render");
    }
    const channelOptions = await p.getByLabel("Visit channel").locator("option").allTextContents();
    if (channelOptions.includes("Messaging")) {
      done(1, "SMOKE-UI FAIL: Medical was offered a direct Messaging encounter channel");
    }
    const signButton = p.getByRole("button", { name: "Sign Medical note" });
    await p.getByRole("button", { name: "Load a sample Medical note" }).click();
    if (!(await signButton.isDisabled())) {
      done(1, "SMOKE-UI FAIL: a dirty Medical note could be signed before its latest autosave");
    }
    await p.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")]
        .find((candidate) => candidate.textContent?.includes("Sign Medical note"));
      return button && !button.disabled;
    }, null, { timeout: 5000 });
    if (errors.length) done(1, `SMOKE-UI FAIL: Medical note errors: ${errors.slice(0, 3).join(" | ")}`);
    console.log("ok  Medical visit: authored SOAP, durable draft and coach-owned messaging rendered");
    await p.close();
  }

  console.log("\nSMOKE-UI PASS");
  done(0);
} catch (err) {
  done(1, `SMOKE-UI FAIL: ${err?.message ?? err}`);
}
