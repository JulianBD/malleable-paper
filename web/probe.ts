// web/probe.ts — the agent's eyes and hands on the real page.
// Loads the paper in headless chromium, performs a scripted sequence,
// writes screenshots to web/shots/. Run: bun web/probe.ts

import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";
import { mkdirSync } from "node:fs";

const URL = process.env.PAPER_URL ?? "http://localhost:5174";
const OUT = "web/shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "networkidle" });

async function shot(name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot", name);
}

await shot("01-plane");
await page.click("#toggle");
await page.waitForTimeout(300);
await shot("02-meta-open");
// flip the doc box to page 3 (move clamp)
await page.click("#box2 .next");
await page.click("#box2 .next");
await shot("03-doc-page3");
// drag box0 rightward into box1 — demonstrates the direction-blind bug
const b0 = await page.locator("#box0").boundingBox();
const b1 = await page.locator("#box1").boundingBox();
if (b0 && b1) {
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
  await page.mouse.down();
  // first: drag right toward box1 (should stop at contact)
  await page.mouse.move(b1.x + 40, b0.y + b0.height / 2, { steps: 10 });
  await shot("04-drag-right-contact");
  // then: drag LEFT — bug teleports it past box1 to the right edge
  await page.mouse.move(20, b0.y + b0.height / 2, { steps: 10 });
  await shot("05-drag-left-bug");
  await page.mouse.up();
}
await shot("06-after-release");

await browser.close();
