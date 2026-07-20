import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:480,height:900}, deviceScaleFactor:2 });
const errs=[]; p.on("pageerror",e=>errs.push(String(e.message).slice(0,80)));
await p.goto("http://127.0.0.1:3995/portal",{waitUntil:"networkidle"});
await p.waitForTimeout(2200);
await p.click('button:has-text("Mark taken")'); await p.waitForTimeout(400);
await p.click('button:has-text("Abdomen")');
// Catch it mid-sequence: chain drawn, pulse travelling, curve rising.
await p.waitForTimeout(950);
await p.screenshot({path:".shots/burst.png"});
const txt = await p.textContent('body');
console.log("burst visible:", /Logged/.test(txt||"") && /residues|Recorded/.test(txt||""));
console.log("errors:", errs.length?errs[0]:"none");
await b.close();
