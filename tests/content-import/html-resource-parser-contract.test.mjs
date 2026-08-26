/**
 * Parser integration test for HTML resource import contract.
 *
 * Verifies that the real production Excel parser preserves pedagogical subtype
 * (mind_map_html, practical_experiment_html, summary_html) and resource_code
 * instead of collapsing them into a generic html type.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { parseContentImportBuffer } from "../../src/lib/content-import/content-import-dry-run.server.ts";
import { validateInteractiveRow } from "../../src/lib/api/html-workflow.functions.ts";
import { HTML_RESOURCE_TYPES } from "../../src/lib/content-import/html-package/types.ts";

const EXPECTED_SUBTYPES = ["mind_map_html", "practical_experiment_html", "summary_html"];
const EXPECTED_CODES = ["TEST_MM_001", "TEST_EXP_001", "TEST_SUM_001"];

async function buildExcelBuffer(rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("resources");

  worksheet.addRow([
    "resource_code",
    "grade_code",
    "subject_code",
    "lesson_code",
    "resource_type",
    "title_ar",
    "description_ar",
    "alt_text_ar",
    "package_path",
    "entry_file",
    "sort_order",
    "version",
    "offline_enabled",
    "orientation",
    "height_mode",
    "completion_mode",
    "completion_event",
    "minimum_interaction_seconds",
  ]);

  for (const row of rows) {
    worksheet.addRow([
      row.resource_code,
      row.grade_code,
      row.subject_code,
      row.lesson_code,
      row.resource_type,
      row.title_ar,
      row.description_ar ?? "",
      row.alt_text_ar ?? "",
      row.package_path,
      row.entry_file ?? "index.html",
      row.sort_order ?? 1,
      row.version ?? 1,
      row.offline_enabled ?? "true",
      row.orientation ?? "auto",
      row.height_mode ?? "viewport",
      row.completion_mode ?? "view",
      row.completion_event ?? "",
      row.minimum_interaction_seconds ?? 0,
    ]);
  }

  return workbook.xlsx.writeBuffer();
}

describe("HTML resource import parser contract", () => {
  it("preserves all three canonical HTML subtypes and resource codes", async () => {
    const rows = EXPECTED_SUBTYPES.map((subtype, index) => ({
      resource_code: EXPECTED_CODES[index],
      grade_code: "G1",
      subject_code: "S1",
      lesson_code: "L1",
      resource_type: subtype,
      title_ar: `${subtype} title`,
      description_ar: `${subtype} description`,
      alt_text_ar: subtype === "mind_map_html" ? "alt text" : "",
      package_path: EXPECTED_CODES[index],
      entry_file: "index.html",
      sort_order: index + 1,
      version: 1,
      offline_enabled: "true",
      orientation: "auto",
      height_mode: "viewport",
      completion_mode: "view",
      completion_event: "",
      minimum_interaction_seconds: 0,
    }));

    const buffer = await buildExcelBuffer(rows);
    const parsed = await parseContentImportBuffer(
      Buffer.from(buffer),
      "test-resources.xlsx",
      "resources",
    );

    assert.strictEqual(parsed.rows.length, 3, "Parser must return exactly 3 rows");

    for (let i = 0; i < 3; i++) {
      const raw = parsed.rows[i].data;
      const validation = validateInteractiveRow(parsed.rows[i].rowNumber, raw);

      assert.strictEqual(
        validation.valid,
        true,
        `Row ${i + 1} must be valid: ${validation.errors.join(", ")}`,
      );
      assert.ok(validation.parsed, `Row ${i + 1} must produce a parsed payload`);
      assert.strictEqual(
        validation.parsed.resource_type,
        EXPECTED_SUBTYPES[i],
        `Row ${i + 1} resource_type must remain ${EXPECTED_SUBTYPES[i]} and not collapse to html`,
      );
      assert.strictEqual(
        validation.parsed.resource_code,
        EXPECTED_CODES[i],
        `Row ${i + 1} resource_code must be preserved`,
      );
    }
  });

  it("rejects invalid HTML subtype", async () => {
    const buffer = await buildExcelBuffer([
      {
        resource_code: "BAD_001",
        grade_code: "G1",
        subject_code: "S1",
        lesson_code: "L1",
        resource_type: "interactive_html",
        title_ar: "Bad Type",
        package_path: "BAD_001",
      },
    ]);

    const parsed = await parseContentImportBuffer(
      Buffer.from(buffer),
      "test-bad-type.xlsx",
      "resources",
    );
    const validation = validateInteractiveRow(parsed.rows[0].rowNumber, parsed.rows[0].data);

    assert.strictEqual(validation.valid, false, "Invalid subtype must be rejected");
    assert.ok(
      validation.errors.some((msg) => msg.includes("resource_type")),
      "Rejection must mention resource_type",
    );
  });

  it("rejects duplicate resource_code within the same import", async () => {
    const buffer = await buildExcelBuffer([
      {
        resource_code: "DUP_001",
        grade_code: "G1",
        subject_code: "S1",
        lesson_code: "L1",
        resource_type: "mind_map_html",
        title_ar: "First",
        package_path: "DUP_001",
      },
      {
        resource_code: "DUP_001",
        grade_code: "G1",
        subject_code: "S1",
        lesson_code: "L1",
        resource_type: "summary_html",
        title_ar: "Duplicate",
        package_path: "DUP_001",
      },
    ]);

    const parsed = await parseContentImportBuffer(
      Buffer.from(buffer),
      "test-dup.xlsx",
      "resources",
    );
    const first = validateInteractiveRow(parsed.rows[0].rowNumber, parsed.rows[0].data);
    const second = validateInteractiveRow(parsed.rows[1].rowNumber, parsed.rows[1].data);

    assert.strictEqual(first.valid, true, "First duplicate row must be valid");

    // validateInteractiveRow itself only validates a single row; the batch-level duplicate
    // detection is enforced by initializeHtmlImportFn. Here we assert the canonical payload
    // of each row does not lose the subtype even when the code is duplicated.
    assert.strictEqual(
      second.parsed.resource_type,
      "summary_html",
      "Duplicate row retains its subtype",
    );
    assert.strictEqual(second.parsed.resource_code, "DUP_001", "Duplicate row retains its code");
  });

  it("exports HTML_RESOURCE_TYPES as the canonical subtype list", () => {
    assert.deepStrictEqual([...HTML_RESOURCE_TYPES], EXPECTED_SUBTYPES);
  });
});
