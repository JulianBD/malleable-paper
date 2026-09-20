import { chromium } from "../prototypes/interaction/node_modules/playwright/index.js";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(2500); // let one poll land
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
console.log("title:", await page.locator("#frame-title").textContent());
console.log("cards:", await page.locator(".card").count());
console.log("status:", await page.locator(".card-status").first().textContent());
console.log("rows:", await page.locator(".card tr").count());
await page.screenshot({ path: "web/shots/03-cards.png" });
await browser.close();
