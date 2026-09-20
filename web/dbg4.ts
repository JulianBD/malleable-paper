import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)));
page.on("console", (m) => console.log("console:", m.text().slice(0, 200)));
page.on("dialog", (d) => { console.log("dialog:", d.type(), d.message()); d.accept("has"); });
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
for (let i = 0; i < 9; i++) {
  const t = await page.locator("#frame-title").textContent();
  if (t.includes("olog")) break;
  await page.click("#fnext"); await page.waitForTimeout(150);
}
const fold = page.locator("#playground .box", { hasText: "fold" }).first();
const hist = page.locator("#playground .box", { hasText: "history" }).first();
const fb = await fold.boundingBox(), hb = await hist.boundingBox();
console.log("fold", fb, "hist", hb);
await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
await page.mouse.down();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(900);
console.log("lines:", await page.locator("#edgelay line:not(.rubber)").count());
await browser.close();
