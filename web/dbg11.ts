import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";
const URL = "http://localhost:5174";
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
await page.evaluate(() => {
  const svg = document.getElementById('edgelay');
  svg.addEventListener('click', (e) => console.log('SVGCLICK', e.target.tagName, e.target.className?.baseVal ?? e.target.className), true);
  document.getElementById('plane').addEventListener('pointerup', () => console.log('PLANE-UP'), true);
});
const card = page.locator("#playground .box", { has: page.locator(".label", { hasText: /^card$/ }) }).first();
const cb = await card.boundingBox();
console.log("card", cb);
// there is one dangling edge (card -> superseded doomed). find the dangsel:
const dang = await page.evaluate(() => {
  const l = document.querySelector('#edgelay line.dangsel');
  if (!l) return null;
  return { x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'), x2: +l.getAttribute('x2'), pe: getComputedStyle(l).pointerEvents };
});
console.log("dangsel", dang);
if (dang) {
  // convert playground coords to page: playground rect
  const pg = await page.locator("#playground").boundingBox();
  const midx = pg.x + (dang.x1 + dang.x2) / 2, midy = pg.y + dang.y1;
  console.log("clicking stub at", midx, midy);
  await page.mouse.click(midx, midy);
  await page.waitForTimeout(300);
  console.log("line.sel:", await page.locator("#edgelay line.sel").count());
}
await browser.close();
