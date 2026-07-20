import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:900,height:1500}, deviceScaleFactor:1.5 });
const errs=[]; p.on("pageerror",e=>errs.push(String(e.message).slice(0,80)));
await p.goto("http://127.0.0.1:3995/portal/community",{waitUntil:"networkidle"});
await p.waitForTimeout(2500);
await p.screenshot({path:".shots/community-top.png"});
console.log("errors:", errs.length?errs[0]:"none");
await b.close();
