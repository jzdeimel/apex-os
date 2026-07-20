import { chromium } from "playwright";
const BASE = "https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io";

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 2550, height: 1438 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 120)));
await page.goto(BASE + "/coach", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

console.log("switcher count:", await page.locator('button[aria-haspopup="listbox"]').count());
console.log("aside count:", await page.locator("aside").count());
console.log("aside nav a count:", await page.locator("aside nav a").count());
console.log("main count:", await page.locator("main").count());
console.log(
  "sidebar hrefs:",
  JSON.stringify(await page.locator("aside a[href^='/']").evaluateAll((e) => e.map((x) => x.getAttribute("href")))),
);
console.log("localStorage:", JSON.stringify(await page.evaluate(() => ({ ...localStorage }))));
console.log("sessionStorage:", JSON.stringify(await page.evaluate(() => ({ ...sessionStorage }))));

await page.locator('button[aria-haspopup="listbox"]').first().click();
await page.waitForTimeout(400);
const opts = await page.locator('[role="option"]').evaluateAll((e) => e.map((x) => x.innerText.replace(/\n/g, " | ")));
console.log("options:", JSON.stringify(opts, null, 1));

// pick Member
await page.locator('[role="option"]').filter({ hasText: "Member" }).first().click();
await page.waitForTimeout(1500);
console.log("after Member:", page.url(), "mainLen:", await page.evaluate(() => document.querySelector("main")?.innerText.trim().length));
console.log("localStorage now:", JSON.stringify(await page.evaluate(() => ({ ...localStorage }))));
console.log("member sidebar hrefs:", JSON.stringify(await page.locator("aside a[href^='/']").evaluateAll((e) => e.map((x) => x.getAttribute("href")))));

await b.close();
