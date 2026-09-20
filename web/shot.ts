import { chromium } from "/Users/juliandorsey/Code/malleable-paper/prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
await page.waitForTimeout(400);
await page.screenshot({ path: "shots/07-card-fixed.png" });
await browser.close();
