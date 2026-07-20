import { chromium } from "playwright";
const b = await chromium.launch();
for (const [w,h,tag] of [[1440,900,"desk"],[390,844,"mob"]]) {
  const p = await b.newPage({ viewport:{width:w,height:h}, deviceScaleFactor: tag==="mob"?2:1 });
  for (const [route,name] of [["/portal","portal"],["/coach","coach"],["/clinic","clinic"],["/portal/library","library"]]) {
    await p.goto("http://127.0.0.1:3995"+route,{waitUntil:"networkidle"});
    await p.waitForTimeout(2200);
    await p.screenshot({ path:`.shots/final-${name}-${tag}.png` });
  }
  await p.close();
}
await b.close();
console.log("shots done");
