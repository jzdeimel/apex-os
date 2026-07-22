/**
 * CONTRAST SWEEP — does the deployed skin stay legible on every page?
 *
 * WHY THIS EXISTS
 * ---------------
 * Apex was designed dark and reskinned light by swapping CSS variables. That
 * approach reskins 75 pages without editing them, and its failure mode is
 * silent: a colour chosen to sit on near-black still *renders* on white, it
 * just cannot be read. Neither tsc nor the build can see it. The first two
 * problems found this way — washed-out stat captions and a 404 on a page whose
 * capability gate was wrong — were both invisible to every other check.
 *
 * WHAT IT MEASURES
 * ----------------
 * WCAG 2.1 relative luminance contrast for every text node with visible
 * content, against its nearest opaque ancestor background. Reports anything
 * under 4.5:1 (AA for body text), or under 3:1 for text ≥18.66px bold / ≥24px,
 * which is the AA large-text threshold.
 *
 * VALIDATE IT AGAINST A KNOWN-BAD BUILD BEFORE TRUSTING A CLEAN RESULT.
 * `--self-test` injects deliberately illegible text and asserts the detector
 * catches it. A sweep that cannot fail is a sweep that proves nothing — the
 * blank-screen bug in this repo survived three "clean" passes for exactly that
 * reason (innerText ignores opacity, so the check was structurally blind).
 *
 * Usage:
 *   node scripts/contrast-sweep.mjs --base http://127.0.0.1:3990 [--self-test]
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const baseIndex = args.indexOf("--base");
const findOpenPort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    if (!address || typeof address === "string") {
      probe.close();
      reject(new Error("Could not allocate a local port for the contrast sweep."));
      return;
    }
    probe.close(() => resolve(String(address.port)));
  });
});
const port = process.env.CONTRAST_PORT || (baseIndex < 0 ? await findOpenPort() : "3990");
const base = baseIndex >= 0 && args[baseIndex + 1]
  ? args[baseIndex + 1]
  : `http://127.0.0.1:${port}`;
const selfTest = args.includes("--self-test");

let localServer;
if (baseIndex < 0) {
  if (!existsSync(".next/standalone/server.js")) {
    throw new Error("No standalone build found. Run `npm run build` before the contrast sweep.");
  }
  try { cpSync(".next/static", ".next/standalone/.next/static", { recursive: true }); } catch {}
  try { if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true }); } catch {}
  localServer = spawn("node", [".next/standalone/server.js"], {
    env: { ...process.env, PORT: port, HOSTNAME: "127.0.0.1", TZ: "UTC" },
    stdio: "inherit",
  });
}

const cleanup = () => {
  try { localServer?.kill("SIGKILL"); } catch {}
};
process.once("exit", cleanup);
process.once("SIGINT", () => process.exit(130));
process.once("SIGTERM", () => process.exit(143));

async function waitForServer(tries = 40) {
  for (let index = 0; index < tries; index += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.status) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Contrast target did not start: ${base}`);
}

await waitForServer();

/** Staff principal — EasyAuth injects this header in production. */
const PRINCIPAL = Buffer.from(
  JSON.stringify({
    claims: [
      { typ: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", val: "m.vale@alphahealth.demo" },
      { typ: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name", val: "Dr. Marcus Vale" },
      { typ: "http://schemas.microsoft.com/identity/claims/objectidentifier", val: "oid-st-001" },
    ],
  }),
).toString("base64");

const ROUTES = [
  "/book", "/intake",
  "/coach", "/coach/roster", "/coach/consults", "/coach/order", "/coach/orders",
  "/coach/subscriptions", "/coach/gaps", "/coach/documents", "/coach/handoff", "/coach/training",
  "/clinic", "/clinic/sign", "/clinic/escalations", "/clinic/ledger", "/clinic/population",
  "/clinic/controlled", "/clinic/coverage", "/clinic/lab-draws",
  "/desk", "/desk/rooms", "/desk/book", "/desk/walk-in",
  "/exec", "/exec/capacity", "/exec/pipeline", "/exec/marketing", "/exec/features",
  "/clients", "/schedule", "/tasks", "/settings", "/analytics", "/supply-chain",
  "/admin/roster", "/admin/quality", "/admin/daily-report", "/admin/capacity",
  "/portal", "/portal/labs", "/portal/protocol", "/portal/messages", "/portal/progress",
  "/portal/consents", "/portal/receipts", "/portal/journal", "/portal/team", "/portal/costs",
  "/patient-sign-in", "/patient",
  // Full-product review surfaces. These were previously absent from the sweep
  // because CI inherited the clinic-v1 preset—the same mistake that hid them
  // from the owner in nonprod.
  "/portal/food", "/portal/train", "/portal/explore", "/portal/learn",
  "/portal/library", "/portal/refer", "/portal/book-visit",
  "/community", "/portal/community", "/coach/community",
  "/clinic/community", "/desk/community", "/exec/community",
  "/coach/winback", "/insights", "/recommendations", "/agent", "/swarm",
  "/automations",
];

const PROBE = `(() => {
  const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const parse = (s) => {
    const m = (s || "").match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
    return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
  };
  // Nearest ancestor with a non-transparent background — what the text actually sits on.
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.85) return c.rgb;
      n = n.parentElement;
    }
    const c = parse(getComputedStyle(document.body).backgroundColor);
    return c ? c.rgb : [255, 255, 255];
  };

  const out = [];
  // SCRIPT/STYLE/NOSCRIPT/TEMPLATE are leaf nodes full of text that nobody
  // sees. Next inlines a lot of them, and counting their source as failing copy
  // inflates the number with noise that can never be fixed. The UA stylesheet
  // hides them, but relying on that alone made the detector's own output
  // untrustworthy once — so they are excluded by tag, explicitly.
  const INVISIBLE_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TITLE"]);
  for (const el of document.querySelectorAll("body *")) {
    if (INVISIBLE_TAGS.has(el.tagName)) continue;
    if (el.children.length > 0) continue;               // leaf nodes only
    const text = (el.textContent || "").trim();
    if (!text) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none") continue;
    if (parseFloat(st.opacity) < 0.5) continue;         // deliberately faded
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;

    const fg = parse(st.color);
    if (!fg || fg.a < 0.5) continue;
    const bg = bgOf(el);
    const L1 = lum(fg.rgb), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);

    const size = parseFloat(st.fontSize);
    const weight = parseInt(st.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      out.push({
        text: text.slice(0, 48),
        ratio: Math.round(ratio * 100) / 100,
        need,
        color: st.color,
        background: "rgb(" + bg.join(", ") + ")",
        backgroundImage: st.backgroundImage,
        className: typeof el.className === "string" ? el.className.slice(0, 240) : "",
        size: Math.round(size),
      });
    }
  }
  return out;
})()`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.setExtraHTTPHeaders({ "x-ms-client-principal": PRINCIPAL });

if (selfTest) {
  await page.goto(base + "/coach", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.style.cssText = "background:#ffffff;padding:20px";
    d.innerHTML = '<span style="color:#f2f2f2;font-size:14px">deliberately illegible</span>';
    document.body.appendChild(d);
  });
  const found = await page.evaluate(PROBE);
  const caught = found.some((f) => f.text.includes("deliberately illegible"));
  console.log(caught ? "SELF-TEST PASS — detector catches known-bad text" : "SELF-TEST FAIL — detector is blind");
  await browser.close();
  cleanup();
  process.exit(caught ? 0 : 1);
}

let total = 0;
let routeFailures = 0;
const worst = [];
for (const route of ROUTES) {
  try {
    const res = await page.goto(base + route, { waitUntil: "networkidle", timeout: 20000 });
    if (!res || res.status() >= 400) {
      routeFailures += 1;
      console.log(`  ${String(res?.status() ?? "ERR").padEnd(4)} ${route}`);
      continue;
    }
    await page.waitForTimeout(400);
    const fails = await page.evaluate(PROBE);
    if (fails.length) {
      total += fails.length;
      const sample = fails.sort((a, b) => a.ratio - b.ratio).slice(0, 3);
      console.log(`  ${String(fails.length).padStart(3)} ${route}`);
      for (const f of sample) {
        console.log(`        ${f.ratio}:1 (needs ${f.need}) ${f.color} on ${f.background} ${f.size}px "${f.text}"`);
        console.log(`             ${f.className}`);
      }
      worst.push(...fails.map((f) => ({ ...f, route })));
    }
  } catch (err) {
    routeFailures += 1;
    console.log(`  ERR  ${route} — ${err.message.split("\n")[0]}`);
  }
}

console.log(`\n${total} contrast failures across ${ROUTES.length} routes`);
console.log(`${routeFailures} route render failures`);
if (worst.length) {
  const byColor = {};
  for (const w of worst) byColor[w.color] = (byColor[w.color] ?? 0) + 1;
  console.log("\nBy colour (fix the token, not the page):");
  for (const [c, n] of Object.entries(byColor).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${String(n).padStart(4)}  ${c}`);
  }
}

await browser.close();
cleanup();
process.exit(total > 0 || routeFailures > 0 ? 1 : 0);
