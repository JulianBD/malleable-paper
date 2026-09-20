import { chromium } from "/Users/juliandorsey/Code/malleable-paper/prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
console.log("ruled card shows picks:", await page.locator('.card:has-text("Schema conventions") .card-note').last().textContent());
await page.evaluate(async () => {
  await fetch('/act', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'card', id: 'T-queue-ui', title: 'queue ui probe (ignore)',
      form: { fields: [{ ref: 'Q', options: [{ k: 'a', label: 'yes' }] }] } }) });
});
await page.waitForTimeout(3000);
const tc = page.locator('.card:has-text("queue ui probe")');
console.log("probe card appeared via cursor poll:", await tc.count() === 1);
await tc.locator('input[value="a"]').check();
await tc.locator('button.discuss').click();
await page.waitForTimeout(3000);
console.log("discuss landed (card still pending):", await tc.locator(".card-status").textContent());
await browser.close();
