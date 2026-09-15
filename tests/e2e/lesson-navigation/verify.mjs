import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { preview } from "vite";
const output = "artifacts/lesson-navigation";
await mkdir(output, { recursive: true });
const server = await preview({
  configFile: "tests/e2e/lesson-navigation/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4388, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const width of [360, 768, 960, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:4388");
    await page.getByRole("tab").last().waitFor();
    const geometry = await page.getByRole("tab").evaluateAll((tabs) =>
      tabs.map((tab) => {
        const box = tab.getBoundingClientRect();
        const list = tab.parentElement.getBoundingClientRect();
        return (
          box.left >= list.left &&
          box.right <= list.right &&
          box.top >= list.top &&
          box.bottom <= list.bottom &&
          box.height >= 44
        );
      }),
    );
    assert.deepEqual(
      geometry,
      Array(7).fill(true),
      `${width}: every component must fit the chooser`,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.screenshot({ path: `${output}/components-${width}.png`, fullPage: false });
    await page.locator("#lesson-tab-OFFICIAL_QUESTIONS").tap();
    await page.getByLabel("إجابتي OFFICIAL_QUESTIONS", { exact: true }).fill("إجابة اختبار");
    await page.locator("#lesson-tab-SELF_TEST").tap();
    await page.locator("#lesson-tab-OFFICIAL_QUESTIONS").tap();
    assert.equal(
      await page.getByLabel("إجابتي OFFICIAL_QUESTIONS", { exact: true }).inputValue(),
      "إجابة اختبار",
    );
    // Wheel exercises document scrolling in Chromium; native Android finger swipes remain a separate gate.
    await page.mouse.move(width / 2, 700);
    await page.mouse.wheel(0, 1600);
    await page.waitForFunction(() => scrollY > 1000);
    const lower = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, -450);
    await page.waitForFunction((before) => scrollY < before - 200, lower);
    const back = page.getByRole("button", { name: "مكونات الدرس", exact: true });
    await back.waitFor();
    await page.screenshot({ path: `${output}/return-${width}.png`, fullPage: false });
    await back.tap();
    await page.waitForFunction(
      () => document.querySelector('[role="tablist"]').getBoundingClientRect().top >= 0,
    );
    assert.equal(
      await page.locator("#lesson-tab-OFFICIAL_QUESTIONS").getAttribute("aria-selected"),
      "true",
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      allSevenFit: true,
      lastTabsTappable: true,
      answersPreserved: true,
      scrollDownUp: true,
      returnToActive: true,
    });
    await context.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
