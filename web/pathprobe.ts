// web/pathprobe.ts — path-to-sentence: clicking connected edges composes the
// prose reading in the strip; an unconnected click restarts; Escape clears.
// Run: bun web/pathprobe.ts

import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";

const URL = process.env.PAPER_URL ?? "http://localhost:5174";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
for (let i = 0; i < 9; i++) {
  const t = await page.locator("#frame-title").textContent();
  if (t.includes("olog")) break;
  await page.click("#fnext"); await page.waitForTimeout(150);
}

// helper: click a live edge by its from/to node labels (page coords of the
// two box centers, midpoint)
const boxByLabel = (txt) => page.locator("#playground .box", { has: page.locator(".label", { hasText: new RegExp("^" + txt.replace(/[()*+?.^${}|[\]\\]/g, "\\$&") + "$") }) }).first();
async function clickEdge(fromTxt, toTxt) {
  const a = await boxByLabel(fromTxt).boundingBox(), c = await boxByLabel(toTxt).boundingBox();
  if (!a || !c) return false;
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2, cx = c.x + c.width / 2, cy = c.y + c.height / 2;
  // edges render UNDER boxes — sample fractions for a point whose topmost
  // element is actually an edge hit-line, not a covering box
  for (const t of [0.3, 0.5, 0.7, 0.15, 0.85, 0.45, 0.6]) {
    const x = ax + (cx - ax) * t, y = ay + (cy - ay) * t;
    const ok = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest?.("#edgelay .hit");
    }, [x, y]);
    if (ok) { await page.mouse.click(x, y); await page.waitForTimeout(200); return true; }
  }
  return false;
}

// chain: fold → graph → claim (seed edges 'folds into', 'quotiented by')
console.log("click fold→graph:", await clickEdge("fold", "the graph (folded)"));
console.log("click graph→claim:", await clickEdge("the graph (folded)", "claim (quotient)"));
const strip = await page.locator("#pathstrip").textContent();
console.log("strip:", strip);
const composed = strip.includes("folds into") && strip.includes("quotiented by") && strip.includes("which");

// unconnected click restarts the chain
console.log("click log→graph('is folded from'? no — folds into is fold→graph; use engine→presentation):", await clickEdge("engine", "presentation"));
const strip2 = await page.locator("#pathstrip").textContent();
console.log("strip after restart:", strip2);
const restarted = strip2.startsWith("engine") && strip2.includes("delivers events to") && !strip2.includes("quotiented by");

// escape clears
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
const gone = (await page.locator("#pathstrip").count()) === 0 || (await page.locator("#pathstrip").isHidden());

const ok = composed && restarted && gone;
console.log(ok ? "PASS — the path reads as a sentence; the reading is the check" : "FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
