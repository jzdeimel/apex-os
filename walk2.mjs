import { chromium } from "playwright";

const BASE = "https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io";
const ITER = Number(process.env.ITER || 200);
const FAST = process.env.FAST === "1";
const HIDE = process.env.HIDE === "1"; // background the tab during navs
const SEED = Number(process.env.SEED || 1);

let s = SEED >>> 0;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const probe = () =>
  `(() => {
    const m = document.querySelector('main');
    const aside = document.querySelector('aside');
    if (!m) return null;
    const kids = [...m.children].map(c => {
      const cs = getComputedStyle(c);
      return { op: +cs.opacity, tf: cs.transform, vis: cs.visibility, disp: cs.display, txt: (c.innerText||'').trim().length };
    });
    // effective visible text: text inside children whose opacity > 0.05
    const visTxt = kids.filter(k => k.op > 0.05 && k.vis !== 'hidden' && k.disp !== 'none')
                       .reduce((a,k) => a + k.txt, 0);
    return {
      url: location.pathname,
      side: (aside?.innerText||'').trim().length,
      domTxt: (m.innerText||'').trim().length,
      visTxt, kids, nKids: m.children.length,
      hidden: document.hidden,
    };
  })()`;

const run = async () => {
  const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ viewport: { width: 2550, height: 1438 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push({ t: "pageerror", msg: e.message.split("\n")[0] }));
  page.on("console", (m) => { if (m.type() === "error") errors.push({ t: "console", msg: m.text() }); });

  await page.goto(BASE + "/coach", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const history = [];
  const findings = [];

  for (let i = 0; i < ITER; i++) {
    const before = errors.length;
    let act = null;
    const mode = rnd();

    if (HIDE && rnd() < 0.5) {
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { value: true, configurable: true });
        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      act = "[tab->hidden] ";
    } else act = "";

    try {
      if (mode < 0.60) {
        const links = await page.$$("aside nav a");
        if (!links.length) { await page.goto(BASE + "/coach"); continue; }
        const el = pick(links);
        const href = await el.getAttribute("href");
        act += `click nav ${href}`;
        await el.click({ timeout: 3000 });
      } else if (mode < 0.82) {
        const btn = await page.$('button[aria-haspopup="listbox"]');
        if (btn) {
          await btn.click({ timeout: 3000 });
          await page.waitForTimeout(200);
          const opts = await page.$$('[role="option"]');
          if (opts.length) {
            const o = pick(opts);
            act += `persona -> ${(await o.innerText()).split("\n")[0]}`;
            await o.click({ timeout: 3000 });
          } else { act += "no opts"; await page.keyboard.press("Escape"); }
        } else act += "no persona btn";
      } else if (mode < 0.92) { act += "back"; await page.goBack({ waitUntil: "commit" }); }
      else { act += "forward"; await page.goForward({ waitUntil: "commit" }); }
    } catch (e) { act += ` [ERR ${e.message.split("\n")[0]}]`; }

    history.push(act); if (history.length > 8) history.shift();

    await page.waitForTimeout(FAST ? 40 + Math.floor(rnd() * 180) : 450 + Math.floor(rnd() * 400));

    if (HIDE) {
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { value: false, configurable: true });
        Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      }).catch(() => {});
    }

    let st = await page.evaluate(probe()).catch(() => null);
    if (!st) continue;

    const bad = (x) => x && x.side > 100 && (x.visTxt < 300 || x.domTxt < 300);
    if (bad(st)) {
      await page.waitForTimeout(3000); // generous settle
      const st2 = await page.evaluate(probe()).catch(() => null);
      if (bad(st2)) {
        const f = {
          iter: i, url: st2.url, domTxt: st2.domTxt, visTxt: st2.visTxt,
          nKids: st2.nKids, kids: st2.kids, steps: history.slice(-6),
          errors: errors.slice(before).length ? errors.slice(before) : errors.slice(-2),
        };
        findings.push(f);
        console.log("\n*** BLANK ***\n" + JSON.stringify(f, null, 2));
        await page.screenshot({ path: `blank2-${SEED}-${i}.png` });
        await page.goto(BASE + "/coach", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200);
      }
    }
    if (i % 25 === 0) process.stdout.write(`[${i} dom=${st.domTxt} vis=${st.visTxt} k=${st.nKids}] `);
  }

  console.log(`\n=== seed=${SEED} FAST=${FAST} HIDE=${HIDE} blanks=${findings.length} errs=${errors.length}`);
  await browser.close();
};
run();
