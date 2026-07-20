import { chromium } from 'playwright';

const BASE = 'https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 2550, height: 1438 } });
const p = await ctx.newPage();
await p.goto(BASE + '/coach', { waitUntil: 'networkidle' });
const links = await p.$$eval('a[href^="/"]', as => [...new Set(as.map(a => a.getAttribute('href')))]);
console.log('LINKS:', JSON.stringify(links, null, 1));
const mainLen = await p.$eval('main', m => m.innerText.trim().length);
console.log('main len', mainLen);
// persona switcher
const btns = await p.$$eval('button', bs => bs.map(b => (b.innerText||'').replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,40));
console.log('BUTTONS:', JSON.stringify(btns, null, 1));
await b.close();
