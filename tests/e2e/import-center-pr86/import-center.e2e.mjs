import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import JSZip from "jszip";
import { chromium } from "playwright";

const baseUrl = process.env.IMPORT_CENTER_PREVIEW_URL ?? "http://127.0.0.1:4173";
const repositoryRoot = process.cwd();
const packageDir = path.join(repositoryRoot, "content-packages/chemistry-g12-iron-v3");
const evidenceDir = path.join(repositoryRoot, "artifacts/import-center-e2e");
await mkdir(evidenceDir, { recursive: true });

const result = {
  marker: "TEST_ONLY_PR86_IMPORT_CENTER_E2E",
  baseUrl,
  profile: "GOLDEN_CHEMISTRY_V1",
  uploadedCapabilities: [],
  rejectionChecks: [],
  downloadedZip: null,
  writesPerformed: 0,
  passed: false,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, locale: "ar-YE" });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

const uploadPath = async (id, filePath, capability) => {
  await page.locator(`#${id}`).setInputFiles(filePath);
  const fileName = path.basename(filePath);
  await page.getByText(`تم التحقق من الملف: ${fileName}`, { exact: false }).waitFor();
  if (capability) result.uploadedCapabilities.push(capability);
};

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByTestId("test-only-banner").waitFor();
  await page.getByText("اختر نوع الدرس أولًا", { exact: false }).first().waitFor();
  assert.equal(await page.locator("#golden-artifact-labExperimentHtml").count(), 0);

  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "الدرس الذهبي — الكيمياء" }).click();
  await page.getByText("التجربة / النشاط التفاعلي", { exact: true }).waitFor();
  assert.equal(await page.locator("#golden-artifact-labExperimentHtml").count(), 1);

  await page.getByPlaceholder("CHEM-G12-IRON-FE-PKG").fill("CHEM-G12-IRON-FE-E2E");
  await page.getByPlaceholder("GRADE-12").fill("GRADE-12");
  await page.getByPlaceholder("sanaa,aden").fill("sanaa,aden");
  await page.getByPlaceholder("SUB-G12-012").fill("SUB-G12-012");
  await page.getByPlaceholder("CHEM-G12-IRON-FE", { exact: true }).fill("CHEM-G12-IRON-FE");
  await page.getByPlaceholder("الحديد-fe").fill("iron-fe-e2e-test-only");
  await page.getByPlaceholder("1").nth(0).fill("1");
  await page.getByPlaceholder("1").nth(1).fill("1");

  await page.locator("#golden-artifact-lessonSummaryHtml").setInputFiles({
    name: "nested-package.zip",
    mimeType: "application/zip",
    buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]),
  });
  await page.getByRole("alert").filter({ hasText: "حزمة ZIP" }).waitFor();
  result.rejectionChecks.push("NESTED_ZIP_FORBIDDEN");

  const uploads = [
    ["officialBookContent", "official-content.html"],
    ["tamkeenExplanationHtml", "explanation.html"],
    ["lessonSummaryHtml", "summary.html"],
    ["mindMapHtml", "mindmap.html"],
    ["labExperimentHtml", "lab.html"],
    ["officialBookQuestions", "official-questions.json"],
    ["selfTest", "self-test.json"],
  ];
  for (const [capability, fileName] of uploads) {
    await uploadPath(
      `golden-artifact-${capability}`,
      path.join(packageDir, fileName),
      capability,
    );
  }

  await page.locator("#golden-provenance-officialBookContent").setInputFiles(
    path.join(packageDir, "official-content.provenance.json"),
  );
  await page.locator("#golden-provenance-officialBookQuestions").setInputFiles(
    path.join(packageDir, "official-questions.provenance.json"),
  );
  await page.locator("#golden-supplemental-assets").setInputFiles(
    path.join(packageDir, "official-figure-1-1.jpg"),
  );
  await page.getByText("official-figure-1-1.jpg", { exact: false }).last().waitFor();

  const currentCompanion = JSON.parse(
    await readFile(path.join(packageDir, "answer-companion.server-only.json"), "utf8"),
  );
  const officialQuestions = JSON.parse(
    await readFile(path.join(packageDir, "official-questions.json"), "utf8"),
  );
  const completeCompanion = {
    testOnly: true,
    answers: [
      ...currentCompanion.answers.map((answer) => ({ capability: "selfTest", ...answer })),
      ...officialQuestions.questions.map((question) => ({
        capability: "officialBookQuestions",
        question_id: String(question.id ?? question.question_id ?? question.question_number),
        model_answer: "TEST_ONLY — إجابة وهمية لمسار E2E وليست محتوى تعليميًا.",
      })),
    ],
  };

  await page.locator("#golden-answers-companion").setInputFiles(
    path.join(packageDir, "answer-companion.server-only.json"),
  );
  await page.getByRole("button", { name: "فحص الحزمة" }).click();
  await page.getByText("الحزمة تحتاج تصحيحًا", { exact: true }).waitFor();
  for (const id of ["7", "8", "9", "10", "11a-d"]) {
    await page.getByText(`لا توجد إجابة خادمية للسؤال ${id}`, { exact: false }).waitFor();
  }
  result.rejectionChecks.push("ANSWER_COMPANION_COVERAGE_MISSING_5_OFFICIAL");

  await page.locator("#golden-answers-companion").setInputFiles({
    name: "answers-e2e.server-only.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(completeCompanion)),
  });
  await page.getByText("تم تثبيت: answers-e2e.server-only.json", { exact: false }).waitFor();

  await page.getByRole("button", { name: "فحص الحزمة" }).click();
  await page.getByText("الحزمة مكتملة وجاهزة للمراجعة", { exact: true }).waitFor();
  await page.getByText("الكتابات المنفذة: 0", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "تنزيل Manifest" }).isEnabled(), true);
  assert.equal(await page.getByRole("button", { name: "تنزيل حزمة ZIP" }).isEnabled(), true);
  assert.equal(await page.getByRole("button", { name: "رفع الحزمة والتحقق على الخادم" }).isEnabled(), true);

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "تنزيل حزمة ZIP" }).click();
  const download = await downloadEvent;
  const zipPath = path.join(evidenceDir, "CHEM-G12-IRON-FE-E2E.zip");
  await download.saveAs(zipPath);
  const zipBytes = await readFile(zipPath);
  const zip = await JSZip.loadAsync(zipBytes);
  const names = Object.keys(zip.files).sort();
  assert.equal(names.length, 12);
  assert.ok(names.includes("manifest.json"));
  assert.ok(names.includes("lab.html"));
  assert.ok(names.includes("answers-e2e.server-only.json"));
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  assert.equal(manifest.profileId, "GOLDEN_CHEMISTRY_V1");
  assert.equal(manifest.lifecycle.initialStatus, "DRAFT");
  assert.equal(manifest.security.productionApply, false);
  assert.equal(manifest.security.publicPayloadContainsAnswers, false);
  result.downloadedZip = { fileCount: names.length, names };

  await page.screenshot({ path: path.join(evidenceDir, "desktop-valid.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(evidenceDir, "mobile-valid.png"), fullPage: true });
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
