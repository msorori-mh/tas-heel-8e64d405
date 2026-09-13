import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { preview } from "vite";
const output = "artifacts/low-data";
await mkdir(output, { recursive: true });
const server = await preview({
  configFile: "tests/e2e/low-data/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4383, strictPort: true },
});
let browser;
try {
  // Full Chromium includes the built-in PDF engine; headless-shell cannot render this reader.
  browser = await chromium.launch({ channel: "chromium", headless: true });
  const results = [];
  for (const width of [320, 390, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [],
      requests = [];
    let policy = "stall";
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://127.0.0.1:4383") return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      requests.push(route.request().method());
      if (policy === "stall") return; // Intentionally held until the reader aborts its bounded check.
      if (route.request().method() === "HEAD")
        return route.fulfill({
          status: 200,
          headers: { "x-file-version": "v2", "content-length": "5000" },
        });
      return route.fulfill({ status: 503 }); // A failed update must preserve the current reader.
    });
    await page.goto("http://127.0.0.1:4383");
    await page.locator("object").waitFor();
    assert.equal(await page.evaluate(() => navigator.pdfViewerEnabled), true);
    assert.equal(await page.getByRole("switch").getAttribute("aria-checked"), "true");
    assert.deepEqual(requests, []);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    // Let the built-in PDF compositor paint before capturing the visual evidence.
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${output}/saved-reader-${width}.png`, fullPage: true });
    await context.setOffline(true);
    await page.getByRole("button", { name: "إغلاق القارئ", exact: true }).click();
    await page.getByRole("button", { name: "فتح النسخة المحفوظة", exact: true }).click();
    await page.locator("object").waitFor();
    assert.deepEqual(requests, []);
    await context.setOffline(false);
    if (width === 390) {
      await page.getByRole("button", { name: "التحقق من التحديث", exact: true }).click();
      await page
        .getByText("تعذّر إكمال الطلب. يمكنك متابعة قراءة النسخة المحفوظة.")
        .waitFor({ timeout: 8000 });
      assert.equal(await page.locator("object").count(), 1);
      assert.deepEqual(requests, ["HEAD"]);
      policy = "fail-update";
      await page.getByRole("button", { name: "التحقق من التحديث", exact: true }).click();
      await page.getByRole("button", { name: "تنزيل التحديث", exact: true }).waitFor();
      assert.deepEqual(requests, ["HEAD", "HEAD"]);
      const oldUrl = await page.locator("object").getAttribute("data");
      await page.getByRole("button", { name: "تنزيل التحديث", exact: true }).click();
      await page.getByText("تعذّر إكمال الطلب. يمكنك متابعة قراءة النسخة المحفوظة.").waitFor();
      assert.equal(await page.locator("object").getAttribute("data"), oldUrl);
      assert.deepEqual(requests, ["HEAD", "HEAD", "GET"]);
      await page.screenshot({ path: `${output}/failed-update-${width}.png`, fullPage: true });
      await page.getByRole("switch").click();
      await page.waitForFunction(
        () => localStorage.getItem("CapacitorStorage.tamkeen-data-saver-v1") === "off",
      );
      await page.reload();
      await page.locator("object").waitFor();
      await page.getByRole("switch", { checked: false }).waitFor({ timeout: 5000 });
      assert.equal(await page.getByRole("switch").getAttribute("aria-checked"), "false");
      await page.getByRole("switch").click();
    }
    assert.deepEqual(errors, []);
    results.push({
      width,
      noOverflow: true,
      savedOpenNetworkRequests: 0,
      offlineReopen: true,
      stalledCheckAndFailedUpdate: width === 390 ? "pass" : "covered at 390",
    });
    await context.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(results);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
