import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ExcelJS from "exceljs";
import JSZip from "jszip";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, "fixtures");

/**
 * Both fixtures are real workbooks the content team authored and could not upload. They
 * declare the SpreadsheetML namespace on a prefix (<x:workbook>, <x:sheet>) rather than as
 * the default namespace. That is valid OOXML -- Excel opens them -- but ExcelJS matches
 * only unprefixed element names, so it produced a workbook with no sheets and threw
 * "Cannot read properties of undefined (reading 'sheets')". The operator was told a
 * perfectly good Excel file could not be read.
 *
 * Keep the files byte-for-byte: they are the evidence, and regenerating them with a
 * different writer would silently remove the very thing under test.
 */
const FIXTURE_FILES = [
  ["prefixed-namespace-book-questions.xlsx", "أسئلة الكتاب الأصلية"],
  ["prefixed-namespace-self-test.xlsx", "اختبر فهمك"],
];

const SPREADSHEETML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

/** Mirrors normalizeSpreadsheetNamespaces in src/lib/content-factory/golden-lesson-xlsx.ts. */
async function normalize(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return bytes;
  const zip = await JSZip.loadAsync(bytes);
  const workbookPart = zip.file("xl/workbook.xml");
  if (!workbookPart) return bytes;
  const workbookXml = await workbookPart.async("string");
  const prefixMatch = /<([A-Za-z_][\w.-]*):workbook[\s>]/.exec(workbookXml);
  if (!prefixMatch) return bytes;
  const prefix = prefixMatch[1];
  const openTag = new RegExp(`<${prefix}:`, "g");
  const closeTag = new RegExp(`</${prefix}:`, "g");
  const declaration = new RegExp(`xmlns:${prefix}\\s*=\\s*"${SPREADSHEETML_NS}"`, "g");
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir || !/\.(xml|rels)$/i.test(name)) continue;
    const original = await zip.file(name).async("string");
    if (!original.includes(`<${prefix}:`)) continue;
    zip.file(
      name,
      original
        .replace(declaration, `xmlns="${SPREADSHEETML_NS}"`)
        .replace(openTag, "<")
        .replace(closeTag, "</"),
    );
  }
  return await zip.generateAsync({ type: "uint8array" });
}

test("the fixtures really do use a prefixed namespace", async () => {
  for (const [name] of FIXTURE_FILES) {
    const zip = await JSZip.loadAsync(readFileSync(resolve(FIXTURES, name)));
    const workbookXml = await zip.file("xl/workbook.xml").async("string");
    assert.match(
      workbookXml,
      /<[A-Za-z_][\w.-]*:workbook[\s>]/,
      `${name} no longer reproduces the bug it exists to pin`,
    );
  }
});

test("ExcelJS cannot read them as they stand", async () => {
  for (const [name] of FIXTURE_FILES) {
    const workbook = new ExcelJS.Workbook();
    await assert.rejects(
      () => workbook.xlsx.load(new Uint8Array(readFileSync(resolve(FIXTURES, name)))),
      `${name} parsed unaided — the normaliser may no longer be needed`,
    );
  }
});

test("after normalising, every sheet and row is readable", async () => {
  for (const [name, dataSheet] of FIXTURE_FILES) {
    const normalized = await normalize(new Uint8Array(readFileSync(resolve(FIXTURES, name))));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(normalized);

    const names = workbook.worksheets.map((sheet) => sheet.name.trim());
    assert.ok(names.includes("تعليمات"), `${name}: instructions sheet missing`);
    assert.ok(names.includes(dataSheet), `${name}: data sheet "${dataSheet}" missing`);

    const sheet = workbook.worksheets.find((candidate) => candidate.name.trim() === dataSheet);
    assert.ok(sheet.rowCount > 1, `${name}: no data rows survived normalising`);

    const headers = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
      headers.push(
        String(cell.value ?? "")
          .replace(/\*/g, "")
          .trim(),
      );
    });
    for (const column of ["question_code", "subject_code", "lesson_code", "question_text"]) {
      assert.ok(headers.includes(column), `${name}: header ${column} missing after normalising`);
    }
    // Arabic content must survive the rewrite intact, not arrive mojibake.
    assert.match(String(sheet.getRow(2).getCell(3).value ?? ""), /^lesson-/);
  }
});

/** A workbook that already parses must be handed to ExcelJS untouched. */
test("an unprefixed workbook is passed through unchanged", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("اختبر فهمك");
  sheet.addRow(["question_code", "question_text"]);
  sheet.addRow(["st-1", "سؤال"]);
  const original = new Uint8Array(await workbook.xlsx.writeBuffer());

  const result = await normalize(original);
  assert.equal(result, original, "an already-readable workbook must not be rewritten");
});
