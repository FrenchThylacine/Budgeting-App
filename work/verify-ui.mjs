import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outputDir = path.resolve("verification");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const messages = [];

page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    messages.push({ type: message.type(), text: message.text() });
  }
});
page.on("pageerror", (error) => {
  messages.push({ type: "pageerror", text: error.message });
});

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(outputDir, "desktop.png"), fullPage: true });

const title = await page.locator("h1").first().textContent();
const summaryCards = await page.locator(".summary-card").count();
const checkboxes = await page.locator('input[type="checkbox"]').count();

await page.getByRole("button", { name: /Wishlist/i }).click();
await page.getByPlaceholder("Wishlist item").fill("Verification Item");
await page.getByPlaceholder("Price").fill("123");
await page.getByRole("button", { name: /^Add$/i }).click();
const wishlistAdded = await page.getByDisplayValue("Verification Item").count();

await page.getByRole("button", { name: /Settings/i }).click();
const settingsVisible = await page.getByText("Exchange Rates").count();

await page.setViewportSize({ width: 390, height: 900 });
await page.screenshot({ path: path.join(outputDir, "mobile.png"), fullPage: true });

await browser.close();

const result = {
  title,
  summaryCards,
  checkboxes,
  wishlistAdded,
  settingsVisible,
  messages,
  screenshots: {
    desktop: path.join(outputDir, "desktop.png"),
    mobile: path.join(outputDir, "mobile.png"),
  },
};

console.log(JSON.stringify(result, null, 2));
