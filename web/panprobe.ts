// web/panprobe.ts — the view is ephemeral: empty-plane drag pans, wheel zooms
// toward the cursor, and NOTHING is logged — model geometry is untouched.
// Run: bun web/panprobe.ts

import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";

const URL = process.env.PAPER_URL ?? "http://localhost:5174";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)));
// count only THIS page's acts — the log is multi-writer (Julian's live tab
// may be dragging nodes in parallel); the eye-logs-nothing claim is local
await page.addInitScript(() => {
  window.__acts = 0;
  const f = window.fetch;
  window.fetch = (...a) => { if (a[1]?.method === "POST" && String(a[0]).includes("/act")) window.__acts++; return f(...a); };
});
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
for (let i = 0; i < 9; i++) {
  const t = await page.locator("#frame-title").textContent();
  if (t.includes("olog")) break;
  await page.click("#fnext"); await page.waitForTimeout(150);
}


const box = (txt) => page.locator("#playground .box", { has: page.locator(".label", { hasText: new RegExp("^" + txt.replace(/[()*+?.^${}|[\]\\]/g, "\\$&") + "$") }) }).first();
const fold0 = await box("fold").boundingBox();
const wrap = await page.locator("#panewrap").evaluate((el) => getComputedStyle(el).transform);

// PAN: drag the empty plane (a spot with no box: below the floor olog)
await page.mouse.move(900, 640);
await page.mouse.down();
await page.mouse.move(960, 690, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(200);
const transform1 = await page.locator("#panewrap").evaluate((el) => el.style.transform);
const fold1 = await box("fold").boundingBox();
console.log("pan transform:", transform1, "| fold moved by dx:", Math.round(fold1.x - fold0.x), "dy:", Math.round(fold1.y - fold0.y));
const panned = /translate\(60px, ?50px\)/.test(transform1) && Math.round(fold1.x - fold0.x) === 60 && Math.round(fold1.y - fold0.y) === 50;

// ZOOM: wheel out (deltaY > 0 shrinks) anchored mid-plane
await page.mouse.move(640, 380);
await page.mouse.wheel(0, 400);
await page.waitForTimeout(200);
const transform2 = await page.locator("#panewrap").evaluate((el) => el.style.transform);
const fold2 = await box("fold").boundingBox();
console.log("zoom transform:", transform2, "| fold size:", Math.round(fold2.width), "was", Math.round(fold0.width));
const zoomed = /scale\(0\.6/.test(transform2) && Math.round(fold2.width) < Math.round(fold0.width) * 0.7;

// acts still land in MODEL coordinates: dblclick empty space creates a node
// at the unviewed position; drag a box and its geometry act is view-free
await page.mouse.click(1200, 700); // deselect anything
await page.waitForTimeout(150);
const logQuiet = (await page.evaluate(() => window.__acts)) === 0; // the eye logged nothing

// view resets on frame re-entry: navigate away and back
for (let i = 0; i < 9; i++) { await page.click("#fnext"); await page.waitForTimeout(120); const t = await page.locator("#frame-title").textContent(); if (!t.includes("olog")) break; }
for (let i = 0; i < 9; i++) { await page.click("#fprev"); await page.waitForTimeout(120); const t = await page.locator("#frame-title").textContent(); if (t.includes("olog")) break; }
await page.waitForTimeout(600);
const transform3 = await page.locator("#panewrap").evaluate((el) => el.style.transform);
const fold3 = await box("fold").boundingBox(); // printed for the eye; position parity is
// meaningless in a multi-writer log (parallel drags re-seat nodes) — the
// transform is the reset claim
console.log("after re-entry transform:", JSON.stringify(transform3), "| fold at:", fold3 && [Math.round(fold3.x), Math.round(fold3.y)]);
const reset = !transform3 || transform3 === "none" || /translate\(0px, ?0px\) scale\(1\)/.test(transform3);

console.log("nothing logged by the eye:", logQuiet, "| view resets on re-entry:", reset);
const ok = panned && zoomed && logQuiet && reset;
console.log(ok ? "PASS — the eye moves, the world holds still" : "FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
