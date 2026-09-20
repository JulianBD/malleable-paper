// web/makeprobe.ts — verify node creation (dblclick empty plane) and rename
// in place (dblclick a label pill, same id preserved). Run: bun web/makeprobe.ts

import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";
import { mkdirSync } from "node:fs";

const URL = process.env.PAPER_URL ?? "http://localhost:5174";
const OUT = "web/shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

for (let i = 0; i < 9; i++) {
  const t = await page.locator("#frame-title").textContent();
  if (t.includes("olog")) break;
  await page.click("#fnext");
  await page.waitForTimeout(150);
}
console.log("frame:", await page.locator("#frame-title").textContent());

const stamp = Date.now() % 100000;
const NAME = "a probe node " + stamp;
const RENAME = "a renamed probe " + stamp;

// (a) create: double-click a clear spot mid-plane (not near an edge —
// nodes overflow the playground bottom and clicks then miss the pill)
const pg = await page.locator("#playground").boundingBox();
await page.mouse.dblclick(pg.x + pg.width * 0.85, pg.y + pg.height * 0.35);
const ask = page.locator(".verbin");
console.log("create ask visible:", await ask.count() === 1);
await ask.fill(NAME);
await ask.press("Enter");
await page.waitForTimeout(2600); // act → drain → poll

const created = page.locator("#playground .box", { hasText: NAME });
const createdCount = await created.count();
console.log("created node on plane:", createdCount === 1);
await page.screenshot({ path: `${OUT}/olog-make-1-created.png` });

// (b) rename: double-click the pill of the node we just made (mid-plane, safe)
const pill = created.locator(".label");
await pill.dblclick();
const ask2 = page.locator(".verbin");
console.log("rename ask visible:", await ask2.count() === 1);
await ask2.fill(RENAME);
await ask2.press("Enter");
await page.waitForTimeout(2600);

const renamed = await page.locator("#playground .box", { hasText: RENAME }).count();
const oldGone = await page.locator("#playground .box", { hasText: NAME }).count();
console.log("renamed on plane:", renamed === 1, "old label gone:", oldGone === 0);
await page.screenshot({ path: `${OUT}/olog-make-2-renamed.png` });

// (c) the log: creation act + rename act — rename must carry the SAME id as
// the original 'card' node (identity preserved through relabel)
const log = await (await fetch(URL + "/events")).json();
const evs = log.events ?? log;
const createAct = [...evs].reverse().find((e) => e.kind === "node" && e.label === NAME);
const renameAct = [...evs].reverse().find((e) => e.kind === "node" && e.label === RENAME);
console.log("create act:", createAct?.id, "| rename act:", renameAct?.id);
const identity = createAct && renameAct && createAct.id === renameAct.id;

// (d) abandon path: open the ask, Escape — no act, nothing new on plane
const before = await page.locator("#playground .box").count();
await page.mouse.dblclick(pg.x + pg.width * 0.6, pg.y + 40);
await page.locator(".verbin").press("Escape");
await page.waitForTimeout(300);
const afterEscape = await page.locator("#playground .box").count();
console.log("escape abandons:", before === afterEscape && (await page.locator(".verbin").count()) === 0);

const ok = createdCount === 1 && renamed === 1 && oldGone === 0 && identity && before === afterEscape;
console.log(ok ? "PASS — nodes are made and renamed by hand, identity preserved" : "FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
