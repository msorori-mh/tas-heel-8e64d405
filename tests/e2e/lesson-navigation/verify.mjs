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
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.LESSON_TEST_CHROME,
  });
  const results = [];
  for (const width of [360, 768, 960, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:4388");
    await page.getByRole("tab").last().waitFor();
    const frame = page.frameLocator('iframe[title="جدول الخواص"]');
    await frame.getByRole("table").waitFor();
    const cells = await frame
      .locator("tr")
      .last()
      .locator("td")
      .evaluateAll((cells) =>
        cells.map((cell) => ({
          display: getComputedStyle(cell).display,
          width: cell.getBoundingClientRect().width,
        })),
      );
    if (width <= 600)
      assert.ok(cells.every((cell) => cell.display === "block" && cell.width > width * 0.65));
    assert.equal(await frame.locator("script").count(), 0);
    for (const tab of await page.getByRole("tab").all()) {
      await tab.tap();
      const box = await tab.boundingBox();
      assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1);
    }
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
    assert.ok(
      await page.getByRole("tablist").evaluate((list) => list.getBoundingClientRect().top >= 0),
    );
    await page.screenshot({ path: `${output}/reading-${width}.png`, fullPage: false });
    await page.waitForTimeout(300);
    const savedY = await page.evaluate(() => scrollY);
    await page.reload();
    await page.waitForFunction((y) => Math.abs(scrollY - y) < 5, savedY);
    assert.equal(
      await page.locator("#lesson-tab-OFFICIAL_QUESTIONS").getAttribute("aria-selected"),
      "true",
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      allSevenReachable: true,
      lastTabsTappable: true,
      answersPreserved: true,
      scrollDownUp: true,
      resumeReading: true,
    });
    await context.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
