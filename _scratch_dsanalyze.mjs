import fs from 'fs';
const S = process.argv[2];
const all = {};
for (const f of ['a-member.json', 'a-coach.json', 'a-clinic.json']) {
  Object.assign(all, JSON.parse(fs.readFileSync(`${S}/${f}`, 'utf8')));
}
const desk = Object.values(all).filter(d => d.vp === 'desktop');
const mob = Object.values(all).filter(d => d.vp === 'mobile');

// ---- 1. CARD SHELL CENSUS (desktop) ----
const globalSig = {};
let totalCards = 0;
for (const d of desk) for (const [k, v] of Object.entries(d.cardSigs)) {
  globalSig[k] = (globalSig[k] || 0) + v; totalCards += v;
}
const sorted = Object.entries(globalSig).sort((a, b) => b[1] - a[1]);
console.log('===== CARD SHELL CENSUS (desktop, ' + desk.length + ' routes) =====');
console.log('total card-like panels:', totalCards, '| distinct signatures:', sorted.length);
let cum = 0;
sorted.slice(0, 14).forEach(([k, v], i) => {
  cum += v;
  console.log(`${String(v).padStart(4)}  ${(v / totalCards * 100).toFixed(1).padStart(5)}%  cum ${(cum / totalCards * 100).toFixed(1).padStart(5)}%  ${k}`);
});
const top3 = sorted.slice(0, 3).reduce((a, [, v]) => a + v, 0);
console.log(`TOP-3 signatures = ${top3}/${totalCards} = ${(top3 / totalCards * 100).toFixed(1)}% of all panels`);

// per-route dominance
console.log('\n--- per-route: dominant shell share ---');
desk.map(d => {
  const t = Object.values(d.cardSigs).reduce((a, b) => a + b, 0);
  const m = Math.max(0, ...Object.values(d.cardSigs));
  return { r: d.route, t, m, pct: t ? (m / t * 100) : 0, sigs: Object.keys(d.cardSigs).length };
}).sort((a, b) => b.t - a.t).forEach(x =>
  console.log(`${x.r.padEnd(24)} panels=${String(x.t).padStart(3)}  distinct=${String(x.sigs).padStart(2)}  biggest single shell=${String(x.m).padStart(3)} (${x.pct.toFixed(0)}%)`));

// ---- 2. RADII ----
const radii = {};
for (const d of desk) for (const [k, v] of Object.entries(d.radii)) radii[k] = (radii[k] || 0) + v;
console.log('\n===== BORDER-RADIUS VALUES IN PLAY (desktop) =====');
Object.entries(radii).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) => console.log(String(v).padStart(6), k));

// ---- 3. TYPOGRAPHY ----
const typo = {};
for (const d of desk) for (const [k, v] of Object.entries(d.typo)) {
  typo[k] = typo[k] || { n: 0, sample: v.sample }; typo[k].n += v.n;
}
const tsorted = Object.entries(typo).sort((a, b) => b[1].n - a[1].n);
const totalText = tsorted.reduce((a, [, v]) => a + v.n, 0);
console.log('\n===== TYPOGRAPHY CENSUS (desktop) =====');
console.log('distinct size/weight/tracking/transform combos:', tsorted.length, '| text-bearing elements:', totalText);
let tc = 0;
tsorted.slice(0, 20).forEach(([k, v]) => { tc += v.n; console.log(`${String(v.n).padStart(5)} ${(v.n / totalText * 100).toFixed(1).padStart(5)}% cum${(tc / totalText * 100).toFixed(1).padStart(6)}%  ${k.padEnd(30)} "${v.sample}"`); });

// size-only histogram
const sizes = {};
for (const [k, v] of tsorted) { const s = k.split('px/')[0]; sizes[s] = (sizes[s] || 0) + v.n; }
console.log('\n--- font-size only ---');
const sizeEntries = Object.entries(sizes).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
sizeEntries.forEach(([k, v]) => console.log(`${k}px`.padStart(8), String(v).padStart(6), (v / totalText * 100).toFixed(1) + '%'));
const small = sizeEntries.filter(([k]) => parseFloat(k) <= 13).reduce((a, [, v]) => a + v, 0);
const big = sizeEntries.filter(([k]) => parseFloat(k) >= 24).reduce((a, [, v]) => a + v, 0);
console.log(`<=13px: ${small} (${(small / totalText * 100).toFixed(1)}%)   >=24px: ${big} (${(big / totalText * 100).toFixed(1)}%)`);

// ---- 4. HIERARCHY: biggest element per route ----
console.log('\n===== HIERARCHY: largest type on each route =====');
desk.forEach(d => {
  const es = Object.entries(d.typo).map(([k, v]) => ({ sz: parseFloat(k), n: v.n, k, s: v.sample })).sort((a, b) => b.sz - a.sz);
  const top = es[0];
  const bodySz = es.sort((a, b) => b.n - a.n)[0];
  console.log(`${d.route.padEnd(24)} max=${String(top.sz).padStart(4)}px x${top.n}  | body=${bodySz.k.split('px/')[0]}px x${bodySz.n} | ratio=${(top.sz / parseFloat(bodySz.k)).toFixed(2)}x`);
});

// ---- 5. DENSITY: member vs coach vs clinic ----
console.log('\n===== DENSITY BY PORTAL (desktop) =====');
for (const p of ['member', 'coach', 'clinic']) {
  const rs = desk.filter(d => d.portal === p);
  const avg = (f) => (rs.reduce((a, d) => a + f(d), 0) / rs.length);
  console.log(`${p.padEnd(8)} routes=${rs.length} avgEls=${avg(d => d.counts.totalEls).toFixed(0)} avgChars=${avg(d => d.counts.textChars).toFixed(0)} avgDocH=${avg(d => d.docHeight).toFixed(0)} ` +
    `els/1000px=${(avg(d => d.counts.totalEls) / avg(d => d.docHeight) * 1000).toFixed(1)} avgGrids=${avg(d => d.counts.grids).toFixed(1)} avgTables=${avg(d => d.counts.tables).toFixed(2)} avgBtns=${avg(d => d.counts.buttons).toFixed(0)} avgCharts=${avg(d => d.charts.svgs).toFixed(2)}`);
}

// per-portal typography profile
console.log('\n===== TYPE PROFILE BY PORTAL (share of text elements at each size) =====');
for (const p of ['member', 'coach', 'clinic']) {
  const rs = desk.filter(d => d.portal === p);
  const sz = {}; let tot = 0;
  for (const d of rs) for (const [k, v] of Object.entries(d.typo)) { const s = k.split('px/')[0]; sz[s] = (sz[s] || 0) + v.n; tot += v.n; }
  const top = Object.entries(sz).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}px:${(v / tot * 100).toFixed(0)}%`).join('  ');
  const sm = Object.entries(sz).filter(([k]) => parseFloat(k) <= 13).reduce((a, [, v]) => a + v, 0);
  console.log(`${p.padEnd(8)} ${top}   | <=13px = ${(sm / tot * 100).toFixed(0)}%`);
}

// ---- 6. CHARTS ----
console.log('\n===== CHARTS =====');
const kinds = {}, strokes = {};
let chartRoutes = 0, chartTotal = 0;
for (const d of desk) {
  if (d.charts.svgs) { chartRoutes++; chartTotal += d.charts.svgs; }
  for (const [k, v] of Object.entries(d.charts.kinds)) kinds[k] = (kinds[k] || 0) + v;
  for (const [k, v] of Object.entries(d.charts.strokes)) strokes[k] = (strokes[k] || 0) + v;
}
console.log(`recharts instances: ${chartTotal} across ${chartRoutes}/${desk.length} routes`);
console.log('chart element kinds:', JSON.stringify(kinds));
console.log('top chart stroke colors:', Object.entries(strokes).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}(${v})`).join(' '));
console.log('\nper-route charts + raw svg:');
desk.filter(d => d.charts.svgs).forEach(d => console.log(`${d.route.padEnd(24)} recharts=${d.charts.svgs} kinds=${JSON.stringify(d.charts.kinds)}`));

// ---- 7. MOBILE vs DESKTOP ----
console.log('\n===== RESPONSIVE: does structure change? =====');
let same = 0, tot = 0;
for (const d of desk) {
  const m = all['mobile' + d.route];
  if (!m) continue; tot++;
  const delta = m.counts.totalEls - d.counts.totalEls;
  if (delta === 0) same++;
  if (Math.abs(delta) > 0) console.log(`${d.route.padEnd(24)} desktopEls=${d.counts.totalEls} mobileEls=${m.counts.totalEls} delta=${delta}`);
}
console.log(`routes with IDENTICAL element count desktop vs mobile: ${same}/${tot}`);
