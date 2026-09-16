// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { Workbook } from "exceljs";
import JSZip from "jszip";
import { describe, it, expect } from "vitest";
import { readSchoolWorkbook, schoolHeaders } from "../../src/lib/schools/intake-xlsx";

// Synthetic reproduction: qualified SpreadsheetML plus absolute comment/VML
// relationships and a VML filename ExcelJS does not recognize. No user data.
export async function prefixedWorkbook(value: unknown = "مدرسة تجريبية & <النور>") {
  const book = new Workbook();
  const sheet = book.addWorksheet("المدارس");
  sheet.addRow(schoolHeaders);
  sheet.addRow(["مأرب", "مدينة مأرب", value, ""]);
  sheet.getCell("D1").note = "اختياري";
  const zip = await JSZip.loadAsync(await book.xlsx.writeBuffer());
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    if (entry.name.endsWith(".xml")) {
      let text = await entry.async("string");
      if (text.includes('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')) {
        text = text
          .replace(
            'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
            'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
          )
          .replace(/<(\/?)([A-Za-z][\w-]*)(?=[\s/>])/g, "<$1x:$2");
        zip.file(entry.name, text);
      }
    } else if (entry.name.endsWith(".rels")) {
      zip.file(
        entry.name,
        (await entry.async("string"))
          .replace("../comments1.xml", "/xl/comments1.xml")
          .replace("../drawings/vmlDrawing1.vml", "/xl/drawings/vmldrawing.vml"),
      );
    }
  }
  const vml = zip.file("xl/drawings/vmlDrawing1.vml");
  if (vml) {
    zip.file("xl/drawings/vmldrawing.vml", await vml.async("uint8array"));
    zip.remove(vml.name);
  }
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("school workbook compatibility", () => {
  it("reads all 53 rows from the sanitized editor workbook", async () => {
    const bytes = Buffer.from(
      readFileSync("tests/e2e/school-directory/editor-workbook.base64", "utf8"),
      "base64",
    );
    const rows = await readSchoolWorkbook(new Uint8Array(bytes).buffer);
    expect(rows).toHaveLength(53);
    for (const row of rows) {
      expect(row.governorate).toBe("صنعاء");
      expect(row.district).toBe("معين");
      expect(row.name).toBe(`مدرسة تجريبية ${row.source_row}`);
      expect(["", "حي تجريبي"]).toContain(row.locality);
    }
  });
  it("reads qualified SpreadsheetML and comment metadata without altering text", async () => {
    const bytes = await prefixedWorkbook();
    await expect(new Workbook().xlsx.load(bytes)).rejects.toThrow();
    expect(await readSchoolWorkbook(bytes)).toEqual([
      {
        source_row: 2,
        governorate: "مأرب",
        district: "مدينة مأرب",
        name: "مدرسة تجريبية & <النور>",
        locality: "",
      },
    ]);
  });
  it("still rejects formulas, hyperlinks and numeric values after compatibility conversion", async () => {
    for (const value of [
      { formula: '"اسم"', result: "اسم" },
      { text: "اسم", hyperlink: "https://example.com" },
      123,
    ]) {
      await expect(readSchoolWorkbook(await prefixedWorkbook(value))).rejects.toThrow(
        "دون صيغ أو روابط",
      );
    }
  });
});
