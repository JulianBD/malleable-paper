// web/verbprobe.ts — verify the inline verb ask: dropping an arrow opens
// an <input> at the arrow's midpoint (the modal prompt is gone), Enter
// commits a labeled edge act, and the label rides the log into the
// rendered SVG line. Run: bun web/verbprobe.ts

import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";
import { mkdirSync } from "node:fs";

const URL = process.env.PAPER_URL ?? "http://localhost:5174";
const OUT = "web/shots";
mkdirSync(OUT, { recursive: true });

// engine → domain, the three-machines clause. The run stamp keeps every
// probe run a fresh edge id (label is part of it), so "line count grew"
// stays strict on re-runs instead of going idempotent.
const VERB = "never interprets (probe " + new Date().toTimeString().slice(0, 8) + ")";

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

const before = await page.locator("#edgelay line:not(.rubber)").count();
console.log("edge lines before:", before);

// label-pill drag between two NON-overlapping nodes, exactly as sketchprobe:
// grab the source's pill (box center), drop on the target's body edge
const byLabel = (txt) => page.locator('#playground .box', { has: page.locator('.label', { hasText: new RegExp('^' + txt + '$') }) }).first();
const eng = byLabel('engine'), dom = byLabel('domain');
const eb = await eng.boundingBox(), db = await dom.boundingBox();
let asked = false, atMid = false;
if (eb && db) {
  await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2); // the label pill
  await page.mouse.down();
  await page.mouse.move(db.x + db.width - 12, db.y + db.height / 2, { steps: 8 }); // body edge, avoids the target's own pill
  await page.mouse.up();
  // the drop must open the inline ask — not a prompt — at the arrow's midpoint
  const ask = page.locator("#playground .verbin");
  await ask.waitFor({ state: "visible", timeout: 3000 });
  const vb = await ask.boundingBox();
  const mid = { x: (eb.x + eb.width / 2 + db.x + db.width / 2) / 2, y: (eb.y + eb.height / 2 + db.y + db.height / 2) / 2 };
  atMid = !!vb && Math.abs(vb.x + vb.width / 2 - mid.x) < 8 && Math.abs(vb.y + vb.height / 2 - mid.y) < 8;
  console.log("verb ask opened at midpoint:", atMid, vb && { x: Math.round(vb.x), y: Math.round(vb.y) });
  await page.screenshot({ path: `${OUT}/olog-verb-1-ask.png` });
  await page.keyboard.type(VERB);
  await page.keyboard.press("Enter"); // commits the labeled edge act
  asked = true;
}
await page.waitForTimeout(2600); // drain + poll

const after = await page.locator("#edgelay line:not(.rubber)").count();
const labeled = await page.locator("#edgelay text", { hasText: VERB }).count();
const askGone = (await page.locator("#playground .verbin").count()) === 0;
await page.screenshot({ path: `${OUT}/olog-verb-2-committed.png` });
console.log("edge lines after:", after, "· label rendered:", labeled, "· ask closed:", askGone);

// the decisive check: the edge act is IN THE LOG and carries the verb
const log = await (await fetch(URL + "/events")).json();
const evs = log.events ?? log;
const edgeAct = evs.find((e) => e.kind === "edge" && e.from === "n-engine" && e.to === "n-domain" && e.label === VERB);
console.log("edge act in log:", edgeAct ? edgeAct.id : "MISSING");

const ok = asked && atMid && after > before && labeled === 1 && askGone && !!edgeAct;
console.log(ok ? "PASS — the verb ask commits labeled edges inline" : "FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
