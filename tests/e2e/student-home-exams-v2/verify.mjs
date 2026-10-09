import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { preview } from "vite";
const baseline = Boolean(process.env.UI_BASELINE);
const output = "docs/ui/student-home-exams-v2";
await mkdir(output, { recursive: true });
const server = await preview({
  configFile: "tests/e2e/student-home-exams-v2/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4390, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch({ channel: "chromium", headless: true });
  const results = [];
  for (const [name, path, width, height] of [
    ["home-new", "/app", 390, 844],
    ["home-returning", "/app?student=returning", 390, 844],
    ["exams", "/exams", 390, 844],
    ["desktop", "/app?student=returning", 1280, 900],
    ["narrow", "/app", 360, 844],
    ["wide-phone", "/app", 412, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === "http://127.0.0.1:4390" ||
      ["fonts.googleapis.com", "fonts.gstatic.com"].includes(
        new URL(route.request().url()).hostname,
      )
        ? route.continue()
        : route.abort(),
    );
    await page.goto(`http://127.0.0.1:4390${path}`);
    await page
      .getByRole("heading", {
        exact: true,
        name: path.startsWith("/exams")
          ? baseline
            ? "الاختبارات"
            : "اختبر نفسك الآن"
          : "مرحباً، أحمد",
      })
      .waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0),
    );
    if (!baseline && path.startsWith("/exams")) {
      assert.equal(await page.locator('a[href^="/exams/history/session-"]').count(), 3);
      assert.equal(await page.locator('a[href^="/subjects/"]').count(), 3);
    } else if (!baseline) {
      await page
        .getByRole("heading", {
          exact: true,
          name: path.includes("returning") ? "الكيمياء · الحديد وخواصه" : "ابدأ أول درس",
        })
        .waitFor();
      assert.equal(await page.getByText("أدوات المراجعة", { exact: true }).count(), 1);
      assert.equal(await page.getByRole("link", { name: /متابعة الدرس|ابدأ الآن/ }).count(), 1);
      if (width < 1024) {
        assert.equal(
          await page.locator('header.student-shell-header a[href="/academy"]').count(),
          0,
        );
        assert.equal(
          await page
            .locator('header.student-shell-header button[aria-label="تسجيل الخروج"]')
            .count(),
          0,
        );
      }
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `${output}/${name}-${baseline ? "before" : "after"}.png`,
      fullPage: false,
    });
    results.push({ name, width, height, errors, overflow: false });
    await page.close();
  }
  await writeFile(
    `${output}/browser-results-${baseline ? "before" : "after"}.json`,
    JSON.stringify(results, null, 2),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
