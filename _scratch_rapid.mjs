import { chromium } from 'playwright';
const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';

const mainLen = p => p.evaluate(() => { const m = document.querySelector('main'); return m ? m.innerText.trim().length : -1; });
const shellOk = p => p.evaluate(() => !!document.querySelector('a[href="/settings"], aside'));

async function switchPersona(p, label) {
  await p.locator('button[aria-haspopup="listbox"]').click();
  await p.locator('button[role="option"]', { hasText: label }).first().click({ noWaitAfter: true });
}

// scenario: rapid persona switch (two switches with `gap` ms between)
async function scenario(vp, gap, pairs, tag) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: vp });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await p.goto(BASE + '/coach', { waitUntil: 'networkidle' });

  for (const [a, bb] of pairs) {
    try {
      await switchPersona(p, a);
      await p.waitForTimeout(gap);
      await switchPersona(p, bb);
    } catch (e) { /* dropdown may be mid-anim */ }
    await p.waitForTimeout(1200);
    const len = await mainLen(p);
    const url = p.url().replace(BASE, '');
    if (len >= 0 && len < 300) {
      const sb = await shellOk(p);
      console.log(`\n!!! HIT ${tag} vp=${vp.width}x${vp.height} gap=${gap}ms ${a}->${bb} url=${url} len=${len} shell=${sb}`);
      console.log('ERRORS:', errors.join(' || ') || 'none');
      await p.screenshot({ path: `_scratch_hit_${tag}_${gap}.png`, fullPage: false });
      await b.close();
      return { vp, gap, a, b: bb, url, len, sb, errors };
    }
  }
  await b.close();
  return null;
}

const VPS = [{width:2550,height:1438},{width:2560,height:1440},{width:3440,height:1440},{width:1920,height:1080}];
const PAIRS = [['Member','Coach'],['Coach','Member'],['Medical','Member'],['Member','Medical'],['Coach','Medical'],['Medical','Coach']];
const GAPS = [0, 50, 120, 250, 400];

const found = [];
for (const vp of VPS) {
  for (const gap of GAPS) {
    const r = await scenario(vp, gap, PAIRS, `${vp.width}`);
    if (r) found.push(r);
  }
  process.stdout.write(`[${vp.width} done]`);
}
console.log('\nfound=', found.length);
