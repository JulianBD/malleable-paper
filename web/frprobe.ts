import { chromium } from "/Users/juliandorsey/Code/malleable-paper/prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(3000); // poll picks up the frame_def
console.log("frame count on title:", await page.locator("#frame-title").textContent());
for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
console.log("now:", await page.locator("#frame-title").textContent());
console.log("has pipeline heading:", await page.locator('.dynframe h2, .dynframe p').first().textContent());
// live-update test: redefine the frame while looking at it
await page.evaluate(async () => {
  await fetch('/act', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'frame_def', id: 'F-pipeline', title: 'pipeline · the four stages',
      body: '## updated live\n\nthis line was not in the first version.' }) });
});
await page.waitForTimeout(3000);
console.log("after redef:", await page.locator('.dynframe').textContent());
await page.screenshot({ path: "shots/10-dynframe.png" });
await browser.close();
