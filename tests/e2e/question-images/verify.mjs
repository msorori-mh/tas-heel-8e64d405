import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { preview } from "vite";
import ExcelJS from "exceljs";
const output = "artifacts/question-images";
await mkdir(output, { recursive: true });
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("public/content-import-templates/10_self_test_questions_template.xlsx");
const sheet = wb.getWorksheet("اختبر فهمك"),
  headers = sheet
    .getRow(1)
    .values.slice(1)
    .map((h) => String(h).replace(/\*/g, "").trim());
function setRow(n, values) {
  for (const [key, value] of Object.entries(values))
    sheet.getRow(n).getCell(headers.indexOf(key) + 1).value = value;
}
setRow(2, {
  question_code: "q1",
  subject_code: "MATH",
  lesson_code: "L1",
  question_text: "احسب طول الوتر في المثلث القائم في الشكل.",
  option_1: "٥ سم",
  option_2: "٧ سم",
  option_3: "١٢ سم",
  option_4: "٤ سم",
  option_5: "",
  option_6: "",
  correct_index: 1,
  explanation: "SECRET_ANSWER_LAYER",
  why_wrong_1: "",
  why_wrong_2: "",
  why_wrong_3: "",
  why_wrong_4: "",
  why_wrong_5: "",
  why_wrong_6: "",
  question_image_alt: "مثلث قائم ضلعاه ٣ سم و٤ سم",
  review_status: "معتمد",
});
setRow(3, {
  question_code: "q2",
  subject_code: "MATH",
  lesson_code: "L1",
  question_text: "أي الأعداد التالية عدد زوجي؟",
  option_1: "٢",
  option_2: "٣",
  option_3: "٥",
  option_4: "٧",
  correct_index: 1,
  explanation: "SECRET_ANSWER_LAYER",
  review_status: "معتمد",
});
const image = wb.addImage({
  buffer: await readFile("tests/e2e/question-images/triangle.png"),
  extension: "png",
});
sheet.addImage(image, {
  tl: { col: headers.indexOf("question_image"), row: 1 },
  ext: { width: 200, height: 120 },
});
sheet.getRow(2).height = 100;
await wb.xlsx.writeFile(output + "/questions.xlsx");
const server = await preview({
  configFile: "tests/e2e/question-images/vite.config.ts",
  preview: { host: "127.0.0.1", port: 4382, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const width of [320, 390, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === "http://127.0.0.1:4382"
        ? route.continue()
        : route.abort(),
    );
    await page.goto("http://127.0.0.1:4382");
    await page.getByLabel("ملف الأسئلة").setInputFiles(output + "/questions.xlsx");
    await page
      .getByRole("button", { name: "تكبير صورة السؤال: مثلث قائم ضلعاه ٣ سم و٤ سم" })
      .waitFor();
    assert.equal(await page.locator("section").count(), 2);
    assert.equal(await page.locator("section img").count(), 1);
    assert.ok(await page.locator("section img").evaluate((i) => i.complete && i.naturalWidth > 1));
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    assert.ok(!(await page.locator("body").textContent()).includes("SECRET_ANSWER_LAYER"));
    await page.getByRole("button", { name: "٥ سم", exact: true }).click();
    await page.screenshot({ path: output + "/question-" + width + ".png", fullPage: true });
    await page
      .getByRole("button", { name: "تكبير صورة السؤال: مثلث قائم ضلعاه ٣ سم و٤ سم" })
      .click();
    await page.getByRole("dialog").waitFor();
    await page.getByLabel("زيادة تكبير الصورة", { exact: true }).click();
    assert.equal(await page.locator("output").textContent(), "150%");
    assert.ok(
      await page.getByRole("dialog").evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
    );
    await page.screenshot({ path: output + "/zoom-" + width + ".png" });
    await page.keyboard.press("Escape");
    assert.equal(
      await page.getByRole("button", { name: "٥ سم", exact: true }).getAttribute("aria-pressed"),
      "true",
    );
    assert.deepEqual(errors, []);
    results.push({ width, import: true, image: true, zoom: true, answerPreserved: true });
    await page.close();
  }
  await writeFile(output + "/results.json", JSON.stringify(results, null, 2));
  console.log(results);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
