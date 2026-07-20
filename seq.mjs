import { chromium } from "playwright";
const BASE = "https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io";
const START = process.env.START || "/coach";
const GAP = Number(process.env.GAP || 1500);
const TARGETS = (process.env.TARGETS || "/coach/roster,/coach/consults,/coach/gaps,/tasks,/coach/roster").split(",");

const probe = `(() => { const m=document.querySelector('main');
  return [...m.children].map(c=>{const s=getComputedStyle(c);
    return {opacity:+s.opacity, transform:s.transform, textLen:(c.innerText||'').trim().length};}); })()`;

const run = async () => {
  const b = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
  const ctx = await b.newContext({ viewport: { width: 2550, height: 1438 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => console.log("  !! pageerror:", e.message.split("\n")[0]));

  await p.goto(BASE + START, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  console.log(`initial load ${START}:`, JSON.stringify(await p.evaluate(probe)));

  let n = 0;
  for (const t of TARGETS) {
    n++;
    const sel = `aside nav a[href="${t}"]`;
    const has = await p.$(sel);
    if (!has) { console.log(`nav#${n} ${t}: link not in sidebar, skipping`); continue; }
    await p.click(sel);
    await p.waitForTimeout(GAP);
    const st = await p.evaluate(probe);
    const vis = st.some(k => k.opacity > 0.05);
    console.log(`nav#${n} -> ${t} : ${vis ? "VISIBLE" : "*** INVISIBLE ***"} ${JSON.stringify(st)}`);
  }
  await b.close();
};
run();
