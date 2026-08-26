/**
 * 18D — pure matching engine for bulk lesson PDF upload.
 *
 * Files are matched to lessons by `lesson_code` (preferred filename:
 * `<lesson_code>.pdf`). No DB, no React, no storage access here.
 */

export type BulkMatchStatus =
  | "MATCHED"
  | "REPLACE_EXISTING"
  | "MISSING_FILE"
  | "UNKNOWN_FILE"
  | "DUPLICATE_FILE"
  | "INVALID_PDF";

export type BulkLessonInput = {
  lessonId: string;
  lessonCode: string | null;
  lessonTitle: string;
  hasPrimaryPdf: boolean;
};

export type BulkFileInput = {
  name: string;
  size: number;
  type?: string | null;
};

export type BulkMatchRow = {
  lessonId: string | null;
  lessonCode: string | null;
  lessonTitle: string | null;
  fileName: string | null;
  fileSize: number | null;
  status: BulkMatchStatus;
  existingPrimary: boolean;
  action: string;
};

export const BLOCKING_STATUSES: BulkMatchStatus[] = [
  "UNKNOWN_FILE",
  "DUPLICATE_FILE",
  "INVALID_PDF",
];

export function normalizeLessonCode(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

/** `TAM-QUR-1-01.pdf` -> `TAM-QUR-1-01` */
export function fileNameToLessonCode(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  return normalizeLessonCode(base);
}

export function isValidPdfFile(file: BulkFileInput): boolean {
  if (!file.name || !/\.pdf$/i.test(file.name)) return false;
  if (!Number.isFinite(file.size) || file.size <= 0) return false;
  if (file.type && file.type !== "application/pdf") return false;
  return true;
}

function actionFor(status: BulkMatchStatus): string {
  switch (status) {
    case "MATCHED":
      return "رفع وربط كمحتوى أساسي";
    case "REPLACE_EXISTING":
      return "استبدال الملف الأساسي الحالي";
    case "MISSING_FILE":
      return "لا يوجد ملف — الدرس يبقى غير جاهز";
    case "UNKNOWN_FILE":
      return "لا يطابق أي lesson_code — أزل الملف";
    case "DUPLICATE_FILE":
      return "أكثر من ملف لنفس الدرس — أبقِ ملفاً واحداً";
    case "INVALID_PDF":
      return "ملف غير صالح (PDF فقط، حجم أكبر من صفر)";
  }
}

export function buildBulkMatchMatrix(
  lessons: BulkLessonInput[],
  files: BulkFileInput[],
): BulkMatchRow[] {
  const byCode = new Map<string, BulkLessonInput>();
  for (const l of lessons) {
    if (l.lessonCode) byCode.set(normalizeLessonCode(l.lessonCode), l);
  }

  const codeHits = new Map<string, number>();
  for (const f of files) {
    if (!isValidPdfFile(f)) continue;
    const code = fileNameToLessonCode(f.name);
    if (byCode.has(code)) codeHits.set(code, (codeHits.get(code) ?? 0) + 1);
  }

  const rows: BulkMatchRow[] = [];
  const consumed = new Set<string>();

  for (const f of files) {
    if (!isValidPdfFile(f)) {
      rows.push({
        lessonId: null,
        lessonCode: null,
        lessonTitle: null,
        fileName: f.name,
        fileSize: Number.isFinite(f.size) ? f.size : null,
        status: "INVALID_PDF",
        existingPrimary: false,
        action: actionFor("INVALID_PDF"),
      });
      continue;
    }

    const code = fileNameToLessonCode(f.name);
    const lesson = byCode.get(code);

    if (!lesson) {
      rows.push({
        lessonId: null,
        lessonCode: code,
        lessonTitle: null,
        fileName: f.name,
        fileSize: f.size,
        status: "UNKNOWN_FILE",
        existingPrimary: false,
        action: actionFor("UNKNOWN_FILE"),
      });
      continue;
    }

    const duplicated = (codeHits.get(code) ?? 0) > 1;
    const status: BulkMatchStatus = duplicated
      ? "DUPLICATE_FILE"
      : lesson.hasPrimaryPdf
        ? "REPLACE_EXISTING"
        : "MATCHED";

    consumed.add(lesson.lessonId);
    rows.push({
      lessonId: lesson.lessonId,
      lessonCode: lesson.lessonCode,
      lessonTitle: lesson.lessonTitle,
      fileName: f.name,
      fileSize: f.size,
      status,
      existingPrimary: lesson.hasPrimaryPdf,
      action: actionFor(status),
    });
  }

  for (const l of lessons) {
    if (consumed.has(l.lessonId)) continue;
    rows.push({
      lessonId: l.lessonId,
      lessonCode: l.lessonCode,
      lessonTitle: l.lessonTitle,
      fileName: null,
      fileSize: null,
      status: "MISSING_FILE",
      existingPrimary: l.hasPrimaryPdf,
      action: actionFor("MISSING_FILE"),
    });
  }

  return rows;
}

export function bulkMatchBlockers(rows: BulkMatchRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (BLOCKING_STATUSES.includes(r.status)) {
      out[r.status] = (out[r.status] ?? 0) + 1;
    }
  }
  return out;
}

export function canExecuteBulk(rows: BulkMatchRow[]): boolean {
  return (
    Object.keys(bulkMatchBlockers(rows)).length === 0 &&
    rows.some((r) => r.status === "MATCHED" || r.status === "REPLACE_EXISTING")
  );
}

export function isSubjectComplete(rows: BulkMatchRow[]): boolean {
  return !rows.some((r) => r.status === "MISSING_FILE");
}
