import { describe, it, expect } from "vitest";
import { Workbook } from "exceljs";
import { readSchoolWorkbook, schoolHeaders } from "../../src/lib/schools/intake-xlsx";
async function workbook(rows: unknown[][], headers = schoolHeaders) {
  const book = new Workbook();
  const s = book.addWorksheet("المدارس");
  s.addRow(headers);
  rows.forEach((r) => s.addRow(r));
  return await book.xlsx.writeBuffer();
}
describe("school intake workbook", () => {
  it("keeps original Excel row numbers, optional locality and Arabic names", async () => {
    const result = await readSchoolWorkbook(
      await workbook([
        ["مأرب", "المدينة", "التميز بنين", ""],
        [],
        ["تعز", "المظفر", "الميثاق", "حي أول"],
      ]),
    );
    expect(result.map((r) => r.source_row)).toEqual([2, 4]);
    expect(result[0]).toMatchObject({ governorate: "مأرب", name: "التميز بنين", locality: "" });
  });
  it("rejects formula cached text, unsupported cells and extra columns", async () => {
    await expect(
      readSchoolWorkbook(
        await workbook([["مأرب", "المدينة", { formula: '"مدرسة"', result: "مدرسة" }, ""]]),
      ),
    ).rejects.toThrow("دون صيغ");
    await expect(
      readSchoolWorkbook(await workbook([["مأرب", "المدينة", 123, ""]])),
    ).rejects.toThrow("نصًا");
    await expect(
      readSchoolWorkbook(await workbook([["مأرب", "المدينة", "المدرسة", "", "بيانات"]])),
    ).rejects.toThrow("خارج");
  });
  it("requires template headers and nonempty data", async () => {
    await expect(readSchoolWorkbook(await workbook([], ["خطأ"]))).rejects.toThrow("عناوين");
    await expect(readSchoolWorkbook(await workbook([]))).rejects.toThrow("لا يحتوي");
  });
  it("enforces row and file limits", async () => {
    await expect(
      readSchoolWorkbook(
        await workbook(Array.from({ length: 501 }, () => ["مأرب", "المدينة", "المدرسة", ""])),
      ),
    ).rejects.toThrow("٥٠٠");
    await expect(readSchoolWorkbook(new ArrayBuffer(5 * 1024 * 1024 + 1))).rejects.toThrow(
      "٥ ميجابايت",
    );
  });
  it("rejects corrupted Excel files", async () => {
    await expect(readSchoolWorkbook(new ArrayBuffer(5))).rejects.toThrow("تعذّر فتح");
  });
});
