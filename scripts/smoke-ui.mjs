/**
 * CI UI smoke — boots the standalone build and renders a couple of surfaces in
 * a real browser, asserting they paint content and throw no page errors. This is
 * the check that would have caught the blank-screen / hydration regressions the
 * Dockerfile comments are full of.
 *
 * The role matrix is deliberately explicit. A release cannot call itself
 * review-ready because one staff dashboard painted: Coach, Medical, Front Desk,
 * Executive and the patient sign-in boundary each get their own isolated
 * browser context and authority assertions.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { chromium } from "playwright";

const PORT = process.env.SMOKE_PORT || "4101";
const EXTERNAL_BASE = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
const BASE = EXTERNAL_BASE || `http://127.0.0.1:${PORT}`;

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

const server = EXTERNAL_BASE
  ? null
  : spawn("node", [".next/standalone/server.js"], {
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
  try { server?.kill("SIGKILL"); } catch {}
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

  // Every operating role gets an isolated browser context so portal selection,
  // staff identity and client-side state cannot leak between personas.
  const roleCases = [
    {
      label: "Coach",
      portal: "coach",
      path: "/coach",
      email: "t.brooks@alphahealth.demo",
      name: "Tyler Brooks",
      oid: "oid-st-005",
      required: ["COACH CONSOLE", "Today"],
      forbiddenHrefs: ["/exec"],
    },
    {
      label: "Medical",
      portal: "clinic",
      path: "/clinic",
      email: "m.vale@alphahealth.demo",
      name: "Marcus Vale",
      oid: "oid-st-001",
      required: ["Clinical console", "Waiting on me"],
      forbiddenHrefs: ["/exec"],
    },
    {
      label: "Front Desk",
      portal: "desk",
      path: "/desk",
      email: "h.whitfield@alphahealth.demo",
      name: "Hannah Whitfield",
      oid: "oid-st-009",
      required: ["FRONT DESK", "Book a caller"],
      forbiddenHrefs: ["/clinic", "/exec"],
    },
    {
      label: "Executive",
      portal: "exec",
      path: "/exec",
      email: "zack@goalphahealth.com",
      name: "Zack Deimel",
      oid: "oid-st-owner",
      required: ["OWNER CONSOLE", "What happened yesterday", "Needs you"],
      forbiddenHrefs: [],
    },
  ];

  for (const roleCase of roleCases) {
    const roleCtx = await browser.newContext({
      timezoneId: "America/New_York",
      extraHTTPHeaders: {
        "x-ms-client-principal": principal(roleCase.email, roleCase.name, roleCase.oid),
      },
    });
    await roleCtx.addInitScript(
      ({ key, portal }) => {
        try { localStorage.setItem(key, portal); } catch {}
      },
      { key: "apex_portal_v1", portal: roleCase.portal },
    );
    const p = await roleCtx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${BASE}${roleCase.path}`, { waitUntil: "networkidle", timeout: 30000 });
    await p.waitForFunction(() => document.body.innerText.trim().length >= 150, null, {
      timeout: 10000,
    });
    const posture = await p.evaluate(({ required, forbiddenHrefs }) => {
      const text = document.body.innerText;
      return {
        textLength: text.trim().length,
        missing: required.filter((value) => !text.includes(value)),
        forbidden: forbiddenHrefs.filter((href) =>
          Array.from(document.querySelectorAll("a")).some((a) => a.getAttribute("href") === href),
        ),
        skin: document.documentElement.dataset.skin,
        darkClass: document.documentElement.classList.contains("dark"),
      };
    }, { required: roleCase.required, forbiddenHrefs: roleCase.forbiddenHrefs });
    if (posture.missing.length) {
      done(1, `SMOKE-UI FAIL: ${roleCase.label} missing ${posture.missing.join(", ")}`);
    }
    if (posture.forbidden.length) {
      done(1, `SMOKE-UI FAIL: ${roleCase.label} exposed ${posture.forbidden.join(", ")}`);
    }
    if (posture.skin !== "apex" || !posture.darkClass) {
      done(1, `SMOKE-UI FAIL: ${roleCase.label} did not render the dark Apex skin`);
    }
    if (errors.length) {
      done(1, `SMOKE-UI FAIL: ${roleCase.label} errors: ${errors.slice(0, 3).join(" | ")}`);
    }
    console.log(
      `ok  ${roleCase.label}: ${posture.textLength} chars, correct authority, dark skin, no page errors`,
    );
    await roleCtx.close();
  }

  // The executive acquisition surface is operational, not a seeded dashboard:
  // claim and stage changes must come back from the authoritative API before
  // the UI reflects them.
  {
    const execCtx = await browser.newContext({
      timezoneId: "America/New_York",
      extraHTTPHeaders: {
        "x-ms-client-principal": principal(
          "zack@goalphahealth.com",
          "Zack Deimel",
          "oid-st-owner",
        ),
      },
    });
    await execCtx.addInitScript((key) => {
      try { localStorage.setItem(key, "exec"); } catch {}
    }, "apex_portal_v1");
    const p = await execCtx.newPage();
    const errors = [];
    p.on("pageerror", (error) => errors.push(error.message));
    let lead = {
      id: "lead-ui-smoke",
      firstName: "Apex",
      lastName: "Prospect",
      email: "prospect@example.invalid",
      track: "male",
      preferredLocationId: "raleigh",
      source: "website",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "summer-consult",
      ownerStaffId: null,
      stage: "new",
      createdAt: "2026-07-23T12:00:00.000Z",
      convertedClientId: null,
      reason: "Synthetic acquisition UI check",
    };
    await p.route("**/api/leads", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, leads: [lead] }),
        });
      }
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        lead = {
          ...lead,
          ownerStaffId: body.action === "claim" ? "st-owner" : lead.ownerStaffId,
          stage: body.action === "advance" ? body.toStage : lead.stage,
        };
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, durable: true, lead }),
        });
      }
      return route.continue();
    });
    await p.goto(`${BASE}/exec/pipeline`, { waitUntil: "networkidle", timeout: 30000 });
    await p.getByRole("heading", { name: "Acquisition" }).waitFor({ timeout: 10000 });
    await p.getByText("summer-consult", { exact: true }).waitFor({ timeout: 10000 });
    await p.getByRole("button", { name: "Claim" }).click();
    await p.getByText("Owned", { exact: true }).waitFor({ timeout: 10000 });
    await p.getByRole("button", { name: "Mark contacted" }).click();
    await p.getByText("contacted", { exact: true }).waitFor({ timeout: 10000 });
    if (errors.length) {
      done(1, `SMOKE-UI FAIL: acquisition console errors: ${errors.slice(0, 3).join(" | ")}`);
    }
    console.log(
      "ok  Executive acquisition: attribution, durable claim and contacted stage rendered",
    );
    await execCtx.close();
  }

  // Patient authentication uses a short-lived opaque link, not the staff
  // principal header. An incomplete link must fail closed without ever exposing
  // a staff shell.
  {
    const patientCtx = await browser.newContext({ timezoneId: "America/New_York" });
    const p = await patientCtx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${BASE}/patient-sign-in`, { waitUntil: "networkidle", timeout: 30000 });
    await p.getByRole("heading", { name: "Link unavailable" }).waitFor({ timeout: 10000 });
    const posture = await p.evaluate(() => ({
      text: document.body.innerText,
      staffNavLinks: Array.from(document.querySelectorAll("a")).filter((a) =>
        ["/coach", "/clinic", "/desk", "/exec"].includes(a.getAttribute("href") || ""),
      ).length,
      skin: document.documentElement.dataset.skin,
      darkClass: document.documentElement.classList.contains("dark"),
    }));
    if (!posture.text.includes("sign-in link is incomplete")) {
      done(1, "SMOKE-UI FAIL: patient sign-in did not explain the invalid link");
    }
    if (posture.staffNavLinks) {
      done(1, "SMOKE-UI FAIL: patient authentication boundary exposed staff navigation");
    }
    if (posture.skin !== "apex" || !posture.darkClass) {
      done(1, "SMOKE-UI FAIL: patient sign-in did not render the dark Apex skin");
    }
    if (errors.length) {
      done(1, `SMOKE-UI FAIL: patient sign-in errors: ${errors.slice(0, 3).join(" | ")}`);
    }
    console.log("ok  Patient: authentication failed closed, no staff navigation, dark skin");
    await patientCtx.close();
  }

  // When the caller supplies a one-time link for a disposable test patient,
  // exercise the real patient session and real community APIs end to end. CI
  // can still run the fail-closed boundary above without maintaining test PHI.
  if (process.env.SMOKE_PATIENT_SIGN_IN_URL) {
    const patientCtx = await browser.newContext({ timezoneId: "America/New_York" });
    const p = await patientCtx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(process.env.SMOKE_PATIENT_SIGN_IN_URL, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await p.waitForURL(`${BASE}/patient`, { timeout: 15000 });
    await p.getByRole("heading", { name: /Welcome,/ }).waitFor({ timeout: 10000 });
    const portalPosture = await p.evaluate(() => ({
      text: document.body.innerText,
      staffNavLinks: Array.from(document.querySelectorAll("a")).filter((a) =>
        ["/coach", "/clinic", "/desk", "/exec"].includes(a.getAttribute("href") || ""),
      ).length,
      skin: document.documentElement.dataset.skin,
      darkClass: document.documentElement.classList.contains("dark"),
    }));
    if (
      !portalPosture.text.includes("Secure patient pilot") ||
      !portalPosture.text.includes("Your moderated community")
    ) {
      done(1, "SMOKE-UI FAIL: authenticated patient portal did not render its authoritative record");
    }
    if (portalPosture.staffNavLinks) {
      done(1, "SMOKE-UI FAIL: authenticated patient portal exposed staff navigation");
    }
    if (portalPosture.skin !== "apex" || !portalPosture.darkClass) {
      done(1, "SMOKE-UI FAIL: authenticated patient portal did not render the dark Apex skin");
    }

    await p.getByRole("link", { name: /Your moderated community/ }).click();
    await p.waitForURL(`${BASE}/patient/community`, { timeout: 10000 });
    await p.getByRole("heading", { name: "Review Community" }).waitFor({ timeout: 10000 });
    await p.getByRole("button", { name: /Report post by PeerTwo/ }).click();
    await p.getByLabel("Reason").selectOption("privacy");
    await p.getByLabel(/What should the moderator know/).fill(
      "Synthetic end-to-end moderation check.",
    );
    await p.getByRole("button", { name: "Send report" }).click();
    await p.getByText("Report sent to the moderator").waitFor({ timeout: 10000 });
    await p.getByRole("button", { name: "Block PeerTwo" }).click();
    await p.getByText("Member blocked").waitFor({ timeout: 10000 });
    await p.getByText("PeerTwo").waitFor({ state: "detached", timeout: 10000 });
    if (errors.length) {
      done(1, `SMOKE-UI FAIL: authenticated patient errors: ${errors.slice(0, 3).join(" | ")}`);
    }
    console.log(
      "ok  Patient account: session, authoritative portal, community report and block passed end to end",
    );
    await patientCtx.close();

    // The same report must immediately land in the named coach's owned queue.
    // Resolve it through the real route-to-care-team action so the UI test also
    // proves the medical escalation is durable rather than a decorative label.
    const moderatorCtx = await browser.newContext({
      timezoneId: "America/New_York",
      extraHTTPHeaders: {
        "x-ms-client-principal": principal(
          "t.brooks@alphahealth.demo",
          "Tyler Brooks",
          "oid-st-005",
        ),
      },
    });
    await moderatorCtx.addInitScript((key) => {
      try { localStorage.setItem(key, "coach"); } catch {}
    }, "apex_portal_v1");
    const moderatorPage = await moderatorCtx.newPage();
    const moderatorErrors = [];
    moderatorPage.on("pageerror", (error) => moderatorErrors.push(error.message));
    await moderatorPage.goto(`${BASE}/coach/community`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await moderatorPage.getByRole("button", { name: "Acknowledge" }).click();
    await moderatorPage.getByText("Case acknowledged").waitFor({ timeout: 10000 });
    await moderatorPage.getByLabel("Resolution action").selectOption("route-to-care-team");
    await moderatorPage
      .getByLabel("Moderator note")
      .fill("Synthetic safety concern reviewed and routed to the care team.");
    await moderatorPage.getByRole("button", { name: "Resolve" }).click();
    await moderatorPage.getByText("No open moderation cases").waitFor({ timeout: 10000 });
    if (moderatorErrors.length) {
      done(
        1,
        `SMOKE-UI FAIL: moderator queue errors: ${moderatorErrors.slice(0, 3).join(" | ")}`,
      );
    }
    console.log(
      "ok  Coach moderator: owned queue, acknowledgement, resolution and care-team routing passed",
    );
    await moderatorCtx.close();
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
    // The composer first paints its shell, then applies the authenticated
    // author metadata returned by /api/consults/draft. A fast local browser can
    // finish both before networkidle while a cold CI browser may briefly expose
    // only the shell. Assert the settled workflow, not that intermediate paint.
    await p.waitForFunction(
      () => {
        const body = document.body.innerText.toLowerCase();
        return (
          body.includes("steward") &&
          body.includes("ai draft") &&
          body.includes("sign consult")
        );
      },
      null,
      { timeout: 10000 },
    );
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
