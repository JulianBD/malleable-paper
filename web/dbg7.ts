import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)));
page.on("console", (m) => console.log("console:", m.text().slice(0, 200)));
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
for (let i = 0; i < 9; i++) {
  const t = await page.locator("#frame-title").textContent();
  if (t.includes("olog")) break;
  await page.click("#fnext"); await page.waitForTimeout(150);
}
await page.evaluate(() => {
  window.__dbg = [];
  document.getElementById('plane').addEventListener('dblclick', (e) => {
    window.__dbg.push({ tgt: e.target.className + '|' + e.target.tagName, pill: !!e.target.closest('.label'), box: !!e.target.closest('.box') });
  }, true);
});
const node = page.locator("#playground .box", { hasText: "probe node" }).first();
if (await node.count()) {
  await node.locator(".label").dblclick();
  await page.waitForTimeout(400);
  console.log("dblclick seen:", JSON.stringify(await page.evaluate(() => window.__dbg)));
  console.log("verbin count:", await page.locator(".verbin").count());
} else console.log("no probe node found — check label");
await browser.close();
