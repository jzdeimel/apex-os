import { chromium } from "playwright";

const BASE = "https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io";
const VP = { width: 2550, height: 1438 };

const seedVariants = [
  { name: "empty-storage", ls: {} },
  { name: "portal=coach", ls: { apex_portal_v1: "coach" } },
  { name: "portal=patient", ls: { apex_portal_v1: "patient" } },
  { name: "portal=clinic", ls: { apex_portal_v1: "clinic" } },
  { name: "portal=STALE(provider)", ls: { apex_portal_v1: "provider" } },
  { name: "portal=empty-string", ls: { apex_portal_v1: "" } },
  { name: "portal=malformed-json", ls: { apex_portal_v1: '{"id":"coach"' } },
  {
    name: "coach + stale alphaos state",
    ls: {
      apex_portal_v1: "coach",
      alphaos_state_v1: JSON.stringify({
        role: "Coach",
        locationFilter: "loc-gone",
        tasks: [{ id: "t-old", title: "stale" }],
        notes: [{ id: "n-old", body: "stale" }],
        favorites: { "cl-nonexistent": true },
      }),
    },
    ss: { apex_tour_v1: "1" },
  },
  {
    name: "coach + corrupt alphaos state",
    ls: { apex_portal_v1: "coach", alphaos_state_v1: "{{{not json" },
  },
];

async function measure(page) {
  return page.evaluate(() => {
    const m = document.querySelector("main");
    const side = document.querySelector("aside");
    return {
      main: m ? m.innerText.trim().length : -1,
      mainHTML: m ? m.innerHTML.length : -1,
      mainSnippet: m ? m.innerHTML.slice(0, 400) : "",
      sidebar: side ? side.innerText.trim().length : -1,
      url: location.pathname,
    };
  });
}

const findings = [];

async function run(variant) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VP });
  const errors = [];
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });

  await ctx.addInitScript(
    ({ ls, ss }) => {
      try {
        for (const [k, v] of Object.entries(ls || {})) window.localStorage.setItem(k, v);
        for (const [k, v] of Object.entries(ss || {})) window.sessionStorage.setItem(k, v);
      } catch {}
    },
    { ls: variant.ls, ss: variant.ss || {} },
  );

  await page.goto(BASE + "/coach", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.keyboard.press("Escape").catch(() => {});

  const steps = [];
  const log = async (label) => {
    const r = await measure(page);
    steps.push(`${label} -> ${r.url} main=${r.main}`);
    if (r.main >= 0 && r.main < 300 && r.sidebar > 50) {
      findings.push({
        variant: variant.name,
        route: r.url,
        step: label,
        main: r.main,
        mainHTML: r.mainHTML,
        mainSnippet: r.mainSnippet,
        errors: errors.slice(-6),
        trail: steps.slice(-10),
      });
      console.log(
        `  !! BLANK [${variant.name}] @ ${r.url} after "${label}" mainText=${r.main} mainHTML=${r.mainHTML}`,
      );
    }
  };

  await log("initial /coach");

  const pickPersona = async (name, settleMs) => {
    const btn = page.locator('button[aria-haspopup="listbox"]');
    if (!(await btn.count())) return false;
    await btn.first().click().catch(() => {});
    await page.waitForTimeout(220);
    const opt = page.locator('[role="option"]').filter({ hasText: name });
    if (!(await opt.count())) {
      await page.keyboard.press("Escape").catch(() => {});
      return false;
    }
    await opt.first().click({ noWaitAfter: true }).catch(() => {});
    await page.waitForTimeout(settleMs);
    return true;
  };

  // Phase A: slow persona switching
  for (let i = 0; i < 2; i++) {
    for (const p of ["Coach", "Medical", "Member"]) {
      if (await pickPersona(p, 1000)) await log(`A: persona->${p} (settled)`);
    }
  }

  // Phase B: fast persona switching, sampled mid-exit AND after settle
  for (let i = 0; i < 9; i++) {
    const p = ["Coach", "Medical", "Member"][i % 3];
    if (await pickPersona(p, 110)) {
      await log(`B: persona->${p} (+110ms)`);
      await page.waitForTimeout(1100);
      await log(`B: persona->${p} (settled)`);
    }
  }

  // Phase C: persona switch, then immediately click a sidebar link (interrupt push)
  for (let i = 0; i < 6; i++) {
    const p = ["Coach", "Medical", "Member"][i % 3];
    const btn = page.locator('button[aria-haspopup="listbox"]');
    if (!(await btn.count())) break;
    await btn.first().click().catch(() => {});
    await page.waitForTimeout(220);
    const opt = page.locator('[role="option"]').filter({ hasText: p });
    if (!(await opt.count())) { await page.keyboard.press("Escape").catch(() => {}); continue; }
    await opt.first().click({ noWaitAfter: true }).catch(() => {});
    await page.waitForTimeout(50 + i * 25);
    const link = page.locator("aside nav a[href^='/']").nth(2 + (i % 5));
    if (await link.count()) await link.click({ force: true, noWaitAfter: true }).catch(() => {});
    await page.waitForTimeout(1300);
    await log(`C: persona->${p} +${50 + i * 25}ms then sidebar nav`);
  }

  // Phase D: sidebar link -> interrupt -> persona switch
  for (let i = 0; i < 6; i++) {
    const link = page.locator("aside nav a[href^='/']").nth(1 + (i % 6));
    if (await link.count()) await link.click({ force: true, noWaitAfter: true }).catch(() => {});
    await page.waitForTimeout(60 + i * 20);
    const p = ["Member", "Coach", "Medical"][i % 3];
    await pickPersona(p, 1300);
    await log(`D: nav +${60 + i * 20}ms then persona->${p}`);
  }

  // Phase E: back/forward through the persona-switch history
  for (let i = 0; i < 6; i++) {
    await page.goBack().catch(() => {});
    await page.waitForTimeout(800);
    await log(`E: back #${i}`);
  }
  for (let i = 0; i < 6; i++) {
    await page.goForward().catch(() => {});
    await page.waitForTimeout(800);
    await log(`E: forward #${i}`);
  }

  await browser.close();
  return { variant: variant.name, steps, errors };
}

for (const v of seedVariants) {
  console.log("=== " + v.name);
  try {
    const r = await run(v);
    if (r.errors.length) console.log("  errors:", r.errors.slice(0, 4).join(" | "));
  } catch (e) {
    console.log("  RUN FAIL:", e.message.split("\n")[0]);
  }
}

console.log("\n######## FINDINGS: " + findings.length);
console.log(JSON.stringify(findings, null, 2));
