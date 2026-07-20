import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:520,height:1200}, deviceScaleFactor:2 });
const errs=[]; p.on("pageerror",e=>errs.push(String(e.message).slice(0,80)));
await p.goto("http://127.0.0.1:3995/portal/community",{waitUntil:"networkidle"});
await p.waitForTimeout(2200);
const sec = await p.$('section:has(h2:text-is("Community board"))');
if(!sec){ console.log("NOT FOUND"); await b.close(); process.exit(1);}
await sec.screenshot({path:".shots/leaderboard.png"});
console.log((await sec.innerText()).slice(0,420));
console.log("errors:", errs.length?errs[0]:"none");
await b.close();
