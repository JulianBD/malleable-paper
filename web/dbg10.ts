import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)));
page.on("console", (m) => console.log("console:", m.text().slice(0, 150)));
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
for (let i = 0; i < 9; i++) {
  const t = await page.locator("#frame-title").textContent();
  if (t.includes("olog")) break;
  await page.click("#fnext"); await page.waitForTimeout(150);
}
const info = await page.evaluate(() => {
  const svg = document.getElementById('edgelay');
  const hits = svg.querySelectorAll('line.hit');
  const l = hits[0];
  const r = l.getBoundingClientRect();
  return { hits: hits.length, cs: getComputedStyle(l).pointerEvents, rect: { x: r.x, y: r.y, w: r.width }, svgPE: getComputedStyle(svg).pointerEvents };
});
console.log(JSON.stringify(info));
if (info.hits) {
  const cx = info.rect.x + (info.rect.w ? info.rect.w / 2 : 0), cy = info.rect.y;
  console.log("clicking at", cx, cy);
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(300);
  console.log("line.sel count:", await page.locator("#edgelay line.sel").count());
  console.log("hit lines:", await page.locator("#edgelay line.hit").count());
}
await browser.close();
