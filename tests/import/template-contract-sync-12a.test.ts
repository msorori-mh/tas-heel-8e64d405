/**
 * CONTENT_IMPORT_TEMPLATE_CONTRACT_SYNC_12A guard tests.
 *
 * Ensures the operator-facing Excel workbooks, the dry-run validator config and
 * the central import contract can never drift apart again.
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import {
  IMPORT_ENTITY_CONTRACTS,
  IMPORT_EXECUTION_ORDER,
  listOpenGaps,
  requiredTemplateColumnsForEntity,
  templateColumnsForEntity,
} from "@/lib/import/import-contract";
import {
  CONTENT_IMPORT_TEMPLATES,
  CONTENT_IMPORT_TEMPLATES_DISPLAY_ORDER,
  CONTENT_IMPORT_WORKFLOW_ORDER,
  getContentImportDryRunConfig,
  getContentImportTemplateByKey,
} from "@/lib/content-import/content-import-templates";
import { CONTENT_IMPORT_TEMPLATE_KEYS } from "@/lib/content-import/content-import-template-keys";

const TEMPLATE_DIR = join(process.cwd(), "public", "content-import-templates");

async function headersOf(filename: string): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await readFile(join(TEMPLATE_DIR, filename)));
  // Sheet 1 is the Arabic instructions sheet; the data sheet is the last one.
  const ws = wb.worksheets[wb.worksheets.length - 1]!;
  const row = ws.getRow(1);
  const headers: string[] = [];
  row.eachCell((cell) => {
    headers.push(String(cell.value ?? "").replace(/\s*\*$/, "").trim());
  });
  return headers.filter(Boolean);
}

describe("12A — template ↔ contract sync", () => {
  it("has no open contract gaps", () => {
    expect(listOpenGaps()).toEqual([]);
  });

  it("execution order covers every template exactly once", () => {
    expect([...IMPORT_EXECUTION_ORDER].sort()).toEqual([...CONTENT_IMPORT_TEMPLATE_KEYS].sort());
  });

  it("both separated question templates execute before assessment_questions (08)", () => {
    expect(IMPORT_EXECUTION_ORDER.indexOf("questions")).toBeLessThan(
      IMPORT_EXECUTION_ORDER.indexOf("assessment_questions"),
    );
    expect(IMPORT_EXECUTION_ORDER.indexOf("self_test_questions")).toBeLessThan(
      IMPORT_EXECUTION_ORDER.indexOf("assessment_questions"),
    );
  });

  it("keeps official-book questions and self-test in separate workbooks", () => {
    expect(getContentImportTemplateByKey("questions").filename).toBe(
      "09_official_book_questions_template.xlsx",
    );
    expect(getContentImportTemplateByKey("self_test_questions").filename).toBe(
      "10_self_test_questions_template.xlsx",
    );
    expect(requiredTemplateColumnsForEntity("questions")).toContain("model_answer");
    expect(requiredTemplateColumnsForEntity("self_test_questions")).toEqual(
      expect.arrayContaining(["option_1", "option_2", "correct_index", "explanation"]),
    );
  });

  it("UI display order equals the execution order", () => {
    expect(CONTENT_IMPORT_TEMPLATES_DISPLAY_ORDER.map((t) => t.key)).toEqual([
      ...IMPORT_EXECUTION_ORDER,
    ]);
    expect(CONTENT_IMPORT_WORKFLOW_ORDER).toBe(
      IMPORT_EXECUTION_ORDER.map((k) =>
        String(getContentImportTemplateByKey(k).order).padStart(2, "0"),
      ).join(" → "),
    );
  });

  it.each(CONTENT_IMPORT_TEMPLATE_KEYS)("dry-run config of %s mirrors the contract", (key) => {
    const config = getContentImportDryRunConfig(key);
    expect(config.knownColumns).toEqual(templateColumnsForEntity(key));
    expect(config.requiredColumns).toEqual(requiredTemplateColumnsForEntity(key));

    const naturalKey = IMPORT_ENTITY_CONTRACTS[key].naturalKey;
    const dryRunKey = config.compositeDuplicateKeys ?? [config.duplicateKeyColumn];
    expect(dryRunKey).toEqual([...naturalKey]);

    // Every identity column must also be a required column of the workbook.
    for (const column of naturalKey) {
      expect(config.requiredColumns).toContain(column);
    }
  });

  it.each(CONTENT_IMPORT_TEMPLATE_KEYS)(
    "workbook of %s exposes exactly the contract columns",
    async (key) => {
      const meta = getContentImportTemplateByKey(key);
      const headers = await headersOf(meta.filename);
      expect([...headers].sort()).toEqual([...templateColumnsForEntity(key)].sort());
      for (const required of requiredTemplateColumnsForEntity(key)) {
        expect(headers).toContain(required);
      }
    },
  );

  it("every template metadata entry is reachable", () => {
    expect(CONTENT_IMPORT_TEMPLATES).toHaveLength(CONTENT_IMPORT_TEMPLATE_KEYS.length);
  });
});
