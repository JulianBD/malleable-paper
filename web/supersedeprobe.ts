// web/supersedeprobe.ts — supersede, not delete: select + Backspace folds a
// node away (identity survives in the log), its edge dangles (⊘ badge + dashed
// stub), the badge shows evidence, and superseding the edge clears it.
// Run: bun web/supersedeprobe.ts

import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";
import { mkdirSync } from "node:fs";

const URL = process.env.PAPER_URL ?? "http://localhost:5174";
mkdirSync("web/shots", { recursive: true });
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

const stamp = Date.now() % 100000;
const NAME = "a doomed node " + stamp;
const pg = await page.locator("#playground").boundingBox();

// (see pre-clean block below — it needs a poll cycle before the plane is clear)

// self-cleaning: supersede every probe-labeled node (doomed/scaffold/probe)
// and any dangling edges — supersede made the old parking workaround obsolete
{
  const evs = await (await fetch(URL + "/events")).json();
  const nodes = new Map();
  for (const e of evs) if (e.kind === "node" && e.id) nodes.set(e.id, e);
  for (const e of nodes.values()) {
    if (e.superseded || !/probe|scaffold|doomed/i.test(e.label ?? "")) continue;
    await fetch(URL + "/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actor: "paper", kind: "node", id: e.id, label: e.label, node_kind: e.node_kind, superseded: true }) });
    console.log("pre-clean: superseded node", e.id, e.label);
  }
  const evs2 = await (await fetch(URL + "/events")).json();
  const nodes2 = new Map();
  for (const e of evs2) if (e.kind === "node" && e.id) nodes2.set(e.id, e);
  const edg = new Map();
  for (const e of evs2) if (e.kind === "edge" && e.id) edg.set(e.id, e);
  for (const e of edg.values()) {
    if (e.superseded) continue;
    const f = nodes2.get(e.from), t2 = nodes2.get(e.to);
    if ((f && f.superseded) || (t2 && t2.superseded) || !f || !t2) {
      await fetch(URL + "/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actor: "paper", kind: "edge", id: e.id, from: e.from, to: e.to, label: e.label, superseded: true }) });
      console.log("pre-clean: superseded dangling", e.id);
    }
  }
}
await page.waitForTimeout(2600); // let the poll fold the pre-clean supersedes in

// create the node in clear space
await page.mouse.dblclick(pg.x + pg.width * 0.85, pg.y + pg.height * 0.35);
await page.locator(".verbin").fill(NAME);
await page.locator(".verbin").press("Enter");
await page.waitForTimeout(2600);
const doomed = page.locator("#playground .box", { hasText: NAME });
console.log("doomed created:", (await doomed.count()) === 1);

// link card to it with a verb (card -> doomed: when doomed is
// superseded the stub lands on card RIGHT side, in open space — card sits at
// the plane left edge and its left-side stub would run off-screen)
const card = page.locator("#playground .box", { has: page.locator(".label", { hasText: /^card$/ }) }).first();
const db = await doomed.boundingBox(), cb = await card.boundingBox();
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); // the pill
await page.mouse.down();
await page.mouse.move(db.x + db.width - 12, db.y + db.height / 2, { steps: 8 });
await page.mouse.up();
await page.locator(".verbin").fill("is doomed by");
await page.locator(".verbin").press("Enter");
await page.waitForTimeout(2600);
const edgesBefore = await page.locator("#edgelay line:not(.rubber):not(.hit)").count();
console.log("edge linked (lines):", edgesBefore);

// select the node (single body click, no move) and supersede it
await page.mouse.click(db.x + db.width - 15, db.y + db.height / 2);
await page.waitForTimeout(150);
console.log("node selected:", (await page.locator(".box.sel").count()) === 1);
await page.keyboard.press("Backspace");
await page.waitForTimeout(2600);
console.log("node gone from plane:", (await doomed.count()) === 0);
await page.screenshot({ path: "web/shots/olog-super-1-dangling.png" });

// the edge now dangles: dashed stub + badge
const dang = await page.locator("#edgelay line.dang").count();
const badge = await page.locator("#edgelay g.badge").count();
console.log("dangling stub:", dang, "badge:", badge);

// badge shows evidence (the badge sits right of the card's edge)
await page.mouse.click(cb.x + cb.width + 72, cb.y + cb.height / 2);
const panel = await page.locator(".checkpanel").count();
console.log("evidence panel:", panel === 1);

// select the dangling edge: the stub spans just right of the card's edge
await page.mouse.click(cb.x + cb.width + 35, cb.y + cb.height / 2);
await page.waitForTimeout(150);
console.log("edge selected:", (await page.locator("#edgelay line.sel").count()) >= 1);
await page.keyboard.press("Backspace");
await page.waitForTimeout(2600);
const dangAfter = await page.locator("#edgelay line.dang").count();
console.log("dangle cleared:", dangAfter === 0);

// the log: supersede acts present, identity preserved
const evs = await (await fetch(URL + "/events")).json();
const nodeSup = [...evs].reverse().find((e) => e.kind === "node" && e.superseded === true && e.label === NAME);
const edgeSup = [...evs].reverse().find((e) => e.kind === "edge" && e.superseded === true);
console.log("supersede acts in log:", !!nodeSup, !!edgeSup);

const ok = (await doomed.count()) === 0 && dang === 1 && badge === 1 && panel === 1 && dangAfter === 0 && !!nodeSup && !!edgeSup;
console.log(ok ? "PASS — supersede folds presence away, history survives" : "FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
