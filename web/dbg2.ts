import { chromium } from "/Users/juliandorsey/Code/malleable-paper/prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
await page.waitForTimeout(400);
console.log(await page.evaluate(() => {
  const q = (s) => { const el = document.querySelector(s); if (!el) return s + ': missing';
    const r = el.getBoundingClientRect();
    return `${s}: h=${Math.round(r.height)} scrollH=${el.scrollHeight} overflow=${getComputedStyle(el).overflowY} minH=${getComputedStyle(el).minHeight}`; };
  return ['body', 'main#plane', '#frames', '#frames section', '#sysframe', '.sys'].map(q);
}));
await browser.close();
