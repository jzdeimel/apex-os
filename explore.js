const { chromium } = require('playwright');
const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 2550, height: 1438 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text()); });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

  await page.goto(BASE + '/coach', { waitUntil: 'networkidle' });
  console.log('URL', page.url());
  console.log('switcher buttons:', await page.$$eval('button[aria-haspopup="listbox"]', (b) => b.length));
  console.log('all top buttons:', await page.$$eval('header button, [class*=topbar] button', (bs) => bs.map(b => (b.innerText||'').replace(/\n/g,' | ').slice(0,60))));

  await page.click('button[aria-haspopup="listbox"]');
  await page.waitForTimeout(600);
  const opts = await page.$$eval('[role="option"]', (os) => os.map(o => (o.innerText||'').replace(/\n/g,' | ')));
  console.log('OPTIONS:', JSON.stringify(opts, null, 2));
  await browser.close();
})();
