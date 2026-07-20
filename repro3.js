const { chromium } = require('playwright');
const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';
const HOME = { Member: '/portal', Coach: '/coach', Medical: '/clinic' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SW = 'header button[aria-haspopup="listbox"]';
const log = (...a) => { process.stdout.write(a.join(' ') + '\n'); };

async function probe(page) {
  return page.evaluate(() => {
    const m = document.querySelector('main');
    const t = m ? (m.innerText || '').trim() : '';
    return {
      len: m ? t.length : -1,
      sample: t.slice(0, 200).replace(/\s+/g, ' '),
      sideLinks: document.querySelectorAll('aside a[href]').length,
      mainHTML: m ? m.innerHTML.length : -1,
      url: location.pathname,
      hasMain: !!m,
    };
  });
}

async function switchPersona(page, label) {
  await page.locator(SW).first().click({ timeout: 6000 });
  const opt = page.locator('[role="option"]', { hasText: label }).first();
  await opt.click({ timeout: 6000 });
}

async function navLinks(page) {
  const ls = await page.$$eval('aside a[href]', (as) =>
    Array.from(new Set(as.map((a) => a.getAttribute('href')).filter(Boolean)))
  );
  return ls.filter((h) => h.startsWith('/') && h !== '/' && !h.startsWith('/card') && !h.startsWith('/intake') && h !== '/book');
}

(async () => {
  const findings = [];
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 2550, height: 1438 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  let errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  const names = ['Member', 'Coach', 'Medical'];
  const DELAYS = [0, 50, 100, 150, 200, 250, 300, 450];
  let iter = 0;

  for (const delay of DELAYS) {
    for (const from of names) {
      for (const to of names) {
        if (from === to) continue;
        iter++;
        try {
          // Reset to a known good state by hard load of the `from` home ONCE.
          await page.goto(BASE + HOME[from], { waitUntil: 'domcontentloaded', timeout: 25000 });
          await sleep(1200);

          // Park on a deep route owned by `from`, via in-app click.
          const l1 = await navLinks(page);
          const deep = l1.filter((h) => h !== HOME[from]);
          const park = deep[iter % Math.max(deep.length, 1)];
          if (park) { await page.click(`aside a[href="${park}"]`, { timeout: 5000 }).catch(() => {}); await sleep(1000); }
          const parked = (await probe(page)).url;

          // ACTION: persona switch, then in-app nav click after `delay` ms.
          errors = [];
          await switchPersona(page, to);
          await sleep(delay);
          const l2 = await navLinks(page);
          const cur = new URL(page.url()).pathname;
          const target = l2.find((h) => h !== cur) || null;
          let clicked = null;
          if (target) {
            const ok = await page.click(`aside a[href="${target}"]`, { timeout: 4000 }).then(() => true).catch(() => false);
            if (ok) clicked = target;
          }
          await sleep(1800);

          const p = await probe(page);
          const bad = p.hasMain && p.len < 300 && p.sideLinks > 0;
          log(`#${iter} d=${delay} ${from}->${to} parked=${parked} clicked=${clicked} final=${p.url} mainChars=${p.len} err=${errors.length}`);
          if (bad) {
            const f = {
              route: p.url,
              viewport: '2550x1438',
              steps: `hard-load ${HOME[from]} as ${from}; in-app click to ${parked}; persona-switch ${from}->${to} via top-right switcher; +${delay}ms in-app click sidebar link ${clicked}`,
              mainChars: p.len,
              errors: errors.length ? errors.join(' | ') : 'none',
              sample: p.sample,
              mainHTML: p.mainHTML,
            };
            findings.push(f);
            log('*** REPRO ***\n' + JSON.stringify(f, null, 2));
            await page.screenshot({ path: `repro-${findings.length}.png`, fullPage: false }).catch(() => {});
          } else if (errors.length) {
            log('   errors seen (content ok): ' + errors.join(' | ').slice(0, 300));
          }
        } catch (e) {
          log(`#${iter} d=${delay} ${from}->${to} EXC ${e.message.split('\n')[0].slice(0, 90)} url=${page.url().replace(BASE, '')}`);
        }
      }
    }
    log(`--- delay ${delay} done, findings=${findings.length} ---`);
  }

  log('=== TOTAL ' + findings.length);
  log(JSON.stringify(findings, null, 2));
  await browser.close();
})();
