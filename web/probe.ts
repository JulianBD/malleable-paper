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

async function geom(id: string) {
  const b = await page.locator(id).boundingBox();
  return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}

console.log("A", await geom("#box0"), "B", await geom("#box1"));
await shot("01-plane");
await page.click("#toggle");
await page.waitForTimeout(300);
await shot("02-meta-open");

// drag A across the playground toward B (contact), then away (escape)
const a = await page.locator("#box0").boundingBox(); // fresh, post-layout
const b = await page.locator("#box1").boundingBox();
if (a && b) {
  const cy = a.y + a.height / 2;
  await page.mouse.move(a.x + a.width / 2, cy);
  await page.mouse.down();
  await page.mouse.move(b.x - 10, cy, { steps: 10 });
  console.log("contact", await geom("#box0"));
  await shot("03-contact");
  await page.mouse.move(a.x, a.y + 250, { steps: 10 }); // diagonal down-left escape
  console.log("escape", await geom("#box0"));
  await page.mouse.up();
  await shot("04-escape");
}
await browser.close();
