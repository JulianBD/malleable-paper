import { chromium } from "/Users/juliandorsey/Code/malleable-paper/prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
await page.waitForTimeout(400);
console.log(await page.evaluate(() => {
  const el = document.getElementById('sysframe').querySelector('.sys');
  const before = el.scrollTop;
  el.scrollTop = 99999;
  return { scrollable: el.scrollHeight > el.clientHeight, scrolledTo: el.scrollTop, was: before };
}));
await browser.close();
