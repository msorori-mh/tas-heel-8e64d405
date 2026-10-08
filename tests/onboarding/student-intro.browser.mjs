import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { build } from "esbuild";

const output = "artifacts/student-audit-browser/onboarding";
await mkdir(output, { recursive: true });
const bundle = await build({
  entryPoints: ["src/lib/onboarding/student-intro.ts"],
  bundle: true,
  format: "iife",
  globalName: "StudentIntro",
  write: false,
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // No network is required by any page of the tour.
  await page.route("**/*", (route) => route.abort());
  await page.setContent(
    '<html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><button id="entry">تمكين</button></body></html>',
  );
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    window.completions = 0;
    window.StudentIntro.mountStudentIntro(async () => {
      window.completions++;
    });
  });
  for (let i = 0; i < 6; i++) {
    assert.equal(
      await page.locator('.intro-dots [aria-current="true"]').getAttribute("aria-label"),
      `الصفحة ${i + 1} من 6`,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.screenshot({ path: `${output}/page-${i + 1}.png`, fullPage: true });
    if (i < 5) await page.locator(".intro-next").click();
  }
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.locator(".intro-next").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/layout-${viewport.width}.png`, fullPage: true });
  }
  await page.locator(".intro-next").click();
  assert.equal(await page.locator(".tamkeen-intro").count(), 0);
  assert.equal(await page.evaluate(() => window.completions), 1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: six Arabic pages, offline network isolation, small/landscape layouts, completion; screenshots saved.",
  );
} finally {
  await browser.close();
}
