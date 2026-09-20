import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)));
page.on("console", (m) => { const t = m.text(); if (t.includes("box") || t.includes("node")) console.log("console:", t.slice(0, 150)); });
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
for (let i = 0; i < 9; i++) {
  const t = await page.locator("#frame-title").textContent();
  if (t.includes("olog")) break;
  await page.click("#fnext"); await page.waitForTimeout(150);
}
console.log("boxes:", await page.locator("#playground .box").count());
console.log("renamed present:", await page.locator("#playground .box", { hasText: "renamed probe" }).count());
console.log("old present:", await page.locator("#playground .box", { hasText: "a probe node 64858" }).count());
await browser.close();
