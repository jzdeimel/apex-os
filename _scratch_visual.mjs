import { chromium } from 'playwright';
const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';

// Ground-truth "is main visually blank": walks main, computes effective opacity
// chain + visibility, and reports the visible text length AND the raw innerText
// length, so we can distinguish "no DOM" from "DOM present but invisible".
async function probe(p) {
  return p.evaluate(() => {
    const m = document.querySelector('main');
    if (!m) return { raw: -1, visible: -1, note: 'no main' };
    const raw = m.innerText.trim().length;
    let minOpacity = 1;
    const details = [];
    let el = m.firstElementChild;
    while (el) {
      const cs = getComputedStyle(el);
      details.push({ tag: el.tagName, cls: el.className?.toString?.().slice(0, 60), opacity: cs.opacity, transform: cs.transform, display: cs.display, visibility: cs.visibility, h: el.getBoundingClientRect().height });
      el = el.nextElementSibling;
    }
    // effective opacity of deepest text container
    const walk = (node, acc) => {
      const cs = getComputedStyle(node);
      const o = acc * parseFloat(cs.opacity);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      if (!node.children.length) return o;
      let best = 0;
      for (const c of node.children) best = Math.max(best, walk(c, o));
      return best;
    };
    const eff = m.children.length ? walk(m, 1) : 0;
    const rect = m.getBoundingClientRect();
    return { raw, effOpacity: eff, childCount: m.children.length, height: rect.height, details };
  });
}

const isBlank = r => r.raw >= 0 && (r.raw < 300 || r.effOpacity < 0.05 || r.height < 80);

async function switchPersona(p, label) {
  await p.locator('button[aria-haspopup="listbox"]').click({ timeout: 4000 });
  await p.locator('button[role="option"]', { hasText: label }).first().click({ timeout: 4000, noWaitAfter: true });
}

async function session(vp, seed, label) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dsf || 1 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  const steps = [];
  let result = null;
  try {
    await p.goto(BASE + '/coach', { waitUntil: 'domcontentloaded' });
    steps.push('goto /coach');
    const personas = ['Coach', 'Member', 'Medical'];
    const routes = ['/coach/roster', '/portal/food', '/clients', '/coach/gaps', '/tasks', '/portal', '/coach', '/insights'];
    let rnd = seed;
    const rand = n => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd % n; };

    for (let i = 0; i < 30 && !result; i++) {
      const a = rand(12);
      try {
        if (a < 5) {
          const per = personas[rand(3)];
          steps.push(`persona->${per}`);
          await switchPersona(p, per);
        } else if (a < 10) {
          const r = routes[rand(routes.length)];
          const link = p.locator(`a[href="${r}"]`).first();
          if (await link.count() && await link.isVisible()) { steps.push(`link ${r}`); await link.click({ timeout: 3000, noWaitAfter: true }); }
          else continue;
        } else if (a === 10) {
          steps.push('back'); await p.goBack({ waitUntil: 'commit' }).catch(() => {});
        } else {
          const per = personas[rand(3)];
          steps.push(`persona->${per} +resize`);
          await switchPersona(p, per);
          await p.waitForTimeout(50);
          await p.setViewportSize({ width: vp.width - 700, height: vp.height });
          await p.waitForTimeout(60);
          await p.setViewportSize({ width: vp.width, height: vp.height });
        }
      } catch (e) { steps.push('ERR:' + e.message.split('\n')[0].slice(0, 60)); continue; }

      await p.waitForTimeout(900);
      const r = await probe(p);
      if (isBlank(r)) {
        // confirm it is stable, not just mid-animation
        await p.waitForTimeout(2500);
        const r2 = await probe(p);
        if (isBlank(r2)) {
          result = { label, vp: `${vp.width}x${vp.height}${vp.dsf ? '@' + vp.dsf : ''}`, seed, url: p.url().replace(BASE, ''), probe: r2, steps: [...steps], errors: [...errors] };
          await p.screenshot({ path: `_scratch_HIT_${label}_${seed}.png` });
        }
      }
    }
  } catch (e) { steps.push('FATAL:' + e.message.slice(0, 120)); }
  await b.close();
  return result;
}

const VPS = [
  { width: 2550, height: 1438 }, { width: 2560, height: 1440 },
  { width: 3440, height: 1440 }, { width: 1920, height: 1080 },
  { width: 2560, height: 700 }, { width: 2560, height: 1440, dsf: 1.5 },
];
const seeds = [11, 23, 37, 41];
const jobs = [];
for (const vp of VPS) for (const s of seeds) jobs.push({ vp, s });

const found = [];
const CONC = 6;
for (let i = 0; i < jobs.length; i += CONC) {
  const batch = jobs.slice(i, i + CONC);
  const rs = await Promise.all(batch.map(j => session(j.vp, j.s, `${j.vp.width}x${j.vp.height}${j.vp.dsf ? 'x' + j.vp.dsf : ''}`)));
  for (const r of rs) if (r) { found.push(r); console.log('\n!!! HIT', JSON.stringify(r, null, 1)); }
  console.log(`batch ${i / CONC + 1}/${Math.ceil(jobs.length / CONC)} done, found=${found.length}`);
}
console.log('TOTAL HITS', found.length);
