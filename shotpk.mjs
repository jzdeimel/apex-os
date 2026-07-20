import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 2 });
await p.goto("http://127.0.0.1:3995/portal/library", { waitUntil: "networkidle" });
await p.waitForTimeout(1800);
const card = await p.$('article:has(:text-is("Semaglutide"))');
const btn = await card.$('button:has-text("What it is")');
await btn.click();
await p.waitForTimeout(1200);
// Click a dose marker to show the missed-dose comparison.
const dots = await card.$$('svg circle[r="4"]');
if (dots[3]) await dots[3].click();
await p.waitForTimeout(900);
await card.screenshot({ path: ".shots/pk-sema.png" });
console.log("dose markers:", dots.length);
await b.close();
