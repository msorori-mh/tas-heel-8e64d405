import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { parseContentImportBuffer } from "@/lib/content-import/content-import-dry-run.server";
import {
  CONTENT_IMPORT_TEMPLATES,
  getContentImportDryRunConfig,
} from "@/lib/content-import/content-import-templates";

const TEMPLATE_DIR = join(process.cwd(), "public", "content-import-templates");

describe("content import workbook data-sheet selection", () => {
  it.each(CONTENT_IMPORT_TEMPLATES)(
    "parses the exact data sheet of $filename instead of instructions/code-reference sheets",
    async (meta) => {
      const buffer = await readFile(join(TEMPLATE_DIR, meta.filename));
      const parsed = await parseContentImportBuffer(buffer, meta.filename, meta.key);
      const config = getContentImportDryRunConfig(meta.key);

      expect(parsed.rows.length).toBeGreaterThan(0);
      expect(parsed.detectedColumns).toEqual(expect.arrayContaining([...config.requiredColumns]));
      expect(parsed.detectedColumns).toEqual(expect.arrayContaining([...config.knownColumns]));
    },
  );

  it("fails closed when the exact Arabic data-sheet name was changed", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("تعليمات");
    const reference = workbook.addWorksheet("مرجع الأكواد");
    reference.addRow(["الصفوف المعتمدة", "grade-12"]);
    const renamed = workbook.addWorksheet("Units");
    renamed.addRow([
      "unit_code *",
      "subject_code *",
      "title *",
      "description",
      "semester",
      "is_free",
      "sort_order",
      "review_status",
    ]);
    renamed.addRow(["unit-1", "sub-1", "وحدة", "", 1, "نعم", 1, "معتمد"]);

    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(parseContentImportBuffer(bytes, "renamed.xlsx", "units")).rejects.toThrow(
      /ورقة البيانات المطلوبة «الوحدات» غير موجودة/,
    );
  });

  it("rejects duplicate normalized headers before staging", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("الوحدات");
    sheet.addRow([
      "unit_code *",
      "subject_code *",
      "title *",
      "title",
      "semester",
      "is_free",
      "sort_order",
      "review_status",
    ]);
    sheet.addRow(["unit-1", "sub-1", "وحدة", "مكرر", 1, "نعم", 1, "معتمد"]);

    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(parseContentImportBuffer(bytes, "duplicate.xlsx", "units")).rejects.toThrow(
      /العمود «title» مكرر/,
    );
  });

  it("returns an actionable Arabic error for unreadable XLSX bytes", async () => {
    await expect(
      parseContentImportBuffer(Buffer.from("not-an-xlsx"), "broken.xlsx", "lessons"),
    ).rejects.toThrow(/تعذر قراءة ملف XLSX/);
  });
});
