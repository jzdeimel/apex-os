import { chromium } from "playwright";
const BASE = process.env.BASE ?? "https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io";
const ROUTES = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
for (const r of ROUTES) {
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e.message).split("\n")[0].slice(0, 90)));
  await p.goto(BASE + r, { waitUntil: "networkidle", timeout: 60000 }).catch(()=>{});
  await p.waitForTimeout(1500);
  const m = await p.evaluate(() => {
    const de = document.documentElement;
    const over = de.scrollWidth - de.clientWidth;
    // Which elements stick out past the viewport?
    const vw = de.clientWidth;
    const bad = [];
    for (const el of Array.from(document.querySelectorAll("main *"))) {
      const rect = el.getBoundingClientRect();
      if (rect.right > vw + 2 && rect.width > 40) {
        bad.push({ tag: el.tagName, cls: (el.className||"").toString().slice(0,70), right: Math.round(rect.right), w: Math.round(rect.width) });
      }
    }
    const main = document.querySelector("main");
    let visible = 0;
    if (main) for (const el of Array.from(main.children)) {
      const cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) > 0.05 && cs.visibility !== "hidden") visible += (el.innerText||"").trim().length;
    }
    return { over, vw, visible, bad: bad.slice(0, 6), badCount: bad.length };
  });
  const flag = m.over > 2 ? "OVERFLOW" : m.visible < 200 ? "EMPTY" : "ok";
  console.log(`${flag.padEnd(9)} ${r}  overflowPx=${m.over} visibleChars=${m.visible} offenders=${m.badCount}${errs.length?` errs=${errs.length}`:""}`);
  for (const x of m.bad) console.log(`            ${x.tag} w=${x.w} right=${x.right} .${x.cls}`);
  await p.screenshot({ path: `.shots/mob${r.replace(/\//g,"-")}.png`, fullPage: false });
  await p.close();
}
await b.close();
