import { chromium } from 'playwright';
const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';

const probe = p => p.evaluate(() => {
  const m = document.querySelector('main');
  if (!m) return { raw: -1 };
  const walk = (n, acc) => {
    const cs = getComputedStyle(n); const o = acc * parseFloat(cs.opacity);
    if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
    if (!n.children.length) return o;
    let best = 0; for (const c of n.children) best = Math.max(best, walk(c, o)); return best;
  };
  return {
    raw: m.innerText.trim().length,
    eff: m.children.length ? walk(m, 1) : 0,
    kids: m.children.length,
    h: Math.round(m.getBoundingClientRect().height),
    inner: m.innerHTML.length,
  };
});
const blank = r => r.raw >= 0 && (r.raw < 300 || r.eff < 0.05 || r.kids === 0);

async function run(vp, gap, tag) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: vp });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await p.goto(BASE + '/coach', { waitUntil: 'networkidle' });

  const pairs = [
    ['/coach/roster', '/coach/gaps'], ['/coach/gaps', '/coach/roster'],
    ['/clients', '/tasks'], ['/tasks', '/insights'],
    ['/coach/roster', '/clients'], ['/insights', '/coach'],
    ['/coach', '/coach/roster'], ['/coach/orders', '/coach/roster'],
  ];
  const steps = [];
  for (let rep = 0; rep < 3; rep++) {
    for (const [a, c] of pairs) {
      try {
        const la = p.locator(`a[href="${a}"]`).first();
        if (!(await la.count()) || !(await la.isVisible())) continue;
        await la.click({ timeout: 3000, noWaitAfter: true });
        steps.push(`click ${a}`);
        await p.waitForTimeout(gap);
        const lc = p.locator(`a[href="${c}"]`).first();
        if ((await lc.count()) && (await lc.isVisible())) {
          await lc.click({ timeout: 3000, noWaitAfter: true });
          steps.push(`+${gap}ms click ${c}`);
        }
      } catch (e) { steps.push('ERR ' + e.message.split('\n')[0].slice(0, 50)); continue; }
      await p.waitForTimeout(1500);
      let r = await probe(p);
      if (blank(r)) {
        await p.waitForTimeout(3000);
        r = await probe(p);
        if (blank(r)) {
          console.log(`\n!!! HIT tag=${tag} vp=${vp.width}x${vp.height} gap=${gap} url=${p.url().replace(BASE, '')}`);
          console.log('probe', JSON.stringify(r));
          console.log('last steps:', steps.slice(-6).join(' | '));
          console.log('errors:', errors.slice(-8).join(' || ') || 'none');
          await p.screenshot({ path: `_scratch_HITI_${tag}_${gap}.png` });
          await b.close();
          return { tag, vp: `${vp.width}x${vp.height}`, gap, url: p.url().replace(BASE, ''), r, steps: steps.slice(-6), errors: errors.slice(-8) };
        }
      }
    }
  }
  await b.close(); return null;
}

const VPS = [{ width: 2550, height: 1438 }, { width: 3440, height: 1440 }, { width: 1920, height: 1080 }];
const GAPS = [10, 60, 140, 200, 270, 320];
const found = [];
for (const vp of VPS) {
  const rs = await Promise.all(GAPS.map(g => run(vp, g, `${vp.width}`)));
  for (const r of rs) if (r) found.push(r);
  console.log(`${vp.width} done, found=${found.length}`);
}
console.log('TOTAL', found.length, JSON.stringify(found, null, 1));
