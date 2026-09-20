import { chromium } from "/Users/juliandorsey/Code/malleable-paper/prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
await page.waitForTimeout(400);
const info = await page.evaluate(() => {
  const c = document.querySelector('.card:has(.card-form)');
  const form = c.querySelector('.card-form');
  const field = c.querySelector('.card-field');
  return {
    formDisplay: getComputedStyle(form).display,
    fieldDisplay: getComputedStyle(field).display,
    formChildren: [...form.children].map((x) => x.tagName + '.' + x.className),
    cardDisplay: getComputedStyle(c).display,
    fieldCount: c.querySelectorAll('.card-field').length,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
