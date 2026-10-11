import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { build } from "esbuild";

const output = "docs/ui/student-home-exams-v2";
await mkdir(output, { recursive: true });
const bundle = await build({
  entryPoints: ["src/lib/onboarding/student-intro.ts"],
  bundle: true,
  format: "iife",
  globalName: "StudentIntro",
  write: false,
});
const offlineHtml = await readFile("mobile/www/index.html", "utf8");
const inlineTour = offlineHtml.match(
  /<script id="tamkeen-student-intro-bundle">([\s\S]*?)<\/script>/,
)?.[1];
assert.ok(inlineTour, "offline entry contains its own tour code");
assert.ok(!offlineHtml.includes("import { INTRO_KEY, mountStudentIntro }"));
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
});
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 800, height: 1280 },
    { width: 844, height: 390 },
  ]) {
    const page = await browser.newPage({ viewport, isMobile: true, hasTouch: true });
    const errors = [],
      requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(request.url()));
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
    for (let i = 0; i < 4; i++) {
      assert.equal(
        await page.locator('.intro-dots [aria-current="true"]').getAttribute("aria-label"),
        `الصفحة ${i + 1} من 4`,
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            document.querySelector(".tamkeen-intro").scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.equal(await page.locator(".intro-skip").isVisible(), i < 3);
      assert.equal(await page.locator(".intro-tags, .intro-hint, .intro-top strong").count(), 0);
      if (i === 0 && viewport.width === 390) {
        const mark = await page.locator(".intro-art > rect").boundingBox();
        assert.ok(Math.abs(mark.width - 128) < 1, "brand square renders at 128px");
      }
      for (const button of await page.locator(".tamkeen-intro button:visible").all()) {
        const box = await button.boundingBox();
        assert.ok(box.height >= 44 && box.width >= 44);
      }
      await page.locator(".intro-next").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${output}/intro-${viewport.width}-page-${i + 1}.png`,
        fullPage: true,
      });
      if (i < 3) await page.locator(".intro-next").click();
    }
    await page.locator(".intro-next").click();
    assert.equal(await page.locator(".tamkeen-intro").count(), 0);
    assert.equal(await page.evaluate(() => window.completions), 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    await page.close();
  }
  // Exercise the actual embedded entry, including a native bridge without
  // an already registered Preferences proxy. No script request is possible.
  const entry = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const requests = [];
  entry.on("request", (request) => requests.push(request.url()));
  await entry.route("**/*", (route) => route.abort());
  const legacyStyles = offlineHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  await entry.setContent(
    `<html lang="ar" dir="rtl"><head><style>${legacyStyles}</style></head><body></body></html>`,
  );
  await entry.evaluate(() => {
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android",
      Plugins: {},
      registerPlugin: () => ({ get: async () => ({ value: null }), set: async () => {} }),
    };
  });
  await entry.addScriptTag({ content: inlineTour });
  const bootstrap = offlineHtml.slice(
    offlineHtml.indexOf("      (async () => {"),
    offlineHtml.lastIndexOf("</script>"),
  );
  await entry.addScriptTag({ content: bootstrap });
  await entry.getByRole("heading", { name: "منهجك بين يديك", exact: true }).waitFor();
  assert.deepEqual(requests, []);
  const header = await entry.locator(".intro-top").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      border: style.borderBottomWidth,
      position: style.position,
      margin: style.marginTop,
    };
  });
  assert.deepEqual(header, {
    background: "rgba(0, 0, 0, 0)",
    border: "0px",
    position: "static",
    margin: "0px",
  });
  await entry.close();
  console.log(
    "PASS: four Arabic pages, offline network isolation, touch targets, skip state, mobile/tablet/landscape layouts and completion.",
  );
} finally {
  await browser.close();
}
