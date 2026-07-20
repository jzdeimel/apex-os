// Precise in-page timing: race the persona-switch router.push against a
// second client-side navigation, inside AppShell's AnimatePresence mode="wait"
// exit window (0.28s).
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';
const HOME = { Member: '/portal', Coach: '/coach', Medical: '/clinic' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const log = (s) => { process.stdout.write(s + '\n'); fs.appendFileSync('repro4.log', s + '\n'); };

async function probe(page) {
  return page.evaluate(() => {
    const m = document.querySelector('main');
    const t = m ? (m.innerText || '').trim() : '';
    return {
      len: m ? t.length : -1, hasMain: !!m,
      sample: t.slice(0, 200).replace(/\s+/g, ' '),
      sideLinks: document.querySelectorAll('aside a[href]').length,
      mainHTML: m ? m.innerHTML.length : -1,
      url: location.pathname,
    };
  });
}

// Open the top-right persona menu, click the option for `label`, then after
// `gap` ms (measured IN THE PAGE, no CDP round trip) click sidebar link `href`.
async function racedSwitch(page, label, gap, href) {
  await page.locator('header button[aria-haspopup="listbox"]').first().click({ timeout: 6000 });
  await page.locator('[role="option"]', { hasText: label }).first().waitFor({ timeout: 6000 });
  return page.evaluate(
    ([label, gap, href]) => {
      const opt = Array.from(document.querySelectorAll('[role="option"]')).find((o) =>
        (o.innerText || '').includes(label)
      );
      if (!opt) return 'no-option';
      opt.click();
      return new Promise((res) => {
        setTimeout(() => {
          const a = document.querySelector(`aside a[href="${href}"]`);
          if (!a) return res('no-link:' + href);
          a.click();
          res('ok');
        }, gap);
      });
    },
    [label, gap, href]
  );
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 2550, height: 1438 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(9000);
  let errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  const names = ['Member', 'Coach', 'Medical'];
  const GAPS = [0, 10, 30, 60, 90, 120, 160, 200, 240, 270];
  const findings = [];
  let iter = 0;

  for (const gap of GAPS) {
    for (const from of names) {
      for (const to of names) {
        if (from === to) continue;
        iter++;
        try {
          await page.goto(BASE + HOME[from], { waitUntil: 'domcontentloaded', timeout: 25000 });
          await sleep(1300);
          // park on a deep route of `from` (in-app)
          const l1 = (await page.$$eval('aside a[href]', (as) =>
            Array.from(new Set(as.map((a) => a.getAttribute('href'))))
          )).filter((h) => h && h.startsWith('/') && h !== '/' && h !== HOME[from]);
          const park = l1[iter % Math.max(l1.length, 1)];
          if (park) { await page.click(`aside a[href="${park}"]`, { timeout: 5000 }).catch(() => {}); await sleep(1100); }
          const parked = (await probe(page)).url;

          // pick a link that will EXIST after the switch (target persona's own nav)
          const raceHref = HOME[from] === parked ? HOME[to] : parked;

          errors = [];
          const r = await racedSwitch(page, to, gap, raceHref);
          await sleep(2000);
          const p = await probe(page);
          const bad = p.hasMain && p.len < 300 && p.sideLinks > 0;
          log(`#${iter} gap=${gap} ${from}->${to} parked=${parked} race=${raceHref}(${r}) final=${p.url} main=${p.len} html=${p.mainHTML} err=${errors.length}`);
          if (bad) {
            const f = {
              route: p.url, viewport: '2550x1438',
              steps: `load ${HOME[from]}; in-app click to ${parked}; open top-right persona switcher, click "${to}"; ${gap}ms later click sidebar link ${raceHref}`,
              mainChars: p.len, mainHTML: p.mainHTML,
              errors: errors.length ? errors.join(' | ') : 'none',
              sample: p.sample,
            };
            findings.push(f);
            log('*** REPRO ***\n' + JSON.stringify(f, null, 2));
            await page.screenshot({ path: `repro4-${findings.length}.png` }).catch(() => {});
          }
          if (errors.length) log('   ERRORS: ' + errors.join(' | ').slice(0, 400));
        } catch (e) {
          log(`#${iter} gap=${gap} ${from}->${to} EXC ${e.message.split('\n')[0].slice(0, 90)}`);
        }
      }
    }
    log(`--- gap ${gap} done findings=${findings.length} ---`);
  }
  log('=== TOTAL ' + findings.length);
  log(JSON.stringify(findings, null, 2));
  fs.writeFileSync('repro4.json', JSON.stringify(findings, null, 2));
  await browser.close();
})();
