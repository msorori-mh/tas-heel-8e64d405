import { chromium } from "playwright";
import { preview } from "vite";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const dir = "artifacts/teacher-audit-browser";
await mkdir(dir, { recursive: true });
const server = await preview({
  configFile: "tests/e2e/teacher-audit/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4178, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = [];
  const measurements = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("http://127.0.0.1:4178");
    await page.getByText("أكملت برامجك التدريبية", { exact: true }).waitFor();
    await page.locator(".teacher-bottom-nav").getByRole("button", { name: "ملفي المهني" }).click();
    const save = page.getByRole("button", { name: "حفظ والانتقال إلى البرامج" });
    await save.scrollIntoViewIfNeeded();
    const measured = await page.evaluate(() => {
      const rect = (s) => document.querySelector(s).getBoundingClientRect();
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        header: rect(".mobile-header").top,
        brand: rect(".mobile-header .brand-line").top,
        button: rect(".mobile-header .icon-button").height,
        saveBottom: rect(".profile-form button[type=submit]").bottom,
        navTop: rect(".teacher-bottom-nav").top,
      };
    });
    assert.equal(measured.width, measured.scrollWidth);
    assert.equal(measured.header, 0);
    assert(measured.brand >= 28);
    assert(measured.button >= 44);
    assert(measured.saveBottom <= measured.navTop);
    measurements.push(measured);
    await page.screenshot({ path: `${dir}/profile-${width}.png`, fullPage: true });
    await save.click();
    await page.getByText("تم حفظ ملفك المهني بنجاح.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "ابدأ التدريب" }).click();
    await page.getByRole("heading", { name: "اجتزت التقييم" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "إرسال التقييم" }).count(), 0);
  }
  assert.deepEqual(errors, []);
  await writeFile(`${dir}/verification.json`, JSON.stringify({ measurements, errors }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
