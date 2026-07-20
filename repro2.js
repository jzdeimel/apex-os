const { chromium } = require('playwright');
const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';
const HOME = { Member: '/portal', Coach: '/coach', Medical: '/clinic' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SW = 'header button[aria-haspopup="listbox"]';

async function probe(page) {
  return page.evaluate(() => {
    const m = document.querySelector('main');
    const t = m ? (m.innerText || '').trim() : '';
    const sideLinks = document.querySelectorAll('aside a[href]').length;
    return {
      len: m ? t.length : -1,
      sample: t.slice(0, 160).replace(/\n/g, ' / '),
      sideLinks,
      mainHTML: m ? m.innerHTML.length : -1,
      url: location.pathname,
    };
  });
}

async function switchPersona(page, label) {
  await page.locator(SW).first().click();
  await page.locator('[role="option"]', { hasText: label }).first().waitFor({ timeout: 4000 });
  await page.locator('[role="option"]', { hasText: label }).first().click();
}

async function navLinks(page) {
  return page.$$eval('aside a[href]', (as) =>
    Array.from(new Set(as.map((a) => a.getAttribute('href')).filter((h) => h && h.startsWith('/'))))
  );
}

(async () => {
  const findings = [];
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 2550, height: 1438 } });
  const page = await ctx.newPage();
  let errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(BASE + '/coach', { waitUntil: 'networkidle' });
  await sleep(800);

  const names = ['Member', 'Coach', 'Medical'];
  // Delays between the persona click and the follow-up in-app click.
  const DELAYS = [0, 40, 80, 120, 160, 200, 240, 300, 500];

  for (const delay of DELAYS) {
    for (const from of names) {
      for (const to of names) {
        if (from === to) continue;
        try {
          // 1. Land in `from` persona.
          await switchPersona(page, from);
          await sleep(900);

          // 2. Park on a route this persona owns (deep, not home).
          const l1 = await navLinks(page);
          const deep = l1.filter((h) => h !== HOME[from] && h.split('/').length > 2);
          const park = deep[Math.floor(Math.random() * deep.length)] || l1[1];
          if (park) { await page.click(`aside a[href="${park}"]`).catch(() => {}); await sleep(900); }
          const parked = await probe(page);

          // 3. THE ACTION: persona switch, then an in-app click after `delay`.
          errors = [];
          await switchPersona(page, to);
          await sleep(delay);
          const l2 = await navLinks(page);
          const target = l2.find((h) => h !== page.url().replace(BASE, ''));
          let clicked = null;
          if (target) {
            const ok = await page.click(`aside a[href="${target}"]`, { timeout: 3000 }).then(() => true).catch(() => false);
            if (ok) clicked = target;
          }
          await sleep(1600);

          const p = await probe(page);
          if (p.len < 300 && p.sideLinks > 0) {
            const f = {
              route: p.url,
              viewport: '2550x1438',
              steps: `on ${parked.url} as ${from} -> persona-switch to ${to} -> after ${delay}ms clicked sidebar link ${clicked}`,
              mainChars: p.len,
              errors: errors.length ? errors.join(' | ') : 'none',
              sample: p.sample,
              mainHTML: p.mainHTML,
            };
            findings.push(f);
            console.log('*** REPRO ***\n' + JSON.stringify(f, null, 2));
            await page.screenshot({ path: `repro-${findings.length}.png` });
          }
        } catch (e) {
          console.log('ERR', from, '->', to, delay, e.message.split('\n')[0].slice(0, 100), 'url=', page.url().replace(BASE, ''));
          await page.goto(BASE + '/coach', { waitUntil: 'networkidle' }).catch(() => {});
          await sleep(600);
        }
      }
    }
    console.log(`[delay ${delay}] cumulative findings: ${findings.length}`);
  }

  console.log('=== TOTAL', findings.length);
  console.log(JSON.stringify(findings, null, 2));
  await browser.close();
})();
