import { chromium } from 'playwright';
const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';

const probe = p => p.evaluate(() => {
  const m = document.querySelector('main');
  const d = m && m.firstElementChild;
  const cs = d && getComputedStyle(d);
  return {
    raw: m ? m.innerText.trim().length : -1,
    opacity: cs ? cs.opacity : 'n/a',
    transform: cs ? cs.transform : 'n/a',
    sidebar: !!document.querySelector('aside'),
    sidebarText: (document.querySelector('aside')?.innerText || '').trim().length,
  };
});

// Minimal candidate repro: hard load /coach, then ONE client-side click to a sub-route.
async function minimal(vp, from, to, waitMs) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: vp });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.split(';')[0]));
  await p.goto(BASE + from, { waitUntil: 'networkidle' });
  const before = await probe(p);
  await p.locator(`a[href="${to}"]`).first().click({ timeout: 5000, noWaitAfter: true });
  await p.waitForTimeout(waitMs);
  const after = await probe(p);
  await b.close();
  const broken = after.opacity !== '' && parseFloat(after.opacity) < 0.05;
  return { vp: `${vp.width}x${vp.height}`, from, to, waitMs, before, after, errs: [...new Set(errs)], broken };
}

const VPS = [
  { width: 2550, height: 1438 }, { width: 2560, height: 1440 }, { width: 3440, height: 1440 },
  { width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1280, height: 800 },
];
console.log('=== A: viewport sweep, /coach -> /coach/roster, single click, 5s settle ===');
for (const vp of VPS) {
  const rs = [];
  for (let i = 0; i < 3; i++) rs.push(await minimal(vp, '/coach', '/coach/roster', 5000));
  console.log(`${vp.width}x${vp.height}: broken ${rs.filter(r => r.broken).length}/3  opacity=[${rs.map(r => r.after.opacity).join(',')}] rawLen=[${rs.map(r => r.after.raw).join(',')}] sidebar=[${rs.map(r => r.after.sidebar).join(',')}] errs=${JSON.stringify(rs[0].errs)}`);
}

console.log('\n=== B: route pairs at 2550x1438 ===');
const PAIRS = [
  ['/coach', '/coach/roster'], ['/coach', '/coach/gaps'], ['/coach', '/clients'],
  ['/coach', '/tasks'], ['/coach', '/insights'], ['/coach', '/coach/orders'],
  ['/portal', '/portal/food'], ['/portal', '/portal/labs'], ['/clinic', '/clients'],
  ['/coach/roster', '/coach'], ['/clients', '/tasks'],
];
for (const [f, t] of PAIRS) {
  try {
    const r = await minimal({ width: 2550, height: 1438 }, f, t, 5000);
    console.log(`${f} -> ${t}: broken=${r.broken} opacity=${r.after.opacity} raw=${r.after.raw} transform=${r.after.transform} errs=${JSON.stringify(r.errs)}`);
  } catch (e) { console.log(`${f} -> ${t}: SKIP ${e.message.split('\n')[0].slice(0, 70)}`); }
}
