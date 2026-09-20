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
const hit = await page.evaluate(() => {
  const el = document.elementFromPoint(210, 311);
  const chain = [];
  let n = el;
  while (n && n !== document.body) { chain.push(n.tagName + '#' + (n.id || '') + '.' + (n.className?.baseVal ?? n.className ?? '')); n = n.parentElement; }
  return chain.join(' < ');
});
console.log("element at (210,311):", hit);
await browser.close();
