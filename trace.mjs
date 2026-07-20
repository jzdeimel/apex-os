import { chromium } from "playwright";
const BASE = "https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io";
const run = async () => {
  const b = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
  const ctx = await b.newContext({ viewport: { width: 2550, height: 1438 } });
  const p = await ctx.newPage();
  await p.goto(BASE + "/coach", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);

  await p.evaluate(() => {
    window.__t = [];
    const m = document.querySelector("main");
    const tick = () => {
      window.__t.push([performance.now() | 0,
        [...m.children].map(c => `${(+getComputedStyle(c).opacity).toFixed(2)}|${getComputedStyle(c).transform}|${(c.innerText||'').length}`).join(" ~ ")]);
      requestAnimationFrame(tick);
    };
    tick();
  });

  await p.click('aside nav a[href="/coach/roster"]');
  await p.waitForTimeout(2500);

  const t = await p.evaluate(() => {
    const out = []; let prev = null;
    for (const [ts, v] of window.__t) { if (v !== prev) { out.push(`${ts}  ${v}`); prev = v; } }
    return out;
  });
  console.log("distinct states after clicking /coach/roster (rAF sampled):");
  console.log(t.join("\n"));
  await b.close();
};
run();
