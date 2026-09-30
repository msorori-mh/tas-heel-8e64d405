import { chromium } from "playwright";
import { preview } from "vite";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const dir = "artifacts/teacher-directory-browser";
await mkdir(dir, { recursive: true });
const server = await preview({
  configFile: "tests/e2e/teacher-directory/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4180, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = [],
    measurements = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("http://127.0.0.1:4180");
    await page.getByRole("heading", { name: "المعلمون (23)", exact: true }).waitFor();
    const size = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.equal(size.width, size.scroll);
    measurements.push(size);
    await page.screenshot({ path: `${dir}/directory-${width}.png` });
    await page.getByRole("button", { name: "عرض ملف معلم تجريبي", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("teacher0@example.test", { exact: true }).waitFor();
    await dialog.getByText("محاولات التقييم (2)", { exact: true }).click();
    assert.equal(await dialog.getByText("4 / 4 (100%)", { exact: true }).isVisible(), true);
    assert.equal(
      await dialog.getByText("TAM-1234567890ABCDEF1234", { exact: true }).isVisible(),
      true,
    );
    const bounds = await dialog.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        width: innerWidth,
        scroll: e.scrollWidth,
        client: e.clientWidth,
      };
    });
    assert(bounds.left >= 0 && bounds.right <= bounds.width);
    assert.equal(bounds.scroll, bounds.client);
    await dialog.screenshot({ path: `${dir}/detail-${width}.png` });
    await dialog.getByRole("button", { name: "إغلاق الملف", exact: true }).click();
    await page.getByRole("button", { name: "عرض ملف معلم تجريبي", exact: true }).nth(1).click();
    await page.getByRole("dialog").getByText("teacher1@example.test", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("dialog")
        .getByText("لم يلتحق هذا المعلم بأي برنامج بعد.", { exact: true })
        .isVisible(),
      true,
    );
    await page.getByRole("button", { name: "إغلاق الملف", exact: true }).click();
    await page.getByRole("button", { name: "التالي", exact: true }).click();
    await page.getByRole("button", { name: "عرض ملف معلم 23", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "التالي", exact: true }).isEnabled(),
      false,
    );
    await page.getByLabel("البحث", { exact: true }).fill("لا يوجد");
    await page.getByRole("button", { name: "تطبيق الفلاتر", exact: true }).click();
    await page.getByText("لا يوجد معلمون مطابقون للفلاتر الحالية.", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "تصدير الصفحة", exact: true }).isEnabled(),
      false,
    );
    await page.getByRole("button", { name: "مسح الفلاتر", exact: true }).click();
    await page.getByRole("heading", { name: "المعلمون (23)", exact: true }).waitFor();
    await page.getByLabel("المسار التدريبي", { exact: true }).selectOption("CERTIFIED");
    await page.getByRole("button", { name: "تطبيق الفلاتر", exact: true }).click();
    await page.getByRole("heading", { name: "المعلمون (1)", exact: true }).waitFor();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير الصفحة", exact: true }).click();
    assert.equal((await download).suggestedFilename(), "tamkeen-teachers-page-1.csv");
  }
  await page.getByLabel("البحث", { exact: true }).fill("خطأ");
  await page.getByRole("button", { name: "تطبيق الفلاتر", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name: "إعادة المحاولة", exact: true }).click();
  await page.getByRole("heading", { name: "المعلمون (1)", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await writeFile(`${dir}/verification.json`, JSON.stringify({ measurements, errors }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
