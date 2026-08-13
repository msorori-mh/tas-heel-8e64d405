/**
 * ADMIN_IMPORT_PREPARE_EXECUTE_WIRING_06 — Arabic operator messages for the
 * prepare/execute path. Pure data + pure functions; client and server safe.
 */

export const IMPORT_EXECUTE_MESSAGES_AR: Record<string, string> = {
  NOT_AUTHORIZED: "غير مصرح — هذه العملية متاحة لطاقم المحتوى المخوّل فقط.",
  NOT_JOB_OWNER: "غير مصرح — هذه العملية أنشأها مستخدم آخر.",
  IMPORT_JOB_NOT_FOUND: "لم يتم العثور على عملية الاستيراد.",
  INVALID_STATE_TRANSITION:
    "حالة العملية لا تسمح بهذه الخطوة — أعد التجهيز من جديد.",
  INVALID_STAGING_PAYLOAD: "بيانات التجهيز غير صالحة.",
  INVALID_STAGED_ROW: "أحد الصفوف المجهّزة غير صالح — أعد فحص الملف.",
  DUPLICATE_NATURAL_KEY: "يوجد مفتاح مكرر داخل الملف نفسه.",
  QUESTION_BANK_WORKFLOW_REQUIRED:
    "قالب الأسئلة (09) لا يمر عبر مسار التحديث العام — يمر عبر مسار بنك الأسئلة المعتمد.",
  QUESTION_BANK_CAPABILITY_REQUIRED:
    "غير مصرح — استيراد الأسئلة يتطلب صلاحية تحرير بنك الأسئلة.",
  HASH_MISMATCH:
    "بصمة أحد الصفوف المجهّزة لا تطابق محتواه — أُلغيت العملية بالكامل. أعد التجهيز من الملف.",
  STAGING_ROW_NOT_FOUND: "لم يتم العثور على أحد الصفوف المجهّزة.",
  TEMPLATE_MISMATCH: "نوع القالب لا يطابق الصف المجهّز.",
  QUESTION_CODE_REQUIRED: "كود السؤال مفقود في أحد الصفوف.",
  QUESTION_TEXT_REQUIRED: "نص السؤال مفقود في أحد الصفوف.",
  QUESTION_OPTIONS_REQUIRED: "يجب توفير خيارين على الأقل لكل سؤال.",
  INVALID_CORRECT_INDEX:
    "رقم الإجابة الصحيحة خارج نطاق الخيارات في أحد الصفوف (الترقيم يبدأ من 1).",

  SUBJECT_NOT_FOUND: "كود المادة غير موجود — استورد قالب المواد أولاً.",
  LESSON_NOT_FOUND: "كود الدرس غير موجود — استورد قالب الدروس أولاً.",
  MISSING_RESOURCE_URL: "رابط المورد مفقود في أحد الصفوف.",
  ASSESSMENT_QUESTION_LINK_UNRESOLVED:
    "تعذّر ربط سؤال بتقييم — تحقق من كود التقييم وكود السؤال.",
  UNSUPPORTED_TEMPLATE: "هذا القالب غير مدعوم في مسار التنفيذ العام.",
  REVIEW_STATE_NOT_FOUND: "لا توجد حالة مراجعة لهذا المحتوى.",
  PUBLISH_REQUIRES_APPROVAL: "لا يمكن النشر قبل اعتماد المراجعة.",
  SCHEMA_DRIFT: "انحراف في بنية قاعدة البيانات — أوقف العملية وراجع الترحيلات.",
};

/** Map a raw database/RPC error message to an Arabic operator message. */
export function toArabicImportExecuteMessage(raw: string): string {
  for (const code of Object.keys(IMPORT_EXECUTE_MESSAGES_AR)) {
    if (raw.includes(code)) return IMPORT_EXECUTE_MESSAGES_AR[code] as string;
  }
  return raw;
}
