// Persona-switch reproduction driver.
const { chromium } = require('playwright');

const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';
const PERSONAS = { Member: '/portal', Coach: '/coach', Medical: '/clinic' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mainText(page) {
  return page.evaluate(() => {
    const m = document.querySelector('main');
    if (!m) return { len: -1, txt: 'NO MAIN' };
    const t = (m.innerText || '').trim();
    return { len: t.length, txt: t.slice(0, 200) };
  });
}
async function sidebarOk(page) {
  return page.evaluate(() => {
    const nav = document.querySelectorAll('aside a, nav a');
    return nav.length;
  });
}

async function switchPersona(page, label) {
  await page.click('button[aria-haspopup="listbox"]');
  await page.waitForSelector('[role="listbox"]', { timeout: 5000 });
  await page.click(`[role="option"]:has-text("${label}")`);
}

(async () => {
  const findings = [];
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 2550, height: 1438 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  // Settle delay between the persona click and the follow-up click.
  const DELAYS = [0, 30, 60, 100, 150, 200, 250, 400];
  const names = Object.keys(PERSONAS);

  await page.goto(BASE + '/coach', { waitUntil: 'networkidle' });

  for (const delay of DELAYS) {
    for (const from of names) {
      for (const to of names) {
        if (from === to) continue;
        // Get into `from` persona, then park on a route owned by a DIFFERENT portal.
        try {
          await switchPersona(page, from);
          await page.waitForTimeout(700);
          // park on a foreign route via in-app sidebar link if possible
          const links = await page.$$eval('aside a[href], nav a[href]', (as) =>
            as.map((a) => a.getAttribute('href')).filter(Boolean)
          );
          const foreign = links.find((h) => h && !h.startsWith(PERSONAS[from]));
          if (foreign) {
            await page.click(`a[href="${foreign}"]`);
            await page.waitForTimeout(500);
          }
          const parked = page.url().replace(BASE, '');

          errors.length = 0;
          // THE ACTION: switch persona, then immediately click a nav link.
          await switchPersona(page, to);
          if (delay > 0) await sleep(delay);
          const newLinks = await page.$$eval('aside a[href], nav a[href]', (as) =>
            as.map((a) => a.getAttribute('href')).filter(Boolean)
          );
          const target = newLinks.find((h) => h && h !== page.url().replace(BASE, ''));
          if (target) {
            await page.click(`a[href="${target}"]`).catch(() => {});
          }
          await page.waitForTimeout(1500);

          const m = await mainText(page);
          const sb = await sidebarOk(page);
          if (m.len < 300 && sb > 0) {
            findings.push({
              route: page.url().replace(BASE, ''),
              steps: `parked on ${parked} as ${from}; persona-switch ${from}->${to}; +${delay}ms clicked ${target}`,
              mainChars: m.len,
              errors: errors.length ? errors.join(' | ') : 'none',
              sample: m.txt,
            });
            console.log('*** REPRO ***', JSON.stringify(findings[findings.length - 1], null, 2));
          }
        } catch (e) {
          console.log('seq err', from, to, delay, e.message.slice(0, 120));
        }
      }
    }
    console.log('delay', delay, 'done; findings so far', findings.length);
  }

  console.log('=== TOTAL FINDINGS', findings.length);
  console.log(JSON.stringify(findings, null, 2));
  await browser.close();
})();
