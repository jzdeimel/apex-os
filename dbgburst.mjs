import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:480,height:900} });
await p.goto("http://127.0.0.1:3995/portal",{waitUntil:"networkidle"});
await p.waitForTimeout(2000);
await p.click('button:has-text("Mark taken")'); await p.waitForTimeout(350);
await p.click('button:has-text("Abdomen")'); await p.waitForTimeout(700);
const info = await p.evaluate(() => {
  const out = [];
  for (const el of Array.from(document.querySelectorAll('div'))) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' && parseInt(cs.zIndex||'0') >= 80) {
      const r = el.getBoundingClientRect();
      out.push({ z: cs.zIndex, x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height), op:cs.opacity, cls:(el.className||'').toString().slice(0,60) });
      for (const kid of Array.from(el.children)) {
        const kr = kid.getBoundingClientRect(); const kcs = getComputedStyle(kid);
        out.push({ child:true, x:Math.round(kr.x), y:Math.round(kr.y), w:Math.round(kr.width), h:Math.round(kr.height), op:kcs.opacity, tf:kcs.transform.slice(0,40), cls:(kid.className||'').toString().slice(0,60) });
      }
    }
  }
  return out;
});
console.log(JSON.stringify(info,null,1));
await b.close();
