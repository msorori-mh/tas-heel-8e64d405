import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { preview } from "vite";
import ExcelJS from "exceljs";
await mkdir("artifacts/content-report", { recursive: true });
const server = await preview({
  configFile: "tests/e2e/content-report/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4392, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:4392");
    await page.getByLabel("المادة", { exact: true }).selectOption("s");
    await page.getByText("فتح مساحة المعالجة", { exact: true }).waitFor();
    await page.getByText("الرفع والمتبقي لكل مكون من مكونات الدرس السبعة", { exact: true }).waitFor();
    assert.equal(await page.getByText("كتاب الكيمياء الكامل", { exact: true }).count(), 1);
    assert.equal(await page.locator("[data-component-key]").count(), 7);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير Excel", exact: true }).click();
    const download = await pending;
    const file = `artifacts/content-report/report-${width}.xlsx`;
    await download.saveAs(file);
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(file);
    assert.equal(book.worksheets.length, 5);
    assert.equal(book.getWorksheet("اكتمال المحتوى").getCell("B2").value, "الحديد");
    assert.equal(
      book.getWorksheet("كتب المادة الكاملة").getCell("A2").value,
      "كتاب الكيمياء الكامل",
    );
    assert.equal(book.getWorksheet("نواقص كتب المادة").getCell("C2").value, "موجود ومفعّل");
    assert.equal(book.getWorksheet("ملخص المكونات السبعة").getCell("A2").value, "محتوى الكتاب");
    assert.equal(book.getWorksheet("ملخص المكونات السبعة").getCell("F2").value, 1);
    assert.equal(book.getWorksheet("ملخص المكونات السبعة").getCell("G3").value, 1);
    assert.equal(book.getWorksheet("المتبقي حسب المكون").getCell("B2").value, "الحديد");
    await page.screenshot({ path: `artifacts/content-report/${width}.png`, fullPage: true });
    await page.getByText("فتح مساحة المعالجة", { exact: true }).click();
    await page.getByText("مساحة معالجة الدرس التجريبية", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS content report, links, XLSX and viewport ${width}`);
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
}
