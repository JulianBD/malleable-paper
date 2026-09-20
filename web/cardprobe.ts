import { chromium } from "/Users/juliandorsey/Code/malleable-paper/prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(400);
console.log("cards:", await page.locator(".card").count());
console.log("radios:", await page.locator(".card input[type=radio]").count());
console.log("textarea:", await page.locator(".card textarea").count());
// full round-trip on a throwaway card: post, fill, submit, verify ruled
const r = await page.evaluate(async () => {
  await fetch('/event', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'card', id: 'T-form-probe', title: 'test card (probe, ignore)',
      form: { fields: [{ ref: 'X', options: [{ k: 'a', label: 'yes' }, { k: 'b', label: 'no' }] }] } }) });
  return true;
});
console.log("test card posted:", r);
await page.waitForTimeout(2500); // next poll renders it
await page.locator('.card:has-text("test card") input[value="a"]').check();
await page.locator('.card:has-text("test card") textarea').fill('probe write-in');
await page.locator('.card:has-text("test card") button').click();
await page.waitForTimeout(2500);
console.log("test card status:", await page.locator('.card:has-text("test card") .card-status').textContent());
await page.screenshot({ path: "web/shots/04-card-form.png" });
await browser.close();
