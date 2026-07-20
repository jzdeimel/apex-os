// Detect VISUAL blankness: AppShell wraps children in
//   <AnimatePresence mode="wait"><motion.div key={pathname} initial={{opacity:0,y:10}} .../>
// A stranded enter animation leaves that div at opacity:0 — full DOM text,
// zero pixels. innerText-based checks cannot see this.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOG = process.env.LOG || 'opacity.log';
const log = (s) => { process.stdout.write(s + '\n'); fs.appendFileSync(LOG, s + '\n'); };
const PERSONAS = ['Member', 'Coach', 'Medical'];

const VIS = () => {
  const m = document.querySelector('main');
  if (!m) return { hasMain: false };
  const kid = m.firstElementChild;
  const cs = kid ? getComputedStyle(kid) : null;
  const t = (m.innerText || '').trim();
  return {
    hasMain: true,
    url: location.pathname,
    textLen: t.length,
    htmlLen: m.innerHTML.length,
    opacity: cs ? parseFloat(cs.opacity) : null,
    transform: cs ? cs.transform : null,
    visibility: cs ? cs.visibility : null,
    display: cs ? cs.display : null,
    kidCount: m.children.length,
    kidTag: kid ? kid.tagName + '.' + (kid.className || '').slice(0, 40) : null,
    side: document.querySelectorAll('aside a[href]').length,
    sample: t.slice(0, 120).replace(/\s+/g, ' '),
  };
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 2550, height: 1438 }, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(7000);
  let errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(BASE + '/coach', { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  const findings = [];
  const history = [];
  const STEPS = parseInt(process.env.STEPS || '500', 10);

  for (let i = 0; i < STEPS; i++) {
    let action = 'none';
    try {
      const roll = Math.random();
      if (roll < 0.3) {
        const p = PERSONAS[Math.floor(Math.random() * 3)];
        action = `personaSwitcher->${p}`;
        await page.locator('header button[aria-haspopup="listbox"]').first().click({ timeout: 5000 });
        await page.locator('[role="option"]', { hasText: p }).first().click({ timeout: 5000 });
      } else if (roll < 0.44) {
        const labels = ['Client Portal', 'Medical Console', 'Coach Console'];
        const l = labels[Math.floor(Math.random() * 3)];
        action = `sidebarPortal->${l}`;
        await page.locator('aside button[aria-haspopup="listbox"]').first().click({ timeout: 5000 });
        await page.locator('aside [role="option"]', { hasText: l }).first().click({ timeout: 5000 });
      } else if (roll < 0.9) {
        const links = (await page.$$eval('aside a[href]', (as) =>
          Array.from(new Set(as.map((a) => a.getAttribute('href'))))
        )).filter((h) => h && h.startsWith('/') && h !== '/');
        if (links.length) {
          const h = links[Math.floor(Math.random() * links.length)];
          action = `navLink ${h}`;
          await page.click(`aside a[href="${h}"]`, { timeout: 5000 });
        }
      } else if (roll < 0.95) {
        action = 'back'; await page.goBack({ waitUntil: 'commit', timeout: 5000 });
      } else {
        action = 'forward'; await page.goForward({ waitUntil: 'commit', timeout: 5000 });
      }
    } catch (e) {
      action += ' [EXC ' + e.message.split('\n')[0].slice(0, 50) + ']';
    }

    // Bias HARD toward firing the next action inside the 280ms exit window.
    const settle = Math.random() < 0.7 ? Math.floor(Math.random() * 300) : 1000 + Math.floor(Math.random() * 600);
    await sleep(settle);
    history.push(`${action} (+${settle}ms)`);
    if (history.length > 10) history.shift();

    let v;
    try { v = await page.evaluate(VIS); } catch { continue; }
    if (!v.hasMain) continue;

    const invisible = (v.opacity !== null && v.opacity < 0.15) || v.visibility === 'hidden';
    const empty = v.textLen < 300;
    if (invisible || empty) {
      await sleep(3000); // well past any 0.28s animation
      let v2; try { v2 = await page.evaluate(VIS); } catch { continue; }
      const inv2 = (v2.opacity !== null && v2.opacity < 0.15) || v2.visibility === 'hidden';
      const emp2 = v2.textLen < 300;
      if ((inv2 || emp2) && v2.side > 0) {
        const f = {
          kind: inv2 ? 'INVISIBLE (opacity/visibility)' : 'EMPTY (no text)',
          route: v2.url, viewport: '2550x1438',
          mainChars: v2.textLen, mainHTML: v2.htmlLen,
          opacity: v2.opacity, transform: v2.transform, visibility: v2.visibility,
          kidTag: v2.kidTag, kidCount: v2.kidCount,
          steps: history.join('  ->  '),
          errors: errors.length ? Array.from(new Set(errors)).slice(-6).join(' | ') : 'none',
          sample: v2.sample,
        };
        findings.push(f);
        log('*** REPRO ***\n' + JSON.stringify(f, null, 2));
        await page.screenshot({ path: `opacity-repro-${findings.length}.png` }).catch(() => {});
        fs.writeFileSync(LOG.replace('.log', '.json'), JSON.stringify(findings, null, 2));
        await page.goto(BASE + '/coach', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(1200);
        history.length = 0;
      }
    }
    if (i % 25 === 0) log(`[${i}] ${v.url} text=${v.textLen} op=${v.opacity} findings=${findings.length}`);
  }
  log('=== DONE findings=' + findings.length);
  fs.writeFileSync(LOG.replace('.log', '.json'), JSON.stringify(findings, null, 2));
  await browser.close();
})();
