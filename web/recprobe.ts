import { chromium } from "/Users/juliandorsey/Code/malleable-paper/prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.click("#record"); await page.waitForTimeout(200);
await page.click("#record"); await page.waitForTimeout(200);
await browser.close();
