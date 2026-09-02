import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import {
  ADEN_QUESTION_HEADERS,
  MINISTERIAL_INDEX_HEADERS,
  MINISTERIAL_INDEX_SHEET,
  SANAA_QUESTION_HEADERS,
  buildMinisterialPackageTemplate,
  parseMinisterialPackageWorkbook,
} from "../../src/lib/ministerial/ministerial-package-xlsx.ts";

function xlsxFile(bytes: Uint8Array, name = "ministerial.xlsx") {
  return new File([bytes], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function buildMufadalaReferenceWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const index = workbook.addWorksheet(MINISTERIAL_INDEX_SHEET);
  index.addRow(["فهرس نماذج المفاضلة"]);
  index.addRow([]);
  index.addRow(["اسم النموذج", "السنة", "الجامعة", "عدد الأسئلة", "منشور", "مدفوع", "اسم الورقة"]);
  index.addRow(["نموذج أول", 2025, "جامعة أ", 1, "لا", "لا", "نموذج_1"]);
  index.addRow(["نموذج ثان", 2025, "جامعة ب", 1, "لا", "لا", "نموذج_2"]);
  for (const sheetName of ["نموذج_1", "نموذج_2"]) {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow([sheetName]);
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow([...SANAA_QUESTION_HEADERS]);
    sheet.addRow(["2 + 2 = ؟", "3", "4", "5", "6", "ب", "الإجابة الصحيحة هي 4.", 1]);
  }
  return workbook;
}

test("Sanaa parser accepts the attached Mufadala sheet shape and creates two independent MCQ models", async () => {
  const workbook = buildMufadalaReferenceWorkbook();
  const index = workbook.getWorksheet(MINISTERIAL_INDEX_SHEET)!;
  index.getCell("C3").value = "المادة";
  index.getCell("C4").value = "الكيمياء";
  index.getCell("C5").value = "الكيمياء";
  index.getCell("F3").value = "اسم الورقة";
  index.getCell("F4").value = "نموذج_1";
  index.getCell("F5").value = "نموذج_2";
  index.getCell("G3").value = null;
  index.getCell("G4").value = null;
  index.getCell("G5").value = null;
  const parsed = await parseMinisterialPackageWorkbook(
    xlsxFile(new Uint8Array(await workbook.xlsx.writeBuffer()), "sanaa.xlsx"),
    { trackCode: "sanaa", subjectCode: "sub-g12-013", subjectName: "الكيمياء" },
  );

  assert.equal(parsed.track_code, "sanaa");
  assert.equal(parsed.models.length, 2);
  assert.deepEqual(
    parsed.models.map((model) => model.variant_code),
    ["m01", "m02"],
  );
  assert.equal(parsed.models[0]!.questions[0]!.options.length, 4);
  assert.equal(parsed.models[0]!.questions[0]!.correct_option_code, "B");
  assert.equal(parsed.models[0]!.questions[0]!.model_answer, "4");
  assert.match(parsed.source_sha256, /^[a-f0-9]{64}$/);
});

test("Aden template and parser use text answer + model answer with no options", async () => {
  const bytes = await buildMinisterialPackageTemplate({
    trackCode: "aden",
    subjectCode: "sub-g12-013",
    subjectName: "الكيمياء",
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const index = workbook.getWorksheet(MINISTERIAL_INDEX_SHEET)!;
  assert.deepEqual(index.getRow(3).values.slice(1, MINISTERIAL_INDEX_HEADERS.length + 1), [
    ...MINISTERIAL_INDEX_HEADERS,
  ]);
  assert.equal(index.getRow(1).height, 28);
  assert.equal(index.getCell("A1").alignment.horizontal, "center");
  assert.equal(index.views[0]?.rightToLeft, true);
  const questions = workbook.getWorksheet("نموذج_1")!;
  assert.deepEqual(questions.getRow(4).values.slice(1, 5), [...ADEN_QUESTION_HEADERS]);

  const parsed = await parseMinisterialPackageWorkbook(xlsxFile(bytes, "aden.xlsx"), {
    trackCode: "aden",
    subjectCode: "sub-g12-013",
    subjectName: "الكيمياء",
  });
  assert.equal(parsed.models.length, 1);
  assert.equal(parsed.models[0]!.variant_code, "main");
  assert.equal(parsed.models[0]!.questions[0]!.options.length, 0);
  assert.equal(parsed.models[0]!.questions[0]!.correct_option_code, null);
  assert.equal(parsed.models[0]!.questions[0]!.model_answer, "اكتب الإجابة النموذجية هنا");
});

test("Sanaa and Aden contracts fail closed when the wrong track template is selected", async () => {
  const sanaa = await buildMinisterialPackageTemplate({
    trackCode: "sanaa",
    subjectCode: "sub-g12-013",
    subjectName: "الكيمياء",
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(sanaa);
  assert.deepEqual(workbook.getWorksheet("نموذج_1")!.getRow(4).values.slice(1, 9), [
    ...SANAA_QUESTION_HEADERS,
  ]);

  await assert.rejects(
    parseMinisterialPackageWorkbook(xlsxFile(sanaa, "wrong-track.xlsx"), {
      trackCode: "aden",
      subjectCode: "sub-g12-013",
      subjectName: "الكيمياء",
    }),
    /لا تطابق قالب عدن/,
  );
});

test("parser blocks auto-publish and index/question count drift", async () => {
  const bytes = await buildMinisterialPackageTemplate({
    trackCode: "aden",
    subjectCode: "sub-g12-013",
    subjectName: "الكيمياء",
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  workbook.getWorksheet(MINISTERIAL_INDEX_SHEET)!.getCell("E4").value = "نعم";
  await assert.rejects(
    parseMinisterialPackageWorkbook(
      xlsxFile(new Uint8Array(await workbook.xlsx.writeBuffer()), "published.xlsx"),
      { trackCode: "aden", subjectCode: "sub-g12-013", subjectName: "الكيمياء" },
    ),
    /ينشئ مسودة فقط/,
  );

  workbook.getWorksheet(MINISTERIAL_INDEX_SHEET)!.getCell("E4").value = "لا";
  workbook.getWorksheet(MINISTERIAL_INDEX_SHEET)!.getCell("D4").value = 3;
  await assert.rejects(
    parseMinisterialPackageWorkbook(
      xlsxFile(new Uint8Array(await workbook.xlsx.writeBuffer()), "count-drift.xlsx"),
      { trackCode: "aden", subjectCode: "sub-g12-013", subjectName: "الكيمياء" },
    ),
    /لا يطابق الفهرس/,
  );
});
