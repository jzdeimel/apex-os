// Minimal deterministic repro + hit rate, and verify refresh heals it.
const { chromium } = require('playwright');
const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIS = () => {
  const m = document.querySelector('main');
  const k = m && m.firstElementChild;
  const cs = k ? getComputedStyle(k) : null;
  return { url: location.pathname, opacity: cs ? parseFloat(cs.opacity) : null,
           transform: cs ? cs.transform : null, textLen: (m ? (m.innerText||'').trim() : '').length,
           htmlLen: m ? m.innerHTML.length : -1, side: document.querySelectorAll('aside a[href]').length };
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 2550, height: 1438 }, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type()==='error') errs.push('CONSOLE: ' + m.text()); });

  // A: two sidebar nav clicks, GAP ms apart, fired in-page (no CDP latency).
  for (const GAP of [60, 100, 140, 180, 220, 260, 400]) {
    let hits = 0, n = 8;
    for (let i = 0; i < n; i++) {
      await page.goto(BASE + '/coach', { waitUntil: 'domcontentloaded' });
      await sleep(1400);
      await page.evaluate(async ([gap]) => {
        const g = (h) => document.querySelector(`aside a[href="${h}"]`);
        g('/coach/roster').click();
        await new Promise(r => setTimeout(r, gap));
        const b = g('/insights') || g('/tasks'); if (b) b.click();
      }, [GAP]);
      await sleep(2500);
      const v = await page.evaluate(VIS);
      if (v.opacity !== null && v.opacity < 0.15) hits++;
    }
    console.log(`A two-nav gap=${GAP}ms -> blank ${hits}/${n}`);
  }

  // B: persona switch then immediate nav click (the owner's exact flow).
  for (const GAP of [80, 150, 250]) {
    let hits = 0, n = 8;
    for (let i = 0; i < n; i++) {
      await page.goto(BASE + '/coach/roster', { waitUntil: 'domcontentloaded' });
      await sleep(1400);
      await page.locator('header button[aria-haspopup="listbox"]').first().click();
      await page.locator('[role="option"]', { hasText: 'Medical' }).first().waitFor();
      await page.evaluate(async ([gap]) => {
        const opt = Array.from(document.querySelectorAll('[role="option"]')).find(o => (o.innerText||'').includes('Medical'));
        opt.click();
        await new Promise(r => setTimeout(r, gap));
        const a = document.querySelector('aside a[href="/clinic/escalations"]') || document.querySelector('aside a[href="/insights"]');
        if (a) a.click();
      }, [GAP]);
      await sleep(2500);
      const v = await page.evaluate(VIS);
      if (v.opacity !== null && v.opacity < 0.15) hits++;
    }
    console.log(`B persona-switch+nav gap=${GAP}ms -> blank ${hits}/${n}`);
  }

  // C: prove refresh heals a stuck page.
  await page.goto(BASE + '/coach', { waitUntil: 'domcontentloaded' });
  await sleep(1400);
  let stuck = null;
  for (let i = 0; i < 25 && !stuck; i++) {
    await page.evaluate(async () => {
      const g = (h) => document.querySelector(`aside a[href="${h}"]`);
      const a = g('/coach/roster'), b = g('/insights');
      if (a) a.click();
      await new Promise(r => setTimeout(r, 120));
      if (b) b.click();
    });
    await sleep(2200);
    const v = await page.evaluate(VIS);
    if (v.opacity !== null && v.opacity < 0.15) stuck = v;
    else { await page.goto(BASE + '/coach', { waitUntil: 'domcontentloaded' }); await sleep(1200); }
  }
  console.log('C stuck state:', JSON.stringify(stuck));
  if (stuck) {
    await page.screenshot({ path: 'confirm-stuck.png' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(1800);
    console.log('C after refresh:', JSON.stringify(await page.evaluate(VIS)));
    await page.screenshot({ path: 'confirm-healed.png' });
  }
  console.log('ERRORS:', JSON.stringify(Array.from(new Set(errs)).slice(0, 6), null, 2));
  await browser.close();
})();
