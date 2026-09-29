import { chromium } from "playwright";
import { preview } from "vite";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const dir = "artifacts/admin-audit-browser";
await mkdir(dir, { recursive: true });
const server = await preview({
  configFile: "tests/e2e/admin-audit/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4179, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = [],
    measurements = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 640 });
    await page.goto("http://127.0.0.1:4179");
    await page.getByRole("heading", { name: "TEST_ONLY إدارة تمكين" }).waitFor();
    if (width < 768) {
      assert.equal(
        await page.getByRole("navigation", { name: "أقسام الإدارة" }).isVisible(),
        false,
      );
      await page.getByRole("button", { name: "فتح القائمة" }).click();
    }
    const nav = page.getByRole("navigation", { name: "أقسام الإدارة" });
    await nav.getByRole("link", { name: "إدارة الأكاديمية", exact: true }).scrollIntoViewIfNeeded();
    const measured = await page.evaluate(() => {
      const rect = (s) => document.querySelector(s).getBoundingClientRect();
      const sidebar = document.querySelector(".admin-sidebar");
      const nav = sidebar.querySelector("nav");
      const footer = nav.nextElementSibling;
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        headerTop: rect(".admin-shell-header").top,
        headerExitTop: rect('.admin-shell-header button[aria-label="تسجيل الخروج"]').top,
        menuHeight: rect('.admin-shell-header button[aria-label="فتح القائمة"]').height,
        navBottom: nav.getBoundingClientRect().bottom,
        footerTop: footer.getBoundingClientRect().top,
        footerBottom: footer.getBoundingClientRect().bottom,
        navHeight: nav.clientHeight,
        navScrollHeight: nav.scrollHeight,
      };
    });
    assert.equal(measured.width, measured.scrollWidth);
    assert.equal(measured.headerTop, 0);
    assert(measured.headerExitTop >= 28);
    if (width < 768) assert(measured.menuHeight >= 44);
    assert(measured.navBottom <= measured.footerTop);
    assert(measured.footerBottom <= 640 - 24);
    assert(measured.navScrollHeight > measured.navHeight);
    assert.equal(
      await page.locator("aside").getByRole("link", { name: "لوحة الإدارة", exact: true }).count(),
      2,
    );
    await page.screenshot({ path: `${dir}/drawer-${width}.png`, fullPage: true });
    measurements.push(measured);
    if (width < 768) await page.getByRole("button", { name: "إغلاق القائمة" }).click();
    await page.locator("header").getByRole("button", { name: "تسجيل الخروج" }).click();
    await page.getByRole("alert").getByText("تعذر إكمال تسجيل الخروج. أعد المحاولة.").waitFor();
    assert.equal(new URL(page.url()).hash, "");
  }
  await page.goto("http://127.0.0.1:4179?content-staff");
  assert.equal(await page.getByRole("link", { name: "إدارة الأكاديمية", exact: true }).count(), 0);
  assert.equal(
    await page.getByRole("link", { name: "لوحة الإدارة", exact: true }).getAttribute("href"),
    "/admin/academic",
  );
  assert.deepEqual(errors, []);
  await writeFile(`${dir}/verification.json`, JSON.stringify({ measurements, errors }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
