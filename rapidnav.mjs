// Rapid-nav stress harness. Targets the AppShell AnimatePresence(mode="wait")
// transition (280ms) keyed by pathname. Re-queries links every round because
// the sidebar contents change when the active portal changes.
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "https://ca-apex.kindground-78fc25fb.eastus.azurecontainerapps.io";
const W = Number(process.env.W ?? 2550), H = Number(process.env.H ?? 1438);
const ROUNDS = Number(process.env.ROUNDS ?? 60);
const MODE = process.env.MODE ?? "all";
const SEEDBASE = Number(process.env.SEED ?? 1);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: H } });
const p = await ctx.newPage();
let errs = [];
p.on("pageerror", (e) => errs.push("PAGEERROR: " + String(e.message)));
p.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE: " + m.text()); });

process.on("unhandledRejection", (e) => { console.log("\nUNHANDLED: " + String(e && e.stack || e)); });
process.on("uncaughtException", (e) => { console.log("\nUNCAUGHT: " + String(e && e.stack || e)); });
p.on("crash", () => console.log("\nPAGE CRASHED"));
process.on("exit", (c) => process.stdout.write(`\n[process exit code=${c}]\n`));
process.on("beforeExit", (c) => process.stdout.write(`\n[beforeExit code=${c}]\n`));
p.on("close", () => console.log("\nPAGE CLOSED"));

let seed = SEEDBASE;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const state = () => p.evaluate(() => {
  const m = document.querySelector("main");
  const nav = document.querySelector("nav");
  return {
    url: location.pathname,
    chars: m ? m.innerText.trim().length : -1,
    html: m ? m.innerHTML.length : -1,
    kids: m ? m.children.length : -1,
    inner: m ? m.innerHTML.slice(0, 300) : "",
    sidebar: nav ? nav.innerText.trim().length : -1,
  };
});

const navLinks = () => p.$$eval("nav a[href^='/']", (as) =>
  Array.from(new Set(as.map((a) => a.getAttribute("href")))).filter(Boolean));

async function clickHref(href, opts = {}) {
  const el = await p.$(`nav a[href="${href}"]`);
  if (!el) return false;
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await el.click({ timeout: 4000, force: true, ...opts }).catch(() => {});
  return true;
}

async function switchPersona(label) {
  const btn = await p.$("button[aria-haspopup='listbox']");
  if (!btn) return false;
  await btn.click({ force: true }).catch(() => {});
  await p.waitForTimeout(220);
  const opt = await p.$(`[role="option"]:has-text("${label}")`);
  if (!opt) { await p.keyboard.press("Escape"); return false; }
  await opt.click({ force: true }).catch(() => {});
  return true;
}

const hits = [];
async function check(step) {
  await p.waitForTimeout(1800);
  const s = await state();
  const blank = s.chars >= 0 && s.chars < 300 && s.sidebar > 100;
  if (blank) {
    hits.push({ step, ...s, errs: [...errs] });
    console.log(`\nBLANK  route=${s.url}  mainChars=${s.chars} htmlLen=${s.html} kids=${s.kids} sidebar=${s.sidebar}`);
    console.log(`  STEP: ${step}`);
    console.log(`  ERRS: ${errs.length ? errs.join(" | ").slice(0, 600) : "none"}`);
    console.log(`  MAIN: ${s.inner.replace(/\s+/g, " ").slice(0, 220)}`);
    await p.screenshot({ path: `blank-${hits.length}.png`, fullPage: false }).catch(() => {});
    await p.goto(BASE + "/coach", { waitUntil: "networkidle" });
    await p.waitForTimeout(700);
  } else process.stdout.write(".");
  errs = [];
  return blank;
}

await p.goto(BASE + "/coach", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1200);

const modes = MODE === "all"
  ? ["interrupt", "double", "backfwd", "persona", "personaInterrupt", "triple", "palette"]
  : [MODE];

for (let r = 0; r < ROUNDS; r++) {
  const m = modes[r % modes.length];
  const links = await navLinks();
  if (links.length < 2) { await p.goto(BASE + "/coach", { waitUntil: "networkidle" }); continue; }
  const gap = [40, 80, 120, 180, 250][r % 5];
  if (process.env.VERBOSE) console.log(`\n[r${r} ${m} gap=${gap} at ${new URL(p.url()).pathname}]`);

  try {
    if (m === "interrupt") {
      const a = pick(links); const c = pick(links.filter((x) => x !== a));
      await clickHref(a);
      await p.waitForTimeout(gap);
      const l2 = await navLinks();
      const c2 = l2.includes(c) ? c : pick(l2);
      await clickHref(c2);
      if (await check(`from ${p.url()}: click ${a}, wait ${gap}ms, click ${c2} (interrupt mid-transition)`)) continue;
    } else if (m === "double") {
      const a = pick(links);
      await clickHref(a); await p.waitForTimeout(gap); await clickHref(a);
      if (await check(`click ${a} twice, ${gap}ms apart`)) continue;
    } else if (m === "backfwd") {
      const a = pick(links);
      await clickHref(a); await p.waitForTimeout(gap);
      await p.goBack({ waitUntil: "commit" }).catch(() => {});
      await p.waitForTimeout(gap);
      await p.goForward({ waitUntil: "commit" }).catch(() => {});
      if (await check(`click ${a}, back after ${gap}ms, forward after ${gap}ms`)) continue;
    } else if (m === "persona") {
      const who = pick(["Coach", "Member", "Medical"]);
      await switchPersona(who);
      if (await check(`persona switch -> ${who}`)) continue;
    } else if (m === "personaInterrupt") {
      const who = pick(["Coach", "Member", "Medical"]);
      await switchPersona(who);
      await p.waitForTimeout(gap);
      const l2 = await navLinks();
      if (l2.length) { const t = pick(l2); await clickHref(t);
        if (await check(`persona switch -> ${who}, then click ${t} after ${gap}ms (interrupt persona nav)`)) continue; }
      else if (await check(`persona switch -> ${who} (no links)`)) continue;
    } else if (m === "triple") {
      const a = pick(links), c = pick(links), d = pick(links);
      await clickHref(a); await p.waitForTimeout(gap);
      await clickHref(c); await p.waitForTimeout(gap);
      const l3 = await navLinks(); await clickHref(l3.includes(d) ? d : pick(l3));
      if (await check(`triple rapid click ${a} -> ${c} -> ${d}, ${gap}ms apart`)) continue;
    } else if (m === "palette") {
      await p.keyboard.press("Control+k"); await p.waitForTimeout(250);
      await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter");
      await p.waitForTimeout(gap);
      await p.keyboard.press("Control+k"); await p.waitForTimeout(250);
      await p.keyboard.press("ArrowDown"); await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter");
      if (await check(`command palette Ctrl+K jump, then second Ctrl+K jump after ${gap}ms`)) continue;
    }
  } catch (e) { console.log(`\n(round ${r} ${m} threw: ${String(e).slice(0, 120)})`); }
}

console.log(`\n\n=== HITS: ${hits.length} / ${ROUNDS} rounds ===`);
console.log(JSON.stringify(hits, null, 2));
await b.close();
