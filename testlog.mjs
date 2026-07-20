import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:430,height:1400}, deviceScaleFactor:2 });
const errs=[]; p.on("pageerror",e=>errs.push(String(e.message).slice(0,90)));
await p.goto("http://127.0.0.1:3995/portal",{waitUntil:"networkidle"});
await p.waitForTimeout(2000);

const before = await p.textContent('section:has(h2:text-is("Today")) header');
console.log("header before:", before?.replace(/\s+/g," ").trim());

// 1. Mark a dose taken -> should open site picker
const mark = await p.$('button:has-text("Mark taken")');
if(!mark){ console.log("FAIL: no Mark taken button"); await b.close(); process.exit(1); }
await mark.click(); await p.waitForTimeout(500);
const sitePrompt = await p.$('text=Where did you inject?');
console.log("site picker opened:", !!sitePrompt);

// 2. Pick the suggested site
const site = await p.$('button:has-text("Abdomen")');
await site.click(); await p.waitForTimeout(700);
const loggedTxt = await p.textContent('section:has(h2:text-is("Today"))');
console.log("dose logged:", /Logged/.test(loggedTxt||""));

// 3. Log weight
const wt = await p.$('input[aria-label="Today\'s weight in pounds"]');
if(wt){ await wt.fill("212.4"); await p.click('button:has-text("Log")'); await p.waitForTimeout(600); }
console.log("weight logged:", /212\.4/.test(await p.textContent('section:has(h2:text-is("Today"))')||""));

// 4. Answer all four feel questions
for(const q of ["Energy","Sleep","Body","Head"]){
  const btn = await p.$(`button[aria-label="${q}: 4 out of 5"]`);
  if(btn){ await btn.click(); await p.waitForTimeout(200); }
}
await p.waitForTimeout(900);
const after = await p.textContent('section:has(h2:text-is("Today")) header');
console.log("header after:", after?.replace(/\s+/g," ").trim());

// 5. Completion animation
const done = await p.$('text=Everything logged');
console.log("completion animation fired:", !!done);
await p.screenshot({ path:".shots/logged.png" });

// 6. Persistence across reload
await p.reload({waitUntil:"networkidle"}); await p.waitForTimeout(1800);
const persisted = await p.textContent('section:has(h2:text-is("Today"))');
console.log("persisted after reload:", /Logged/.test(persisted||"") && /212\.4/.test(persisted||""));
console.log("page errors:", errs.length ? errs[0] : "none");
await b.close();
