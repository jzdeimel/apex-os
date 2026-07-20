import { chromium } from "playwright";

const BASE = "https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io";

const MEMBER = [
  "/portal", "/portal/progress", "/portal/protocol", "/portal/sites",
  "/portal/labs", "/portal/journal", "/portal/food", "/portal/train",
  "/portal/explore", "/portal/learn", "/portal/library", "/portal/community",
  "/portal/messages", "/portal/book-visit", "/portal/team", "/portal/costs",
  "/portal/receipts", "/portal/refer", "/portal/access", "/portal/consents",
];

const gap = Number(process.argv[2] ?? 60);
const hits = [];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 2550, height: 1438 } });
const page = await ctx.newPage();

const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

async function probe(steps) {
  await page.waitForTimeout(1800);
  const r = await page.evaluate(() => {
    const m = document.querySelector("main");
    return {
      len: m ? m.innerText.trim().length : -1,
      side: !!document.querySelector("aside nav a"),
      htmlLen: m ? m.innerHTML.length : -1,
      html: m ? m.innerHTML.slice(0, 400) : "",
    };
  });
  const url = page.url().replace(BASE, "");
  if (r.len < 300 && r.side) {
    hits.push({ url, len: r.len, htmlLen: r.htmlLen, html: r.html, steps, errors: [...errors] });
    console.log(`*** BLANK ${url} len=${r.len} htmlLen=${r.htmlLen}`);
    console.log(`    steps: ${steps}`);
    console.log(`    errors: ${JSON.stringify(errors)}`);
    console.log(`    mainHTML: ${r.html}`);
  }
  return r;
}

async function clickNav(href) {
  const l = page.locator(`aside nav a[href="${href}"]`).first();
  if (!(await l.count())) return false;
  await l.click({ force: true, noWaitAfter: true }).catch(() => {});
  return true;
}

// Persona switch via the top-right switcher
async function switchPersona(label) {
  const btn = page.locator('button[aria-haspopup="listbox"]').last();
  await btn.click({ force: true, noWaitAfter: true }).catch(() => {});
  await page.waitForTimeout(250);
  const opt = page.locator(`[role="option"]:has-text("${label}")`).first();
  if (!(await opt.count())) { console.log("no option " + label); return false; }
  await opt.click({ force: true, noWaitAfter: true }).catch(() => {});
  return true;
}

await page.goto(BASE + "/portal", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

const personas = ["Coach", "Member", "Medical", "Member", "Coach", "Member"];

outer:
for (let cycle = 0; cycle < 4 && !hits.length; cycle++) {
  for (const p of personas) {
    errors.length = 0;
    await switchPersona(p);
    await page.waitForTimeout(gap);
    const r0 = await probe(`cycle${cycle}: persona -> ${p}`);
    if (hits.length) break outer;

    // now walk member routes if we're in member portal
    if (page.url().includes("/portal")) {
      for (const href of MEMBER) {
        errors.length = 0;
        await clickNav(href);
        await page.waitForTimeout(gap);
        await probe(`cycle${cycle}: persona ${p} then nav ${href} (gap ${gap})`);
        if (hits.length) break outer;
      }
    }

    // rapid: switch persona then immediately click a nav link
    errors.length = 0;
    await switchPersona("Member");
    await page.waitForTimeout(gap);
    await clickNav("/portal/food");
    await probe(`cycle${cycle}: persona->Member +${gap}ms click /portal/food`);
    if (hits.length) break outer;
  }
}

console.log(JSON.stringify({ gap, hits }, null, 2));
await b.close();
