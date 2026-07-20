import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';

const ROUTES = {
  member: ['/portal', '/portal/protocol', '/portal/labs', '/portal/progress', '/portal/journal',
           '/portal/messages', '/portal/explore', '/portal/learn', '/portal/costs', '/portal/team',
           '/portal/food', '/portal/train', '/portal/community', '/portal/receipts'],
  coach:  ['/coach', '/coach/roster', '/coach/consults', '/coach/orders', '/coach/gaps',
           '/coach/winback', '/coach/subscriptions', '/coach/handoff', '/coach/training',
           '/clients', '/tasks', '/schedule', '/insights'],
  clinic: ['/clinic', '/clinic/sign', '/clinic/escalations', '/clinic/ledger',
           '/admin/quality', '/admin/roster', '/admin/capacity', '/admin/effectiveness',
           '/analytics', '/recommendations', '/supply-chain', '/automations'],
};

const EXTRACT = () => {
  const out = {
    url: location.pathname,
    cardSigs: {},
    typo: {},
    radii: {},
    charts: { svgs: 0, kinds: {}, strokes: {}, fills: {} },
    counts: {},
    maxFont: 0,
    docHeight: document.documentElement.scrollHeight,
  };
  const els = Array.from(document.querySelectorAll('main *, [role=main] *'));
  const all = els.length ? els : Array.from(document.querySelectorAll('body *'));
  out.counts.totalEls = all.length;

  for (const el of all) {
    const cs = getComputedStyle(el);
    const bw = parseFloat(cs.borderTopWidth) || 0;
    const br = parseFloat(cs.borderTopLeftRadius) || 0;
    const rect = el.getBoundingClientRect();

    if (br > 0) out.radii[cs.borderTopLeftRadius] = (out.radii[cs.borderTopLeftRadius] || 0) + 1;

    // Card shell heuristic: rounded >=10px, has a visible border, area > 4000px
    if (br >= 10 && bw >= 0.5 && rect.width * rect.height > 4000) {
      const sig = [
        'r' + Math.round(br),
        'bw' + bw,
        cs.borderTopColor.replace(/\s/g, ''),
        cs.backgroundColor.replace(/\s/g, ''),
        'p' + cs.paddingTop + '/' + cs.paddingLeft,
      ].join(' | ');
      out.cardSigs[sig] = (out.cardSigs[sig] || 0) + 1;
    }

    // Typography: elements with direct text
    const direct = Array.from(el.childNodes)
      .filter(n => n.nodeType === 3 && n.textContent.trim().length > 0)
      .map(n => n.textContent.trim()).join(' ');
    if (direct.length > 0 && rect.width > 0) {
      const fs_ = Math.round(parseFloat(cs.fontSize) * 10) / 10;
      const key = `${fs_}px/${cs.fontWeight}/${cs.letterSpacing}/${cs.textTransform}`;
      out.typo[key] = out.typo[key] || { n: 0, sample: direct.slice(0, 40) };
      out.typo[key].n++;
      if (fs_ > out.maxFont) out.maxFont = fs_;
    }
  }

  // charts
  const rc = document.querySelectorAll('.recharts-wrapper');
  out.charts.svgs = rc.length;
  document.querySelectorAll('.recharts-wrapper svg *').forEach(n => {
    const cls = n.getAttribute('class') || '';
    const m = cls.match(/recharts-(line|bar|area|pie|radial-bar|scatter|radar)\b/);
    if (m) out.charts.kinds[m[1]] = (out.charts.kinds[m[1]] || 0) + 1;
    const s = n.getAttribute('stroke'); const f = n.getAttribute('fill');
    if (s && s !== 'none') out.charts.strokes[s] = (out.charts.strokes[s] || 0) + 1;
    if (f && f !== 'none') out.charts.fills[f] = (out.charts.fills[f] || 0) + 1;
  });
  out.counts.rawSvg = document.querySelectorAll('svg:not(.recharts-surface)').length;
  out.counts.tables = document.querySelectorAll('table').length;
  out.counts.grids = Array.from(all).filter(e => getComputedStyle(e).display === 'grid').length;
  out.counts.h1 = document.querySelectorAll('h1').length;
  out.counts.h2 = document.querySelectorAll('h2').length;
  out.counts.h3 = document.querySelectorAll('h3').length;
  out.counts.buttons = document.querySelectorAll('button').length;
  out.counts.textChars = (document.querySelector('main')?.innerText || document.body.innerText).length;
  return out;
};

const results = {};
const OUT = process.argv[2] || 'audit-out.json';
const ONLY = process.argv[3];
const browser = await chromium.launch();

for (const [portal, routes] of Object.entries(ROUTES)) {
  if (ONLY && portal !== ONLY) continue;
  for (const vp of [{ width: 1440, height: 900, tag: 'desktop' }, { width: 390, height: 844, tag: 'mobile' }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    for (const r of routes) {
      try {
        await page.goto(BASE + r, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1200);
        const data = await page.evaluate(EXTRACT);
        data.portal = portal; data.vp = vp.tag; data.route = r;
        results[`${vp.tag}${r}`] = data;
        fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
      } catch (e) {
        console.log(`FAIL ${vp.tag} ${r}: ${e.message.slice(0, 80)}`);
      }
    }
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(process.argv[2] || 'audit-out.json', JSON.stringify(results, null, 1));
console.log('WROTE', Object.keys(results).length);
