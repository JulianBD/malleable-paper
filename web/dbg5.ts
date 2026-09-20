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
const fb = await page.locator("#playground .box", { hasText: "fold" }).first().boundingBox();
const x = fb.x + fb.width / 2, y = fb.y + fb.height / 2;
const info = await page.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  const label = document.querySelector('#playground .box .label');
  const cs = getComputedStyle(label);
  return { target: el?.className + '|' + el?.tagName, labelCS: { inset: cs.inset, left: cs.left, transform: cs.transform }, pgClass: document.getElementById('playground').className };
}, [x, y]);
console.log("point", x, y, JSON.stringify(info, null, 1));
await browser.close();
