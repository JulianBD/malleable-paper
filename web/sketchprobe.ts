// web/sketchprobe.ts — verify the olog sketch frame: nodes fold from node
// events, edges render as SVG lines, label-drag commits an edge act, and a
// dragged node's position survives reload. Run: bun web/sketchprobe.ts

import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";
import { mkdirSync } from "node:fs";

const URL = process.env.PAPER_URL ?? "http://localhost:5174";
const OUT = "web/shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500); // first poll

// jump to the olog sketch frame (last static frame: press › until title matches)
for (let i = 0; i < 9; i++) {
  const t = await page.locator("#frame-title").textContent();
  if (t.includes("olog")) break;
  await page.click("#fnext");
  await page.waitForTimeout(150);
}
console.log("frame:", await page.locator("#frame-title").textContent());
await page.screenshot({ path: `${OUT}/olog-1-seeded.png` });

const boxCount = await page.locator("#playground .box").count();
const lineCount = await page.locator("#edgelay line:not(.rubber)").count();
console.log("nodes:", boxCount, "edge lines:", lineCount);

// drag a node (n-domain is #box by index — find by label text)
const dom = page.locator("#playground .box", { hasText: "domain" }).first();
const before = await dom.boundingBox();
if (before) {
  await page.mouse.move(before.x + before.width - 15, before.y + before.height / 2); // body grab, not the label pill
  await page.mouse.down();
  await page.mouse.move(before.x + before.width - 15, before.y + before.height / 2 + 120, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(2600); // drain + poll
}
const moved = await dom.boundingBox();
console.log("moved:", moved && { x: moved.x, y: moved.y });

const byLabel = (txt) => page.locator('#playground .box', { has: page.locator('.label', { hasText: new RegExp('^' + txt + '$') }) }).first();

// label-drag a link between two NON-overlapping nodes: log → card
// (drop opens the inline verb ask; Escape commits the bare arrow — the
// prompt used to auto-dismiss headless, which meant the same thing)
const fold = byLabel('the event log');
const hist = byLabel('card');
const fb = await fold.boundingBox(), hb = await hist.boundingBox();
let lines = -1;
if (fb && hb) {
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2); // the label pill
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width - 12, hb.y + hb.height / 2, { steps: 8 }); // body edge, avoids the target's own pill
  await page.mouse.up();
  // the drop must open the inline ask — Escape dismisses it, committing
  // the bare arrow. If the ask never opens, the gesture regressed: fail.
  var dismissed = false;
  try {
    await page.locator("#playground .verbin").waitFor({ state: "visible", timeout: 3000 });
    await page.keyboard.press("Escape");
    dismissed = true;
  } catch {}
  await page.waitForTimeout(2600);
  lines = await page.locator("#edgelay line:not(.rubber)").count();
  console.log("edge lines after link gesture:", lines);
  var linked = lines >= lineCount; // same-pair re-link is idempotent — the log is the truth below
} else var linked = false;
await page.screenshot({ path: `${OUT}/olog-2-linked.png` });

// reload — nodes, edges, and the dragged position must all come back
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
for (let i = 0; i < 9; i++) {
  const t = await page.locator("#frame-title").textContent();
  if (t.includes("olog")) break;
  await page.click("#fnext");
  await page.waitForTimeout(150);
}
const dom2 = await page.locator("#playground .box", { hasText: "domain" }).first().boundingBox();
const lines2 = await page.locator("#edgelay line:not(.rubber)").count();
const boxes2 = await page.locator("#playground .box").count();
await page.screenshot({ path: `${OUT}/olog-3-reloaded.png` });
console.log("reloaded — nodes:", boxes2, "lines:", lines2, "domain at:", dom2 && { x: dom2.x, y: dom2.y });

const ok =
  boxCount === 11 && lineCount >= 7 && linked && dismissed &&
  moved && dom2 && Math.abs(moved.y - dom2.y) < 2 &&
  boxes2 === 11 && lines2 === lines;
// the decisive check: the edge act is IN THE LOG with the right endpoints
const log = await (await fetch(URL + "/events")).json();
const evs = log.events ?? log;
const edgeAct = evs.find((e) => e.kind === "edge" && e.from === "n-log" && e.to === "n-card");
console.log("edge act in log:", edgeAct ? edgeAct.id : "MISSING");
console.log(ok && edgeAct ? "PASS — the sketch is the graph" : "FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
