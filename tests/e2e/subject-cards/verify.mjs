import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { preview } from "vite";
await mkdir("artifacts/subject-cards", { recursive: true });
const server = await preview({
  configFile: "tests/e2e/subject-cards/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4175, strictPort: true },
});
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const measurements = [];
for (const width of [320, 360, 390, 768, 1366]) {
  await page.setViewportSize({ width, height: 820 });
  await page.goto("http://127.0.0.1:4175/");
  await page.locator("article").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    heights: [...document.querySelectorAll("article")].map((n) => n.getBoundingClientRect().height),
    books: [...document.querySelectorAll("article button")].map(
      (n) => n.getBoundingClientRect().height,
    ),
  }));
  assert.equal(dimensions.scrollWidth, width, `horizontal overflow at ${width}`);
  assert(dimensions.books.every((x) => x >= 44));
  measurements.push(dimensions);
  if (width === 390 || width === 320 || width === 1366)
    await page.screenshot({ path: `artifacts/subject-cards/mobile-${width}.png`, fullPage: true });
}
await page.setViewportSize({ width: 390, height: 820 });
await page.goto("http://127.0.0.1:4175/");
await page.getByRole("button", { name: "كتب المنهج: البلاغة والنقد — عرض أو تنزيل" }).click();
await page.getByRole("dialog").waitFor();
assert.equal(new URL(page.url()).pathname, "/");
await page.getByText("إغلاق", { exact: true }).click();
await page.getByRole("link", { name: "تابع درسك: القراءة الناقدة" }).click();
await page.getByText("تم فتح الدرس").waitFor();
assert.equal(new URL(page.url()).pathname, "/lessons/lesson-reading");
await page.goto("http://127.0.0.1:4175/");
const first = page.locator("article").first();
await first.click({ position: { x: 5, y: 65 } });
await page.getByText("تم فتح المادة").waitFor();
assert.equal(new URL(page.url()).pathname, "/subjects/arabic");
assert.equal(new URL(page.url()).search, "?semester=1");
assert.deepEqual(errors, []);
const report = {
  measurements,
  checks:
    "books isolation, actual resume link, card surface navigation, no overflow, 44px books targets, no page errors",
};
await writeFile("artifacts/subject-cards/verification.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
await new Promise((resolve) => server.httpServer.close(resolve));
