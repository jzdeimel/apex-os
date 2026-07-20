import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:480,height:900} });
await p.goto("http://127.0.0.1:3995/portal",{waitUntil:"networkidle"});
await p.waitForTimeout(2000);
await p.click('button:has-text("Mark taken")'); await p.waitForTimeout(350);
await p.click('button:has-text("Abdomen")'); await p.waitForTimeout(600);
const chain = await p.evaluate(() => {
  const el = document.querySelector('div.fixed.inset-0[class*="z-[80]"]');
  if(!el) return "overlay not found";
  const out=[]; let n = el.parentElement;
  while(n && n !== document.documentElement){
    const cs=getComputedStyle(n);
    const culprit = cs.transform!=='none' || cs.filter!=='none' || cs.backdropFilter!=='none' || cs.perspective!=='none' || cs.willChange!=='auto' || cs.contain!=='none';
    if(culprit) out.push({tag:n.tagName, cls:(n.className||'').toString().slice(0,70), transform:cs.transform.slice(0,30), filter:cs.filter, backdrop:cs.backdropFilter, willChange:cs.willChange, contain:cs.contain});
    n=n.parentElement;
  }
  return out;
});
console.log(JSON.stringify(chain,null,1));
await b.close();
