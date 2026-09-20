import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
for (let i = 0; i < 9; i++) {
  const t = await page.locator("#frame-title").textContent();
  if (t.includes("olog")) break;
  await page.click("#fnext"); await page.waitForTimeout(150);
}
const node = page.locator("#playground .box", { hasText: "probe node" }).first();
const nb = await node.boundingBox();
const pg = await page.locator("#playground").boundingBox();
console.log("node", nb, "\nplayground", pg);
const pill = node.locator(".label");
console.log("pill", await pill.boundingBox());
await browser.close();
