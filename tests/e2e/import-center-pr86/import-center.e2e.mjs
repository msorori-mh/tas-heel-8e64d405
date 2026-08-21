import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";
import JSZip from "jszip";
import { chromium } from "playwright";

const baseUrl = process.env.IMPORT_CENTER_PREVIEW_URL ?? "http://127.0.0.1:4173";
const repositoryRoot = process.cwd();
const lessonDir = path.join(repositoryRoot, "content-packages/chemistry-g12-iron-v3");
const evidenceDir = path.join(repositoryRoot, "artifacts/import-center-e2e");
await mkdir(evidenceDir, { recursive: true });

const result = {
  marker: "TEST_ONLY_FINAL_LESSON_IMPORT_E2E",
  baseUrl,
  requiredFiles: 6,
  optionalActivityUploaded: true,
  questionTemplates: ["09", "10"],
  isolatedDraftStageCompleted: false,
  productionWritesPerformed: 0,
  forbiddenInputsAbsent: [],
  passed: false,
};

async function workbookBuffer(headers, row) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("الأسئلة");
  sheet.addRow(headers);
  sheet.addRow(headers.map((header) => row[header] ?? ""));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const officialHeaders = [
  "question_code", "subject_code", "lesson_code", "prompt_kind", "question_text",
  "interaction_type", "grading_mode", "option_1", "option_2", "correct_index",
  "accepted_answers", "model_answer", "explanation", "sort_order",
];
const officialXlsx = await workbookBuffer(officialHeaders, {
  question_code: "IRON-OFF-001",
  subject_code: "SUB-G12-012",
  lesson_code: "CHEM-G12-IRON-FE",
  prompt_kind: "تعليل",
  question_text: "علل: يضاف الحجر الجيري إلى شحنة الفرن العالي.",
  interaction_type: "LONG_TEXT",
  grading_mode: "MANUAL",
  model_answer: "للتخلص من الشوائب بتكوين الخبث.",
  explanation: "إجابة نموذجية TEST_ONLY.",
  sort_order: "1",
});

const selfHeaders = [
  "question_code", "subject_code", "lesson_code", "question_text", "option_1",
  "option_2", "option_3", "option_4", "correct_index", "explanation",
  "why_wrong_1", "why_wrong_2", "why_wrong_3", "why_wrong_4", "sort_order",
];
const selfXlsx = await workbookBuffer(selfHeaders, {
  question_code: "IRON-SELF-001",
  subject_code: "SUB-G12-012",
  lesson_code: "CHEM-G12-IRON-FE",
  question_text: "ما الرمز الكيميائي للحديد؟",
  option_1: "Fe",
  option_2: "Cu",
  option_3: "Al",
  option_4: "Ag",
  correct_index: "1",
  explanation: "Fe هو رمز الحديد.",
  why_wrong_2: "Cu رمز النحاس.",
  why_wrong_3: "Al رمز الألومنيوم.",
  why_wrong_4: "Ag رمز الفضة.",
  sort_order: "1",
});

const html5 = new JSZip();
html5.file("index.html", `<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><button id="run">ابدأ النشاط</button><script src="app.js"></script></body></html>`);
html5.file("app.js", `document.querySelector("#run").addEventListener("click",()=>document.body.dataset.done="yes")`);
const html5Zip = Buffer.from(await html5.generateAsync({ type: "uint8array" }));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, locale: "ar-YE" });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

const uploadPath = async (capability, fileName) => {
  const filePath = path.join(lessonDir, fileName);
  await page.locator(`#golden-artifact-${capability}`).setInputFiles(filePath);
  await page.getByText(`تم التحقق من الملف: ${fileName}`, { exact: false }).waitFor();
};

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByTestId("test-only-banner").waitFor();
  await page.getByText("لا يوجد ملف ZIP للدرس", { exact: false }).first().waitFor();

  for (const selector of ["#golden-provenance-officialBookContent", "#golden-answers-companion"]) {
    assert.equal(await page.locator(selector).count(), 0, `${selector} must not exist`);
    result.forbiddenInputsAbsent.push(selector);
  }
  assert.equal(await page.getByRole("button", { name: "تنزيل حزمة ZIP" }).count(), 0);

  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "الدرس الذهبي — الكيمياء" }).click();
  await page.getByText("5. التجربة / النشاط التفاعلي", { exact: true }).waitFor();

  await page.getByPlaceholder("CHEM-G12-IRON-FE-PKG").fill("CHEM-G12-IRON-FE-E2E-FINAL");
  await page.getByPlaceholder("GRADE-12").fill("GRADE-12");
  await page.getByPlaceholder("sanaa,aden").fill("sanaa,aden");
  await page.getByPlaceholder("SUB-G12-012").fill("SUB-G12-012");
  await page.getByPlaceholder("CHEM-G12-IRON-FE", { exact: true }).fill("CHEM-G12-IRON-FE");
  await page.getByPlaceholder("الحديد-fe").fill("iron-fe-final-import-e2e");

  await page.locator("#golden-artifact-lessonSummaryHtml").setInputFiles({
    name: "lesson-package.zip",
    mimeType: "application/zip",
    buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]),
  });
  await page.getByRole("alert").filter({ hasText: "ZIP" }).waitFor();

  await uploadPath("officialBookContent", "official-content.html");
  await uploadPath("tamkeenExplanationHtml", "explanation.html");
  await uploadPath("lessonSummaryHtml", "summary.html");
  await uploadPath("mindMapHtml", "mindmap.html");
  await page.locator("#golden-supplemental-assets").setInputFiles(
    path.join(lessonDir, "official-figure-1-1.jpg"),
  );
  await page.getByText("official-figure-1-1.jpg", { exact: false }).last().waitFor();

  await page.locator("#golden-artifact-labExperimentHtml").setInputFiles({
    name: "iron-activity.zip",
    mimeType: "application/zip",
    buffer: html5Zip,
  });
  await page.getByText("تم التحقق من الملف: iron-activity.zip (HTML5)", { exact: false }).waitFor();

  await page.locator("#golden-artifact-officialBookQuestions").setInputFiles({
    name: "09_iron_official_questions.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: officialXlsx,
  });
  await page.getByText("تم التحقق من الملف: 09_iron_official_questions.xlsx — 1 سؤال", { exact: false }).waitFor();

  await page.locator("#golden-artifact-selfTest").setInputFiles({
    name: "10_iron_self_test.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: selfXlsx,
  });
  await page.getByText("تم التحقق من الملف: 10_iron_self_test.xlsx — 1 سؤال", { exact: false }).waitFor();
  await page.getByText("تم فصل الإجابات والتعليلات آليًا", { exact: false }).waitFor();

  await page.getByText("6/6 — 100%", { exact: true }).waitFor();
  await page.getByRole("button", { name: "فحص الملفات" }).click();
  await page.getByText("الملفات مكتملة وجاهزة للاستيراد", { exact: true }).waitFor();
  const importButton = page.getByRole("button", { name: "استيراد المحتوى كمسودة" });
  assert.equal(await importButton.isEnabled(), true);
  await importButton.click();
  await page.getByText("تم استيراد ملفات الدرس وربطها بإصدار المسودة", { exact: true }).waitFor();
  await page.getByText("الحالة: DRAFT", { exact: false }).waitFor();
  await page.getByText("كتابات المحتوى: 0", { exact: false }).waitFor();
  assert.equal(await page.getByRole("alert").filter({ hasText: "TEST_ONLY" }).count(), 0);
  result.isolatedDraftStageCompleted = true;

  await page.screenshot({ path: path.join(evidenceDir, "desktop-final-import.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(evidenceDir, "mobile-final-import.png"), fullPage: true });
  assert.deepEqual(pageErrors, []);
  result.passed = true;
  await writeFile(path.join(evidenceDir, "result.json"), JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  await page.screenshot({ path: path.join(evidenceDir, "failure.png"), fullPage: true }).catch(() => {});
  await writeFile(path.join(evidenceDir, "result.json"), JSON.stringify({ ...result, error: String(error), pageErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
