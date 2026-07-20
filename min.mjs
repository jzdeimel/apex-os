import { chromium } from "playwright";
const BASE = "https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io";
const GAP = Number(process.env.GAP || 120);

const probe = `(() => {
  const m = document.querySelector('main'); const a = document.querySelector('aside');
  const k = [...m.children].map(c => { const s = getComputedStyle(c);
    return { opacity:+s.opacity, transform:s.transform, textLen:(c.innerText||'').trim().length }; });
  return { url: location.pathname, sidebarLen:(a?.innerText||'').trim().length, kids:k };
})()`;

const run = async () => {
  const b = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
  const ctx = await b.newContext({ viewport: { width: 2550, height: 1438 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push("pageerror: " + e.message.split("\n")[0]));
  p.on("console", m => m.type() === "error" && errs.push("console: " + m.text()));

  await p.goto(BASE + "/coach", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2000);
  errs.length = 0; // discard first-load hydration noise

  // Two sidebar nav clicks separated by less than the 0.28s exit animation.
  console.log("step 1: click /coach/roster");
  await p.click('aside nav a[href="/coach/roster"]');
  await p.waitForTimeout(GAP);
  console.log(`step 2: after ${GAP}ms click /coach/consults`);
  await p.click('aside nav a[href="/coach/consults"]');

  await p.waitForTimeout(4000); // settle well past every animation
  const st = await p.evaluate(probe);
  console.log("\nGAP=" + GAP, JSON.stringify(st, null, 2));
  console.log("errors during interaction:", errs.length ? errs : "NONE");
  await p.screenshot({ path: `min-gap${GAP}.png` });

  // does a hard reload fix it, as the owner reports?
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  console.log("after reload:", JSON.stringify(await p.evaluate(probe)));
  await b.close();
};
run();
