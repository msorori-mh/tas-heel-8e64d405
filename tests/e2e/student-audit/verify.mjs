import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { preview } from "vite";
await mkdir("artifacts/student-audit-browser", { recursive: true });
const server = await preview({
  configFile: "tests/e2e/student-audit/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4177, strictPort: true },
});
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  const errors = [];
  const measurements = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 820 });
    await page.goto("http://127.0.0.1:4177/app");
    await page.getByTestId("last-content").scrollIntoViewIfNeeded();
    const measure = await page.evaluate(() => {
      const header = document.querySelector(".student-shell-header").getBoundingClientRect();
      const logo = document.querySelector(".student-shell-header a").getBoundingClientRect();
      const last = document.querySelector('[data-testid="last-content"]').getBoundingClientRect();
      const nav = document.querySelector(".student-bottom-nav").getBoundingClientRect();
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        headerTop: header.top,
        logoTop: logo.top,
        lastBottom: last.bottom,
        navTop: nav.top,
        navBottom: nav.bottom,
      };
    });
    assert.equal(measure.width, measure.scrollWidth);
    assert.equal(measure.headerTop, 0, "header must remain sticky after scrolling");
    assert(measure.logoTop >= 28, "logo must clear the status bar");
    assert(measure.lastBottom <= measure.navTop, "last content must clear bottom navigation");
    assert.equal(measure.navBottom, 820);
    measurements.push(measure);
    await page.screenshot({
      path: `artifacts/student-audit-browser/safe-area-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto("http://127.0.0.1:4177/ministerial-exams/sessions/demo");
  await page.getByRole("heading", { name: "نموذج وزاري تجريبي" }).waitFor();
  assert.equal(
    await page.locator('nav[aria-label="التنقل السفلي"] [aria-current="page"]').textContent(),
    "الاختبارات",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "مغادرة الاختبار" }).click();
  assert.equal(new URL(page.url()).pathname, "/ministerial-exams/sessions/demo");
  // Mobile account actions moved to settings; retain the sign-out navigation
  // guard coverage through the unchanged, visible desktop sidebar action.
  assert.equal(
    await page.locator('.student-shell-header button[aria-label="تسجيل الخروج"]').count(),
    0,
  );
  assert.equal(await page.locator('.student-shell-header a[href="/academy"]').count(), 0);
  await page.setViewportSize({ width: 1280, height: 820 });
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).last().click();
  assert.equal(new URL(page.url()).pathname, "/ministerial-exams/sessions/demo");
  await page.setViewportSize({ width: 390, height: 820 });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "مغادرة الاختبار" }).click();
  await page.waitForURL("**/app");
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 820 });
    await page.goto("http://127.0.0.1:4177/subjects/search-fixture");
    const input = page.getByRole("searchbox", { name: "البحث عن درس" });
    await input.fill("احصاء");
    await page.getByRole("link", { name: /مَبادِئ الإِحْصَاء/ }).waitFor();
    await page.getByRole("link", { name: /الإحصاء المتقدم/ }).waitFor();
    assert.equal(await page.locator('a[href="/lessons/intro"]').count(), 0);
    const measure = await page.evaluate(() => {
      const input = document.querySelector('input[type="search"]');
      const clear = document.querySelector('button[aria-label="مسح البحث"]');
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        inputHeight: input.getBoundingClientRect().height,
        clearWidth: clear.getBoundingClientRect().width,
        clearHeight: clear.getBoundingClientRect().height,
        direction: getComputedStyle(input).direction,
      };
    });
    assert.equal(measure.width, measure.scrollWidth);
    assert.equal(measure.direction, "rtl");
    assert(measure.inputHeight >= 44 && measure.clearWidth >= 44 && measure.clearHeight >= 44);
    measurements.push({ feature: "lesson-search", ...measure });
    // Let accordion opening animations finish before recording the visual evidence.
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState === "finished"),
    );
    await page.screenshot({
      path: `artifacts/student-audit-browser/lesson-search-${width}.png`,
      fullPage: true,
    });
    await input.fill("غير موجود");
    await page.getByText("لا توجد دروس مطابقة.", { exact: false }).waitFor();
    assert.equal(await page.locator('a[href^="/lessons/"]').count(), 0);
    await page.getByRole("button", { name: "مسح البحث" }).click();
    assert.equal(await input.inputValue(), "");
    assert(await input.evaluate((element) => document.activeElement === element));
    await page.getByRole("link", { name: /مقدمة الرياضيات/ }).waitFor();
    await input.fill("اساسيات");
    await page.getByRole("link", { name: /أساسيات الجبر/ }).waitFor();
    assert.equal(await page.locator('a[href^="/units/"]').count(), 0);
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/student-audit-browser/verification.json",
    JSON.stringify(
      {
        measurements,
        checks: [
          "sticky header",
          "simulated native insets",
          "last content visible",
          "RTL without overflow",
          "ministerial navigation highlight",
          "cancel leave",
          "cancel sign-out",
          "confirm leave",
          "lesson search opens all matching units",
          "Arabic matching without diacritics",
          "no matches and clear search with focus",
          "direct lessons without synthetic units",
          "44px search controls at 320, 390 and 1280px",
          "no runtime errors",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
