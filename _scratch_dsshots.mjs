import { chromium } from 'playwright';
const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';
const OUT = process.argv[2];
const b = await chromium.launch();
const jobs = [
  ['/portal', 1440, 900, 'm-portal-d'],
  ['/portal/labs', 1440, 900, 'm-labs-d'],
  ['/portal/protocol', 1440, 900, 'm-protocol-d'],
  ['/coach', 1440, 900, 'c-coach-d'],
  ['/coach/gaps', 1440, 900, 'c-gaps-d'],
  ['/clinic', 1440, 900, 'x-clinic-d'],
  ['/clinic/ledger', 1440, 900, 'x-ledger-d'],
  ['/analytics', 1440, 900, 'x-analytics-d'],
  ['/portal', 390, 844, 'm-portal-m'],
  ['/coach', 390, 844, 'c-coach-m'],
  ['/clinic/ledger', 390, 844, 'x-ledger-m'],
];
for (const [r, w, h, name] of jobs) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  try {
    await p.goto(BASE + r, { waitUntil: 'networkidle', timeout: 45000 });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    await p.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true, timeout: 20000 }).catch(() => {});
    console.log('shot', name);
  } catch (e) { console.log('fail', name, e.message.slice(0, 60)); }
  await ctx.close();
}
await b.close();
