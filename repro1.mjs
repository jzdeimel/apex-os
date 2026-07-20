import { chromium } from "playwright";

const BASE = "https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io";

const MEMBER = [
  "/portal", "/portal/progress", "/portal/protocol", "/portal/sites",
  "/portal/labs", "/portal/journal", "/portal/food", "/portal/train",
  "/portal/explore", "/portal/learn", "/portal/library", "/portal/community",
  "/portal/messages", "/portal/book-visit", "/portal/team", "/portal/costs",
  "/portal/receipts", "/portal/refer", "/portal/access", "/portal/consents",
];

const delays = Number(process.argv[2] ?? 120);
const rounds = Number(process.argv[3] ?? 3);

const hits = [];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 2550, height: 1438 } });
const page = await ctx.newPage();

const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

async function mainLen() {
  return page.evaluate(() => {
    const m = document.querySelector("main");
    return m ? m.innerText.trim().length : -1;
  });
}
async function sidebarOk() {
  return page.evaluate(() => !!document.querySelector("aside nav a"));
}

await page.goto(BASE + "/portal", { waitUntil: "networkidle" });

for (let r = 0; r < rounds; r++) {
  const order = r % 2 === 0 ? MEMBER : [...MEMBER].reverse();
  for (const href of order) {
    const link = page.locator(`aside nav a[href="${href}"]`).first();
    if (!(await link.count())) continue;
    errors.length = 0;
    await link.click({ force: true, noWaitAfter: true }).catch(() => {});
    await page.waitForTimeout(delays);
    // settle check
    await page.waitForTimeout(900);
    const len = await mainLen();
    const side = await sidebarOk();
    const url = page.url().replace(BASE, "");
    if (len < 300 && side) {
      hits.push({ round: r, delay: delays, url, len, errors: [...errors] });
      console.log(`*** BLANK r${r} ${url} len=${len} errs=${JSON.stringify(errors)}`);
    }
  }
}

console.log(JSON.stringify({ delay: delays, rounds, hits }, null, 2));
await b.close();
