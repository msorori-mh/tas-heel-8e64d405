/**
 * IMPORT-CONTRACT-FINAL-01 — Unified import error/warning code registry.
 *
 * Single closed vocabulary shared by:
 *  - lesson content templates 01–09 (src/lib/content-import/*)
 *  - governorates/structure import (src/lib/import/*)
 *  - question bank import (src/lib/question-bank/import/validation-codes.ts)
 *
 * Pure data — client and server safe. No DB access, no writes.
 */

import {
  QB_IMPORT_CODES,
  VALIDATION_CODE_DEFAULTS,
} from "../question-bank/import/validation-codes.ts";

export type ImportIssueSeverity = "error" | "warning" | "info";

export interface ImportCodeDefinition {
  /** error blocks the job/row, warning is advisory, info is informational only. */
  severity: ImportIssueSeverity;
  /** true → the offending row is rejected. */
  rowBlocking: boolean;
  /** true → the whole file/job is rejected. */
  fileBlocking: boolean;
  /** Arabic operator-facing message template. */
  ar: string;
}

/** Codes emitted by the structure/content dry-run paths (non question-bank). */
export const CONTENT_IMPORT_CODES = {
  EMPTY_FILE: {
    severity: "error",
    rowBlocking: false,
    fileBlocking: true,
    ar: "الملف لا يحتوي على أي صف بيانات.",
  },
  WRONG_SHEET: {
    severity: "error",
    rowBlocking: false,
    fileBlocking: true,
    ar: "اسم ورقة العمل غير مطابق للقالب المعتمد.",
  },
  MISSING_COLUMN: {
    severity: "error",
    rowBlocking: false,
    fileBlocking: true,
    ar: "عمود مطلوب غير موجود في الملف.",
  },
  EXTRA_COLUMN: {
    severity: "warning",
    rowBlocking: false,
    fileBlocking: false,
    ar: "عمود غير معروف سيتم تجاهله.",
  },
  ROW_LIMIT: {
    severity: "error",
    rowBlocking: false,
    fileBlocking: true,
    ar: "عدد الصفوف يتجاوز الحد المسموح للملف الواحد.",
  },
  MISSING_VALUE: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "قيمة مطلوبة فارغة في هذا الصف.",
  },
  DUPLICATE_KEY: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "المفتاح الطبيعي مكرر داخل نفس الملف.",
  },
  UNKNOWN_PARENT_CODE: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "الكود المرجعي للأب (مادة/وحدة/درس) غير موجود.",
  },
  CROSS_PARENT_MISMATCH: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "الوحدة والدرس لا ينتميان لنفس المادة.",
  },
  INVALID_RESOURCE_TYPE: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "نوع المورد غير مدعوم (video | mindmap | experiment | pdf | link).",
  },
  INVALID_SORT_ORDER: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "ترتيب العرض يجب أن يكون رقماً صحيحاً غير سالب.",
  },
  MISSING_OPTION: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "خيار إجابة مطلوب غير موجود.",
  },
  MISSING_CORRECT_INDEX: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "رقم الإجابة الصحيحة مطلوب.",
  },
  INVALID_CORRECT_INDEX: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "رقم الإجابة الصحيحة خارج المدى المسموح (1–6).",
  },
  CORRECT_INDEX_NO_OPTION: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "رقم الإجابة الصحيحة يشير إلى خيار فارغ.",
  },
  PUBLISHED_ROW_IMMUTABLE: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "الصف منشور ولا يجوز تعديله مباشرة من الاستيراد — يحتاج مراجعة/مراجعة نسخة جديدة.",
  },
  DUPLICATE_NAME: {
    severity: "warning",
    rowBlocking: false,
    fileBlocking: false,
    ar: "اسم مكرر داخل الملف.",
  },
  NONSTANDARD_SEPARATOR: {
    severity: "warning",
    rowBlocking: false,
    fileBlocking: false,
    ar: 'الفاصل في اسم المادة غير موحد؛ المعتمد " - ".',
  },
  NONSTANDARD_PARENT_SPELLING: {
    severity: "warning",
    rowBlocking: false,
    fileBlocking: false,
    ar: "تسمية المادة الأم غير معتمدة.",
  },
  PARENT_SPELLING_MISMATCH: {
    severity: "warning",
    rowBlocking: false,
    fileBlocking: false,
    ar: "تهجئتان مختلفتان لنفس المادة الأم تقسمان المجموعة في واجهة الطالب.",
  },
  MISSING_SUBJECT_SCOPE: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "عمود subject_code مطلوب لتحديد الدرس بدقة داخل مادته.",
  },
  AMBIGUOUS_LESSON_CODE: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "كود الدرس يطابق أكثر من درس في مواد مختلفة — حدد subject_code الصحيح.",
  },
  MISSING_ENTITY_CODE: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "الكود الثابت للعنصر (شرح/مورد/تقييم) مطلوب ولا يجوز الاعتماد على ترتيب العرض.",
  },
  MISSING_RESOURCE_URL: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "رابط المورد مطلوب — لا يمكن حفظ مورد بدون رابط.",
  },
  UNSUPPORTED_METADATA_KEY: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "حقل إضافي غير مسموح ضمن بيانات المورد الوصفية.",
  },
  SLUG_COLLISION: {
    severity: "error",
    rowBlocking: true,
    fileBlocking: false,
    ar: "المعرف المشتق من كود المادة يتعارض مع مادة أخرى.",
  },
  REVIEW_STATE_RESET: {
    severity: "warning",
    rowBlocking: false,
    fileBlocking: false,
    ar: "تغيّر محتوى الصف؛ أُعيدت حالة المراجعة إلى «قيد المراجعة» وحالة النشر إلى «مسودة».",
  },
  EXECUTION_FAILED: {
    severity: "error",
    rowBlocking: false,
    fileBlocking: true,
    ar: "فشل التنفيذ وتم التراجع عن الدفعة بالكامل — لم تُحفظ أي تغييرات.",
  },
  INFO: {
    severity: "info",
    rowBlocking: false,
    fileBlocking: false,
    ar: "ملاحظة إرشادية لا تمنع الاستيراد.",
  },
} as const satisfies Record<string, ImportCodeDefinition>;

export type ContentImportCode = keyof typeof CONTENT_IMPORT_CODES;
export type QuestionBankImportCode = keyof typeof QB_IMPORT_CODES;
export type UnifiedImportCode = ContentImportCode | QuestionBankImportCode;

/** Codes defined in both vocabularies — must keep identical blocking semantics. */
export const SHARED_IMPORT_CODES = Object.keys(CONTENT_IMPORT_CODES).filter(
  (code) => code in QB_IMPORT_CODES,
) as Array<ContentImportCode & QuestionBankImportCode>;

/** Question-bank code semantics, expressed in the unified shape. */
export function questionBankCodeDefinition(
  code: QuestionBankImportCode,
): Omit<ImportCodeDefinition, "ar"> {
  const defaults = VALIDATION_CODE_DEFAULTS[code];
  return {
    severity: defaults.severity,
    rowBlocking: defaults.row_blocking,
    fileBlocking: defaults.file_blocking,
  };
}

export function isKnownImportCode(code: string): code is UnifiedImportCode {
  return code in CONTENT_IMPORT_CODES || code in QB_IMPORT_CODES;
}
