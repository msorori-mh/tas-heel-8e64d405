import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { preview } from "vite";
const server = await preview({
  configFile: "tests/e2e/school-directory/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4381, strictPort: true },
});
const browser = await chromium.launch({ headless: true });
const output = "artifacts/school-directory";
await mkdir(output, { recursive: true });
const results = [];
try {
  for (const width of [320, 390, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === "http://127.0.0.1:4381"
        ? route.continue()
        : route.abort(),
    );
    await page.goto("http://127.0.0.1:4381");
    const choices = page.locator(".school-picker li button");
    await choices.first().waitFor();
    assert.equal(await choices.count(), 2);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `horizontal overflow ${width}`,
    );
    for (const rect of await page
      .locator(".school-picker button,.school-picker input")
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height)))
      assert.ok(rect >= 44);
    await page.screenshot({
      path: `${output}/student-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await choices.first().click();
    await page.getByRole("button", { name: "حفظ ومتابعة" }).click();
    assert.equal(JSON.parse(await page.getByLabel("نتيجة الحفظ").textContent()).school_id, "s1");
    await page.getByLabel("المحافظة", { exact: true }).selectOption("g2");
    await page.getByRole("button", { name: "لم أجد مدرستي", exact: true }).click();
    await page.getByLabel("اسم المدرسة المقترحة").fill("مدرسة الأمل ٢");
    await page.getByLabel("المديرية (اختياري)", { exact: true }).fill("المنصورة");
    await page.getByLabel("الحي أو القرية").fill("حي القاهرة");
    await page.getByRole("button", { name: "المعلم", exact: true }).click();
    await page.getByRole("button", { name: "حفظ ومتابعة" }).click();
    const proposal = JSON.parse(await page.getByLabel("نتيجة الحفظ").textContent());
    assert.equal(proposal.school_id, null);
    assert.equal(proposal.school_name, "مدرسة الأمل ٢");
    await page.getByText("جارٍ البحث عن المدارس…", { exact: true }).waitFor({ state: "hidden" });
    await page.screenshot({
      path: `${output}/teacher-proposal-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "الإدارة", exact: true }).click();
    await page.getByRole("button", { name: "مراجعة المدرسة", exact: true }).click();
    await page.getByLabel("المدرسة المعتمدة", { exact: true }).selectOption("s1");
    await page.getByLabel("تفاصيل المدرسة المختارة").waitFor();
    assert.ok(
      (await page.getByLabel("تفاصيل المدرسة المختارة").textContent()).includes("معين — السنينة"),
    );
    const approve = page.getByRole("button", { name: "اعتماد وربط الملف", exact: true });
    assert.equal(await approve.isEnabled(), false);
    await page.getByRole("checkbox").check();
    await page.screenshot({
      path: `${output}/admin-review-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await approve.click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "المدارس المعتمدة", exact: true }).click();
    await page.screenshot({ path: `${output}/directory-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "تعديل", exact: true }).first().click();
    assert.equal(await page.locator("#edit-school-governorate").isDisabled(), true);
    await page.locator("#edit-school-district").fill("ع");
    await page.getByRole("button", { name: "حفظ التعديلات", exact: true }).click();
    await page.locator("#edit-school-district-error").filter({ hasText: "حرفين" }).waitFor();
    await page.locator("#edit-school-district").fill("معين");
    await page.locator("#edit-school-locality").fill("");
    await page.locator("#edit-school-name").fill("مدرسة النور المعدلة");
    await page.screenshot({ path: `${output}/edit-school-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "حفظ التعديلات", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole(width >= 1024 ? "rowheader" : "heading", {
        name: "مدرسة النور المعدلة",
        exact: true,
      })
      .waitFor();
    await page.getByRole("button", { name: "مراجعة تكرار ودمج", exact: true }).first().click();
    await page.getByLabel("البحث في مدارس المحافظة المعتمدة").fill("النور");
    await page.getByLabel("المدرسة المعتمدة", { exact: true }).selectOption("s2");
    await page.getByText("السجل الذي سيبقى:", { exact: false }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "دمج ونقل الارتباطات", exact: true }).isEnabled(),
      false,
    );
    await page.screenshot({
      path: `${output}/admin-merge-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `admin horizontal overflow ${width}`,
    );
    // Real browser constraint validation must allow a blank optional locality.
    await page.reload();
    await page.getByRole("button", { name: "الإدارة", exact: true }).click();
    await page.getByRole("button", { name: "مراجعة المدرسة", exact: true }).click();
    await page.getByRole("radio", { name: "اعتماد مدرسة جديدة" }).check();
    await page.getByLabel("الاسم المعتمد").fill("مدرسة تجريبية");
    await page.getByLabel("المديرية", { exact: true }).fill("معين");
    await page.getByLabel("الحي أو القرية (اختياري)", { exact: true }).fill("");
    assert.equal(
      await page.locator("#school-review-locality").evaluate((el) => el.required),
      false,
    );
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "اعتماد وربط الملف", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "إضافة مدرسة", exact: true }).click();
    await page.getByLabel("المحافظة", { exact: true }).last().selectOption("g1");
    await page.getByLabel("المديرية", { exact: true }).fill("ع");
    await page.getByLabel("اسم المدرسة", { exact: true }).fill("مدرسة إدخال مباشر");
    await page.getByRole("button", { name: "حفظ المدرسة", exact: true }).click();
    await page.locator("#intake-district-error").filter({ hasText: "حرفين" }).waitFor();
    await page.getByLabel("المديرية", { exact: true }).fill("معين");
    await page.getByRole("button", { name: "حفظ المدرسة", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "استيراد من Excel", exact: true }).click();
    const templateDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "تنزيل قالب Excel" }).click();
    const template = await templateDownload;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await readFile(await template.path()));
    assert.equal(workbook.getWorksheet("المدارس").getCell("A1").value, "المحافظة");
    assert.equal(workbook.getWorksheet("المحافظات").getCell("A2").value, "صنعاء");
    const sheet = workbook.getWorksheet("المدارس");
    sheet.getRow(2).values = ["صنعاء", "معين", "مدرسة إكسل", ""];
    sheet.getRow(3).values = ["صنعاء", "معين", "مدرسة إكسل", ""];
    sheet.getRow(4).values = ["غير موجودة", "ع", "مدرسة خطأ", ""];
    // Reproduce third-party editor XML namespaces and comment part references.
    const importZip = await JSZip.loadAsync(await workbook.xlsx.writeBuffer());
    for (const entry of Object.values(importZip.files)) {
      if (entry.dir) continue;
      if (entry.name.endsWith(".xml")) {
        let xml = await entry.async("string");
        if (xml.includes('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')) {
          xml = xml
            .replace(
              'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
              'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
            )
            .replace(/<(\/?)([A-Za-z][\w-]*)(?=[\s/>])/g, "<$1x:$2");
          importZip.file(entry.name, xml);
        }
      } else if (entry.name.endsWith(".rels")) {
        importZip.file(
          entry.name,
          (await entry.async("string"))
            .replace("../comments1.xml", "/xl/comments1.xml")
            .replace("../drawings/vmlDrawing1.vml", "/xl/drawings/vmldrawing.vml"),
        );
      }
    }
    const vml = importZip.file("xl/drawings/vmlDrawing1.vml");
    if (vml) {
      importZip.file("xl/drawings/vmldrawing.vml", await vml.async("uint8array"));
      importZip.remove(vml.name);
    }
    await page.getByLabel("ملف المدارس").setInputFiles({
      name: "schools.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: await importZip.generateAsync({ type: "nodebuffer" }),
    });
    await page.getByText("مدارس جديدة: 1", { exact: false }).waitFor();
    const commit = page.getByRole("button", { name: "تأكيد استيراد المدارس" });
    assert.equal(await commit.isEnabled(), false);
    await page.getByRole("checkbox").check();
    assert.equal(
      await page.getByRole("dialog").evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      }),
      true,
      `intake dialog bounds ${width}`,
    );
    assert.equal(
      await page.getByRole("dialog").evaluate((el) => el.scrollWidth <= el.clientWidth),
      true,
      `intake dialog content width ${width}`,
    );
    await page.screenshot({
      path: `${output}/intake-preview-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await commit.click();
    await page.getByText("أُضيفت: 1", { exact: false }).waitFor();
    const resultDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "تنزيل نتيجة الفحص" }).click();
    const report = await resultDownload;
    const resultBook = new ExcelJS.Workbook();
    await resultBook.xlsx.load(await readFile(await report.path()));
    assert.equal(resultBook.worksheets[0].getCell("F2").value, "أُضيفت");
    assert.equal(resultBook.worksheets[0].getCell("F3").value, "مكررة داخل الملف");
    assert.equal(resultBook.worksheets[0].getCell("F4").value, "تحتاج تصحيحًا");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      checks:
        "search/selection/proposal/governorate reset/admin approval/merge preview/touch targets/overflow",
      errors,
    });
    await page.goto("http://127.0.0.1:4381/?large=1");
    await page.getByRole("button", { name: "الإدارة", exact: true }).click();
    await page.getByRole("button", { name: "المدارس المعتمدة", exact: true }).click();
    await page.getByText("3000 مدرسة معتمدة", { exact: false }).waitFor();
    await page.screenshot({ path: `${output}/directory-large-${width}.png`, fullPage: true });
    assert.equal(await page.getByRole("button", { name: "تعديل", exact: true }).count(), 25);
    await page.getByLabel("انتقل إلى صفحة", { exact: true }).selectOption({ value: "119" });
    await page
      .getByRole(width >= 1024 ? "rowheader" : "heading", { name: "مدرسة 3000", exact: true })
      .waitFor();
    await page.getByLabel("البحث باسم المدرسة", { exact: true }).fill("مدرسة 1500");
    await page.getByText("1 مدرسة معتمدة", { exact: false }).waitFor();
    assert.equal(await page.getByLabel("انتقل إلى صفحة", { exact: true }).inputValue(), "0");
    await page.getByLabel("المحافظة", { exact: true }).selectOption("g2");
    await page.getByText("لا توجد نتائج في هذه الصفحة.").waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.close();
  }
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ status: "PASS", live_auth_tested: false, results }, null, 2),
  );
  console.log(
    JSON.stringify({ status: "PASS", viewports: results.length, screenshots: results.length * 4 }),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
