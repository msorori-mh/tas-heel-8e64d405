/** Server-side import authorization for content staff vs full admin. */

export const CONTENT_STAFF_ALLOWED_IMPORT_TYPES = [
  "structure",
  "questions",
  "exam_templates",
  "mixed",
] as const;

export type ContentStaffImportType = (typeof CONTENT_STAFF_ALLOWED_IMPORT_TYPES)[number];

export function assertImportJobAllowed(importType: string, isFullAdmin: boolean): void {
  if (isFullAdmin) return;

  if (importType === "config") {
    throw new Error("غير مصرح — نوع الاستيراد config محجوز للإدارة الكاملة.");
  }

  if (!CONTENT_STAFF_ALLOWED_IMPORT_TYPES.includes(importType as ContentStaffImportType)) {
    throw new Error("غير مصرح — نوع الاستيراد غير مسموح لدور إدارة المحتوى.");
  }
}
