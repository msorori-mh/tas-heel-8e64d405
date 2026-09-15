import type { CellValue } from "exceljs";
import type { SchoolIntakeRow, SchoolIntakeResult } from "./intake";
import { intakeStatusLabels } from "./intake";
export const schoolHeaders = ["المحافظة", "المديرية", "اسم المدرسة", "الحي أو القرية"];
const MAX_ROWS = 500;
const MAX_FILE = 5 * 1024 * 1024;
const MAX_EXPANDED = 20 * 1024 * 1024;

function cellText(value: CellValue, row: number): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  // Never evaluate formulas or accept cached formula values/hyperlinks as school data.
  throw new Error(`الصف ${row}: استخدم نصًا عاديًا في جميع الخلايا، دون صيغ أو روابط.`);
}
export async function readSchoolWorkbook(bytes: ArrayBuffer): Promise<SchoolIntakeRow[]> {
  if (bytes.byteLength > MAX_FILE) throw new Error("الحد الأقصى لحجم الملف ٥ ميجابايت.");
  const { default: JSZip } = await import("jszip");
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error("تعذّر فتح الملف. اختر ملف Excel بصيغة xlsx.");
  }
  const entries = Object.values(zip.files);
  let expanded = 0;
  if (entries.length > 200) throw new Error("الملف معقد جدًا. انقل البيانات إلى القالب الجاهز.");
  for (const entry of entries) {
    if (entry.dir) continue;
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data
      ?.uncompressedSize;
    if (typeof size !== "number" || size < 0) throw new Error("تعذّر التحقق من حجم الملف.");
    expanded += size;
    if (expanded > MAX_EXPANDED)
      throw new Error("محتوى الملف أكبر من الحد المسموح. قسّم المدارس إلى ملفات أصغر.");
  }
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  try {
    await book.xlsx.load(bytes);
  } catch {
    throw new Error("ملف Excel غير صالح. استخدم القالب الجاهز.");
  }
  const sheet = book.getWorksheet("المدارس") ?? book.worksheets[0];
  if (!sheet) throw new Error("الملف لا يحتوي على ورقة مدارس.");
  if (sheet.rowCount > 5001) throw new Error("احذف الصفوف الفارغة الزائدة واستخدم القالب الجاهز.");
  const headers = Array.from({ length: 4 }, (_, i) => cellText(sheet.getCell(1, i + 1).value, 1));
  if (!headers.every((h, i) => h === schoolHeaders[i]))
    throw new Error(
      "عناوين الأعمدة لا تطابق القالب: المحافظة، المديرية، اسم المدرسة، الحي أو القرية.",
    );
  const rows: SchoolIntakeRow[] = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    row.eachCell((cell, column) => {
      if (column > 4 && cell.value != null && cell.value !== "") {
        throw new Error(`الصف ${i}: توجد بيانات خارج أعمدة القالب الأربعة.`);
      }
    });
    const [governorate, district, name, locality] = [1, 2, 3, 4].map((c) =>
      cellText(row.getCell(c).value, i),
    );
    if (![governorate, district, name, locality].some(Boolean)) continue;
    rows.push({ source_row: i, governorate, district, name, locality });
    if (rows.length > MAX_ROWS) throw new Error("الحد الأقصى ٥٠٠ مدرسة في الملف الواحد.");
  }
  if (!rows.length) throw new Error("أضف المدارس إلى القالب أولًا؛ الملف لا يحتوي على بيانات.");
  return rows;
}
async function download(book: import("exceljs").Workbook, filename: string) {
  const bytes = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadSchoolTemplate(governorates: { id: string; name: string }[]) {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  const sheet = book.addWorksheet("المدارس", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  sheet.addRow(schoolHeaders);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((c) => (c.width = 28));
  sheet.getCell("D1").note = "اختياري؛ يمكن ترك جميع خلايا هذا العمود فارغة.";
  const gov = book.addWorksheet("المحافظات", { views: [{ rightToLeft: true }] });
  gov.addRow(["المحافظات المتاحة — استخدم الاسم كما هو"]);
  governorates.forEach((g) => gov.addRow([g.name]));
  gov.getColumn(1).width = 45;
  if (governorates.length)
    for (let r = 2; r <= MAX_ROWS + 1; r++)
      sheet.getCell(r, 1).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`'المحافظات'!$A$2:$A$${governorates.length + 1}`],
        showErrorMessage: true,
        error: "اختر محافظة من القائمة.",
      };
  await download(book, "school-import-template.xlsx");
}
export async function downloadSchoolResults(
  rows: SchoolIntakeRow[],
  results: SchoolIntakeResult[],
) {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  const sheet = book.addWorksheet("نتيجة الاستيراد", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  sheet.addRow(["الصف", ...schoolHeaders, "الحالة", "السبب"]);
  rows.forEach((r, i) =>
    sheet.addRow([
      results[i].source_row,
      r.governorate ?? "",
      r.district,
      r.name,
      r.locality,
      intakeStatusLabels[results[i].status],
      Object.values(results[i].errors).join("؛ "),
    ]),
  );
  sheet.columns.forEach((c) => (c.width = 28));
  await download(book, "school-import-results.xlsx");
}
