// Long random in-app walk with CONTINUOUS blank-main detection.
// Never reloads after the initial load: everything is client-side interaction.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOG = process.env.LOG || 'walk.log';
const log = (s) => { process.stdout.write(s + '\n'); fs.appendFileSync(LOG, s + '\n'); };

const PERSONAS = ['Member', 'Coach', 'Medical'];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({
    viewport: { width: 2550, height: 1438 },
    timezoneId: process.env.TZ_ID || 'America/New_York',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(7000);
  let errors = [];
  const net404 = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) net404.push(r.status() + ' ' + r.url().replace(BASE, '')); });
  page.on('requestfailed', (r) => net404.push('FAILED ' + r.url().replace(BASE, '') + ' ' + (r.failure() || {}).errorText));

  await page.goto(BASE + '/coach', { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  const findings = [];
  const history = [];
  const STEPS = parseInt(process.env.STEPS || '400', 10);

  for (let i = 0; i < STEPS; i++) {
    let action = 'none';
    try {
      const roll = Math.random();
      if (roll < 0.28) {
        // top-right persona switcher
        const p = PERSONAS[Math.floor(Math.random() * 3)];
        action = `personaSwitcher->${p}`;
        await page.locator('header button[aria-haspopup="listbox"]').first().click({ timeout: 5000 });
        await page.locator('[role="option"]', { hasText: p }).first().click({ timeout: 5000 });
      } else if (roll < 0.42) {
        // sidebar portal switcher
        const labels = ['Client Portal', 'Medical Console', 'Coach Console'];
        const l = labels[Math.floor(Math.random() * 3)];
        action = `sidebarPortal->${l}`;
        await page.locator('aside button[aria-haspopup="listbox"]').first().click({ timeout: 5000 });
        await page.locator('aside [role="option"]', { hasText: l }).first().click({ timeout: 5000 });
      } else if (roll < 0.85) {
        // sidebar nav link
        const links = (await page.$$eval('aside a[href]', (as) =>
          Array.from(new Set(as.map((a) => a.getAttribute('href'))))
        )).filter((h) => h && h.startsWith('/') && h !== '/');
        if (!links.length) { action = 'no-links'; }
        else {
          const h = links[Math.floor(Math.random() * links.length)];
          action = `navLink ${h}`;
          await page.click(`aside a[href="${h}"]`, { timeout: 5000 });
        }
      } else if (roll < 0.93) {
        action = 'back';
        await page.goBack({ waitUntil: 'commit', timeout: 5000 });
      } else {
        action = 'forward';
        await page.goForward({ waitUntil: 'commit', timeout: 5000 });
      }
    } catch (e) {
      action += ' [EXC ' + e.message.split('\n')[0].slice(0, 60) + ']';
    }

    // Randomized settle: sometimes fire the NEXT action inside the 280ms
    // AnimatePresence exit window, sometimes let it settle fully.
    const settle = Math.random() < 0.5 ? Math.floor(Math.random() * 280) : 900 + Math.floor(Math.random() * 700);
    await sleep(settle);
    history.push(`${action} (+${settle}ms)`);
    if (history.length > 12) history.shift();

    // Detect blank main; confirm it PERSISTS (not just mid-animation).
    let p;
    try {
      p = await page.evaluate(() => {
        const m = document.querySelector('main');
        const t = m ? (m.innerText || '').trim() : '';
        return { len: m ? t.length : -1, hasMain: !!m, mainHTML: m ? m.innerHTML.length : -1,
                 side: document.querySelectorAll('aside a[href]').length, url: location.pathname,
                 sample: t.slice(0, 200).replace(/\s+/g, ' ') };
      });
    } catch { continue; }

    if (p.hasMain && p.len < 300 && p.side > 0) {
      await sleep(2500); // let any animation finish
      const p2 = await page.evaluate(() => {
        const m = document.querySelector('main');
        const t = m ? (m.innerText || '').trim() : '';
        return { len: m ? t.length : -1, hasMain: !!m, mainHTML: m ? m.innerHTML.length : -1,
                 side: document.querySelectorAll('aside a[href]').length, url: location.pathname,
                 sample: t.slice(0, 200).replace(/\s+/g, ' ') };
      });
      if (p2.hasMain && p2.len < 300 && p2.side > 0) {
        const f = {
          route: p2.url, viewport: '2550x1438', mainChars: p2.len, mainHTML: p2.mainHTML,
          steps: history.join('  ->  '),
          errors: errors.length ? errors.slice(-8).join(' | ') : 'none',
          net: net404.slice(-8).join(' | ') || 'none',
          sample: p2.sample,
        };
        findings.push(f);
        log('*** REPRO ***\n' + JSON.stringify(f, null, 2));
        await page.screenshot({ path: `walk-repro-${findings.length}.png` }).catch(() => {});
        fs.writeFileSync(LOG.replace('.log', '.json'), JSON.stringify(findings, null, 2));
        // recover
        await page.goto(BASE + '/coach', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(1200);
        history.length = 0;
      }
    }
    if (i % 25 === 0) log(`[${i}] url=${p.url} main=${p.len} findings=${findings.length} errs=${errors.length} net=${net404.length}`);
  }

  log('=== DONE steps=' + STEPS + ' findings=' + findings.length);
  log('ERRORS SEEN: ' + JSON.stringify(Array.from(new Set(errors)).slice(0, 20), null, 2));
  log('NET PROBLEMS: ' + JSON.stringify(Array.from(new Set(net404)).slice(0, 20), null, 2));
  fs.writeFileSync(LOG.replace('.log', '.json'), JSON.stringify(findings, null, 2));
  await browser.close();
})();
