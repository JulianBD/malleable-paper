import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)));
page.on("console", (m) => console.log("console:", m.text().slice(0, 200)));
page.on("dialog", (d) => { console.log("dialog:", d.type()); d.dismiss(); });
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
for (let i = 0; i < 9; i++) {
  const t = await page.locator("#frame-title").textContent();
  if (t.includes("olog")) break;
  await page.click("#fnext"); await page.waitForTimeout(150);
}
const fb = await page.locator("#playground .box", { hasText: "fold" }).first().boundingBox();
const hb = await page.locator("#playground .box", { hasText: "history" }).first().boundingBox();
console.log("fold", fb, "hist", hb);
const x = fb.x + fb.width / 2, y = fb.y + fb.height / 2;
const tgt = await page.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  return el ? el.className + "|" + el.tagName + "|" + (el.textContent || "").slice(0, 20) : "none";
}, [x, y]);
console.log("point target:", tgt);
await page.mouse.move(x, y); await page.mouse.down();
await page.mouse.move(hb.x + hb.width - 12, hb.y + 8, { steps: 8 }); // history body corner, avoid its pill
await page.mouse.up();
await page.waitForTimeout(900);
console.log("lines:", await page.locator("#edgelay line:not(.rubber)").count());
await browser.close();
