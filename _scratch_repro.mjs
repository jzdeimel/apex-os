import { chromium } from 'playwright';

const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';
const VIEWPORTS = [
  { width: 2550, height: 1438, name: '2550x1438' },
  { width: 2560, height: 1440, name: '2560x1440' },
  { width: 3440, height: 1440, name: '3440x1440' },
  { width: 1920, height: 1080, name: '1920x1080' },
];

const hits = [];

async function mainLen(p) {
  try {
    return await p.evaluate(() => {
      const m = document.querySelector('main');
      return m ? m.innerText.trim().length : -1;
    });
  } catch { return -2; }
}
async function sidebarOk(p) {
  try { return await p.evaluate(() => !!document.querySelector('aside, nav')); } catch { return false; }
}

async function switchPersona(p, label) {
  const trigger = p.locator('button[aria-haspopup="listbox"]');
  await trigger.click();
  const opt = p.locator('button[role="option"]', { hasText: label }).first();
  await opt.click();
}

async function run(vp, seed) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  const steps = [];
  const log = s => steps.push(s);

  await p.goto(BASE + '/coach', { waitUntil: 'networkidle' });
  log('goto /coach');

  const personas = ['Coach', 'Member', 'Medical'];
  const routes = ['/coach/roster', '/portal/food', '/clients', '/coach/gaps', '/tasks', '/insights', '/portal', '/coach'];

  let rnd = seed;
  const rand = (n) => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd % n; };

  for (let i = 0; i < 40; i++) {
    const action = rand(10);
    try {
      if (action < 4) {
        const per = personas[rand(personas.length)];
        log(`persona -> ${per}`);
        await switchPersona(p, per);
      } else if (action < 8) {
        const r = routes[rand(routes.length)];
        const link = p.locator(`a[href="${r}"]`).first();
        if (await link.count() > 0 && await link.isVisible()) {
          log(`click link ${r}`);
          await link.click({ timeout: 3000 });
        } else {
          log(`pushState ${r}`);
          await p.evaluate(u => window.next?.router?.push?.(u), r);
          continue;
        }
      } else if (action === 8) {
        log('history back');
        await p.goBack({ waitUntil: 'commit' }).catch(()=>{});
      } else {
        // resize DURING a transition
        const r = routes[rand(routes.length)];
        const link = p.locator(`a[href="${r}"]`).first();
        if (await link.count() > 0 && await link.isVisible()) {
          log(`click ${r} + resize mid-transition`);
          await link.click({ timeout: 3000, noWaitAfter: true });
          await p.waitForTimeout(60);
          await p.setViewportSize({ width: vp.width - 600, height: vp.height });
          await p.waitForTimeout(80);
          await p.setViewportSize({ width: vp.width, height: vp.height });
        }
      }
    } catch (e) {
      log(`ERR during step: ${e.message.split('\n')[0]}`);
      continue;
    }

    await p.waitForTimeout(700);
    const len = await mainLen(p);
    const url = p.url().replace(BASE, '');
    if (len >= 0 && len < 300) {
      const sb = await sidebarOk(p);
      hits.push({ vp: vp.name, seed, url, len, sidebar: sb, steps: [...steps], errors: [...errors] });
      console.log(`\n!!! HIT vp=${vp.name} seed=${seed} url=${url} len=${len} sidebar=${sb}`);
      console.log('STEPS:', steps.join(' | '));
      console.log('ERRORS:', errors.join(' || ') || 'none');
      await p.screenshot({ path: `_scratch_hit_${vp.name}_${seed}_${i}.png` });
      break;
    }
  }
  await b.close();
}

const seeds = Number(process.argv[2] || 3);
for (const vp of VIEWPORTS) {
  for (let s = 1; s <= seeds; s++) {
    process.stdout.write(`.`);
    await run(vp, s * 7919);
  }
}
console.log('\nDONE. hits=', hits.length);
