import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 1200 }, deviceScaleFactor: 2 });
await p.goto("http://127.0.0.1:3995/portal", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
const sec = await p.$('section:has(h2:text-is("Today\'s doses"))');
if (!sec) { console.log("SECTION NOT FOUND"); await b.close(); process.exit(1); }
// Expand the working on the first dose card.
const btn = await sec.$('button:has-text("How we got that number")');
if (btn) { await btn.click(); await p.waitForTimeout(700); }
await sec.screenshot({ path: ".shots/todaydoses.png" });
const txt = (await sec.innerText()).slice(0, 500);
console.log(txt);
await b.close();
