import { chromium } from "playwright";

const BASE = "https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io";

const MEMBER = [
  "/portal", "/portal/progress", "/portal/protocol", "/portal/sites",
  "/portal/labs", "/portal/journal", "/portal/food", "/portal/train",
  "/portal/explore", "/portal/learn", "/portal/library", "/portal/community",
  "/portal/messages", "/portal/book-visit", "/portal/team", "/portal/costs",
  "/portal/receipts", "/portal/refer", "/portal/access", "/portal/consents",
];

// gap = ms between the two rapid clicks (interrupting the 280ms exit anim)
const gap = Number(process.argv[2] ?? 100);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 2550, height: 1438 } });
const page = await ctx.newPage();

const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

const hits = [];

await page.goto(BASE + "/portal", { waitUntil: "networkidle" });

async function probe(steps) {
  await page.waitForTimeout(2000); // full settle
  const r = await page.evaluate(() => {
    const m = document.querySelector("main");
    return {
      len: m ? m.innerText.trim().length : -1,
      side: !!document.querySelector("aside nav a"),
      html: m ? m.innerHTML.length : -1,
    };
  });
  const url = page.url().replace(BASE, "");
  if (r.len < 300 && r.side) {
    hits.push({ url, ...r, gap, steps, errors: [...errors] });
    console.log(`*** BLANK ${url} len=${r.len} htmlLen=${r.html} gap=${gap}`);
    console.log(`    steps: ${steps}`);
    console.log(`    errors: ${JSON.stringify(errors)}`);
  }
  return r;
}

async function click(href) {
  const l = page.locator(`aside nav a[href="${href}"]`).first();
  if (!(await l.count())) return false;
  await l.click({ force: true, noWaitAfter: true }).catch(() => {});
  return true;
}

// Pairwise rapid navigation: click A, wait `gap`, click B (interrupts exit)
for (let i = 0; i < MEMBER.length; i++) {
  const a = MEMBER[i];
  const bb = MEMBER[(i + 3) % MEMBER.length];
  errors.length = 0;
  await click(a);
  await page.waitForTimeout(gap);
  await click(bb);
  await probe(`from ${page.url().replace(BASE, "")}: click ${a}, +${gap}ms, click ${bb}`);
  if (hits.length) break;
}

// Triple rapid navigation
if (!hits.length) {
  for (let i = 0; i < MEMBER.length; i++) {
    errors.length = 0;
    const seq = [MEMBER[i], MEMBER[(i + 5) % MEMBER.length], MEMBER[(i + 9) % MEMBER.length]];
    for (const h of seq) { await click(h); await page.waitForTimeout(gap); }
    await probe(`triple gap=${gap}: ${seq.join(" -> ")}`);
    if (hits.length) break;
  }
}

// Same-route repeat hammering
if (!hits.length) {
  for (const h of ["/portal/food", "/portal/library", "/portal/progress", "/portal/train"]) {
    errors.length = 0;
    for (let k = 0; k < 6; k++) {
      await click(h);
      await page.waitForTimeout(gap);
      await click("/portal");
      await page.waitForTimeout(gap);
    }
    await click(h);
    await probe(`hammer ${h} <-> /portal x6 gap=${gap}`);
    if (hits.length) break;
  }
}

console.log(JSON.stringify({ gap, hits }, null, 2));
await b.close();
