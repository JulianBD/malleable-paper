// web/hydraprobe.ts — verify hydration (F): geometry survives reload.
// Load → measure → drag A → release (logs box_geometry) → reload →
// measure → compare. Run: bun web/hydraprobe.ts

import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";

const URL = process.env.PAPER_URL ?? "http://localhost:5174";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500); // let the first poll land

async function geom(id: string) {
  const b = await page.locator(id).boundingBox();
  return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}

const before = await geom("#box0");
console.log("before", before);

// drag A to a distinctive spot and release (release logs box_geometry)
if (before) {
  await page.mouse.move(before.x + 40, before.y + 30);
  await page.mouse.down();
  await page.mouse.move(before.x + 120, before.y + 90, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600); // drain (~250ms) + poll
}

const moved = await geom("#box0");
console.log("moved", moved);

// the test: reload — geometry must come back from the fold, not reset
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500); // first poll must land before fold applies

const after = await geom("#box0");
console.log("after ", after);

const ok = moved && after && moved.x === after.x && moved.y === after.y;
console.log(ok ? "PASS — plane hydrated from the log" : "FAIL — plane reset");
await browser.close();
process.exit(ok ? 0 : 1);
