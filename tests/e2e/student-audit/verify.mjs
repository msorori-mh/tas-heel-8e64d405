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
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).last().click();
  assert.equal(new URL(page.url()).pathname, "/ministerial-exams/sessions/demo");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "مغادرة الاختبار" }).click();
  await page.waitForURL("**/app");
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
