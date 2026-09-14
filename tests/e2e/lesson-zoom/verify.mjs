import assert from "node:assert/strict";
import { chromium } from "playwright";
import { preview } from "vite";
const server = await preview({
  configFile: "tests/e2e/lesson-zoom/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4385, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: "chromium" });
  for (const width of [320, 390, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4385");
    const frame = page.frameLocator("iframe");
    await frame.locator("#counter").click();
    const before = await frame.locator("h1").evaluate((e) => e.getBoundingClientRect().width);
    const boxBefore = await page.locator("iframe").boundingBox();
    for (let i = 0; i < 4; i++)
      await page.getByRole("button", { name: "تكبير المحتوى", exact: true }).click();
    const boxAfter = await page.locator("iframe").boundingBox();
    assert.ok(Math.abs(boxAfter.width / boxBefore.width - 2) < 0.02);
    assert.ok(
      Math.abs(
        (await frame.locator("h1").evaluate((e) => e.getBoundingClientRect().width)) - before,
      ) < 1,
    );
    assert.equal(await frame.locator("#counter").textContent(), "1");
    const scroll = page.getByLabel("محتوى الدرس القابل للتمرير");
    assert.ok(await scroll.evaluate((e) => e.scrollWidth > e.clientWidth));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await scroll.evaluate((e) => {
      e.scrollLeft = -100;
      e.scrollTop = 100;
    });
    assert.ok(await scroll.evaluate((e) => Math.abs(e.scrollLeft) > 0 && e.scrollTop > 0));
    await page.getByRole("button", { name: "إعادة الحجم الأصلي" }).click();
    await frame.locator("#counter").click();
    assert.equal(await frame.locator("#counter").textContent(), "2");
    console.log(`PASS zoom geometry, RTL scroll, retained interaction: ${width}px`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
}
