import { chromium } from "playwright";

const BASE = "https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io";
const ITER = Number(process.env.ITER || 250);
const FAST = process.env.FAST === "1"; // sub-animation-duration delays
const SEED = Number(process.env.SEED || 1);

let s = SEED >>> 0;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const run = async () => {
  const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ viewport: { width: 2550, height: 1438 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on("pageerror", (e) => errors.push({ t: "pageerror", msg: e.message, stack: e.stack }));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push({ t: "console", msg: m.text() });
  });

  await page.goto(BASE + "/coach", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const history = [];
  const record = (a) => { history.push(a); if (history.length > 8) history.shift(); };

  const mainLen = () =>
    page.evaluate(() => {
      const m = document.querySelector("main");
      const aside = document.querySelector("aside");
      return {
        main: (m?.innerText || "").trim().length,
        side: (aside?.innerText || "").trim().length,
        url: location.pathname,
        // is the animated wrapper present at all?
        kids: m ? m.children.length : -1,
        innerHTML: m ? m.innerHTML.length : -1,
      };
    });

  const findings = [];

  for (let i = 0; i < ITER; i++) {
    const before = errors.length;
    let act = null;

    const mode = rnd();
    try {
      if (mode < 0.62) {
        // click a sidebar nav link
        const links = await page.$$("aside nav a");
        if (!links.length) { await page.goto(BASE + "/coach"); continue; }
        const el = pick(links);
        const href = await el.getAttribute("href");
        act = `click sidebar link ${href}`;
        await el.click({ timeout: 3000 });
      } else if (mode < 0.80) {
        // persona switcher (top-right)
        const btn = await page.$('header button[aria-haspopup="listbox"], button[aria-haspopup="listbox"]');
        if (!btn) { act = "persona btn missing"; }
        else {
          await btn.click({ timeout: 3000 });
          await page.waitForTimeout(180);
          const opts = await page.$$('[role="option"]');
          if (opts.length) {
            const o = pick(opts);
            const label = (await o.innerText()).split("\n")[0];
            act = `persona switch -> ${label}`;
            await o.click({ timeout: 3000 });
          } else { act = "persona opts missing"; await page.keyboard.press("Escape"); }
        }
      } else if (mode < 0.90) {
        act = "back";
        await page.goBack({ waitUntil: "commit" });
      } else {
        act = "forward";
        await page.goForward({ waitUntil: "commit" });
      }
    } catch (e) {
      act = (act || "?") + ` [ACTION ERR: ${e.message.split("\n")[0]}]`;
    }

    record(act);

    // Delay: FAST mode fires the next action mid exit-animation (0.28s)
    const wait = FAST ? 40 + Math.floor(rnd() * 200) : 500 + Math.floor(rnd() * 500);
    await page.waitForTimeout(wait);

    const st = await mainLen().catch(() => null);
    if (!st) continue;

    if (st.main < 300 && st.side > 100) {
      // settle check: give animations a full chance before declaring blank
      await page.waitForTimeout(2500);
      const st2 = await mainLen();
      if (st2.main < 300 && st2.side > 100) {
        const newErrs = errors.slice(before);
        findings.push({
          iter: i,
          url: st2.url,
          mainLen: st2.main,
          mainKids: st2.kids,
          mainHTML: st2.innerHTML,
          steps: history.slice(-6),
          errors: newErrs.length ? newErrs : errors.slice(-3),
          allErrCount: errors.length,
        });
        console.log("\n*** BLANK ***", JSON.stringify(findings[findings.length - 1], null, 2));
        await page.screenshot({ path: `blank-${SEED}-${i}.png` });
        // reset
        await page.goto(BASE + "/coach", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1000);
      }
    }
    if (i % 25 === 0) process.stdout.write(`[${i}/${ITER} err=${errors.length} main=${st.main}] `);
  }

  console.log("\n=== DONE seed", SEED, "FAST", FAST, "blanks:", findings.length, "errors:", errors.length);
  if (errors.length) console.log(JSON.stringify(errors.slice(0, 12), null, 2));
  await browser.close();
  return findings;
};

run();
