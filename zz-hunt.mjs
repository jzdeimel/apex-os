import { chromium } from "playwright";

const BASE = "https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io";
const VP = { width: 2550, height: 1438 };
const PERSONAS = ["Client Portal", "Medical Console", "Coach Console"];

const seed = process.argv[2] || "none";
const iterations = Number(process.argv[3] || 1);

const LS = {
  none: {},
  coach: { apex_portal_v1: "coach" },
  patient: { apex_portal_v1: "patient" },
  clinic: { apex_portal_v1: "clinic" },
  stale: { apex_portal_v1: "provider" },
  empty: { apex_portal_v1: "" },
  corrupt: { apex_portal_v1: '{"id":"coach"', alphaos_state_v1: "{{{bad" },
}[seed] || {};

const findings = [];

async function measure(page) {
  return page.evaluate(() => {
    const m = document.querySelector("main");
    const side = document.querySelector("aside");
    return {
      main: m ? m.innerText.trim().length : -1,
      mainHTML: m ? m.innerHTML.length : -1,
      snippet: m ? m.innerHTML.slice(0, 500) : "",
      sidebar: side ? side.innerText.trim().length : -1,
      url: location.pathname,
    };
  });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VP });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
await ctx.addInitScript((ls) => {
  try { for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); } catch {}
}, LS);

await page.goto(BASE + "/coach", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

const trail = [];
async function log(label) {
  const r = await measure(page);
  trail.push(`${label} -> ${r.url} main=${r.main}`);
  const blank = r.main >= 0 && r.main < 300 && r.sidebar > 50;
  if (blank) {
    findings.push({
      seed, route: r.url, step: label, main: r.main, mainHTML: r.mainHTML,
      snippet: r.snippet, errors: errors.slice(-8), trail: trail.slice(-12),
    });
    console.log(`!! BLANK [${seed}] ${r.url} after "${label}" text=${r.main} html=${r.mainHTML}`);
    console.log(`   snippet: ${r.snippet.slice(0, 200)}`);
    console.log(`   trail: ${trail.slice(-6).join(" ;; ")}`);
  }
  return blank;
}

async function persona(name, settle) {
  const btn = page.locator('button[aria-haspopup="listbox"]').first();
  if (!(await btn.count())) return false;
  await btn.click({ noWaitAfter: true }).catch(() => {});
  await page.waitForTimeout(260);
  const opt = page.locator('[role="option"]').filter({ hasText: name }).first();
  if (!(await opt.count())) { await page.keyboard.press("Escape").catch(() => {}); return false; }
  await opt.click({ noWaitAfter: true }).catch(() => {});
  await page.waitForTimeout(settle);
  return true;
}

// Synchronous in-page double navigation: click two sidebar links within one frame gap.
async function doubleNav(gapMs) {
  return page.evaluate(async (gap) => {
    const links = Array.from(document.querySelectorAll("aside nav a[href^='/']"));
    if (links.length < 4) return null;
    const a = links[Math.floor(Math.random() * links.length)];
    const b = links[Math.floor(Math.random() * links.length)];
    a.click();
    await new Promise((r) => setTimeout(r, gap));
    b.click();
    return [a.getAttribute("href"), b.getAttribute("href")];
  }, gapMs);
}

for (let it = 0; it < iterations; it++) {
  // Phase 1: full three-way persona rotation, settled
  for (const p of PERSONAS) {
    if (await persona(p, 1100)) await log(`P1 persona=${p} settled`);
  }

  // Phase 2: persona switch sampled mid-transition at many offsets
  for (const off of [40, 80, 120, 160, 200, 260, 320]) {
    for (const p of PERSONAS) {
      if (await persona(p, off)) {
        await log(`P2 persona=${p} +${off}ms`);
        await page.waitForTimeout(1200);
        await log(`P2 persona=${p} +${off}ms settled`);
      }
    }
  }

  // Phase 3: persona switch then IMMEDIATE sidebar nav (interrupt router.push)
  for (const off of [0, 30, 60, 100, 150, 220]) {
    for (const p of PERSONAS) {
      const btn = page.locator('button[aria-haspopup="listbox"]').first();
      await btn.click({ noWaitAfter: true }).catch(() => {});
      await page.waitForTimeout(260);
      const opt = page.locator('[role="option"]').filter({ hasText: p }).first();
      if (!(await opt.count())) { await page.keyboard.press("Escape").catch(() => {}); continue; }
      await opt.click({ noWaitAfter: true }).catch(() => {});
      await page.waitForTimeout(off);
      await page.evaluate(() => {
        const l = document.querySelectorAll("aside nav a[href^='/']");
        if (l.length > 3) l[3 + Math.floor(Math.random() * (l.length - 3))].click();
      }).catch(() => {});
      await page.waitForTimeout(1400);
      await log(`P3 persona=${p} +${off}ms then nav`);
    }
  }

  // Phase 4: synchronous double-nav at sub-frame gaps (interrupt exit animation)
  for (const gap of [0, 16, 40, 80, 120, 180, 250]) {
    for (let k = 0; k < 4; k++) {
      const pair = await doubleNav(gap).catch(() => null);
      await page.waitForTimeout(1400);
      await log(`P4 doubleNav gap=${gap} ${JSON.stringify(pair)}`);
    }
  }

  // Phase 5: switch persona while ON a foreign route (coach route -> member persona)
  for (const route of ["/coach/roster", "/portal/food", "/coach", "/portal"]) {
    await page.evaluate((r) => {
      const a = document.querySelector(`aside nav a[href="${r}"]`);
      if (a) a.click();
    }, route).catch(() => {});
    await page.waitForTimeout(1200);
    for (const p of PERSONAS) {
      if (await persona(p, 1200)) await log(`P5 on ${route} persona=${p}`);
      if (await persona(p, 90)) await log(`P5 on ${route} persona=${p} +90ms`);
      await page.waitForTimeout(1100);
      await log(`P5 on ${route} persona=${p} resettled`);
    }
  }

  // Phase 6: back/forward churn
  for (let i = 0; i < 8; i++) { await page.goBack().catch(() => {}); await page.waitForTimeout(750); await log(`P6 back#${i}`); }
  for (let i = 0; i < 8; i++) { await page.goForward().catch(() => {}); await page.waitForTimeout(750); await log(`P6 fwd#${i}`); }
}

await browser.close();
console.log(`\n### seed=${seed} findings=${findings.length} steps=${trail.length}`);
if (findings.length) console.log(JSON.stringify(findings, null, 2));
