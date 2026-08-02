/** Closed Oracle 50 vocabulary with Arabic messages and blocking defaults. */

const FILE_CODES = [
  "FILE_TYPE_UNSUPPORTED",
  "FILE_TOO_LARGE",
  "ZIP_BOMB_SUSPECTED",
  "ZIP_ENTRY_LIMIT",
  "WORKBOOK_ENCRYPTED",
  "MACRO_CONTENT",
  "EXTERNAL_LINK",
  "PATH_TRAVERSAL",
  "FORMULA_CELL",
  "MERGED_DATA_CELL",
  "HIDDEN_SHEET_DATA",
  "HIDDEN_ROW_DATA",
  "HIDDEN_COLUMN_DATA",
  "SHEET_COUNT_INVALID",
  "ROW_LIMIT",
  "COLUMN_LIMIT",
  "CELL_TOO_LARGE",
  "MALFORMED_UNICODE",
  "MISSING_HEADER",
  "DUPLICATE_HEADER",
  "FORBIDDEN_COLUMN",
  "LEGACY_COLUMN_COUNT",
  "LEGACY_COLUMN_ORDER",
  "INVALID_CONTRACT",
  "DUPLICATE_CODE_IN_FILE",
  "DUPLICATE_CODE_EXISTS",
  "UNAUTHORIZED_IMPORT",
  "PRIVILEGE_ESCALATION",
  "PREVIEW_TOKEN_INVALID",
  "STALE_VALIDATION",
  "CONTENT_HASH_MISMATCH",
  "IMPORT_REPLAY_CONFLICT",
  "ATOMIC_APPLY_FAILED",
] as const;

const ROW_CODES = [
  "UNKNOWN_COLUMN",
  "MISSING_VALUE",
  "INVALID_INTERACTION_TYPE",
  "INVALID_GRADING_MODE",
  "INCOMPATIBLE_TYPE_MODE",
  "OPTION_COUNT",
  "DUPLICATE_OPTION",
  "MISSING_CORRECT_INDEX",
  "INVALID_CORRECT_INDEX",
  "CORRECT_INDEX_NO_OPTION",
  "ANSWER_NOT_ALLOWED",
  "ACCEPTED_ANSWER_REQUIRED",
  "DUPLICATE_ACCEPTED_ANSWER",
  "INVALID_SCORE",
  "PARTIAL_NOT_ALLOWED",
  "QUESTION_CODE_INVALID",
  "UNKNOWN_SUBJECT",
  "UNKNOWN_LESSON",
  "CROSS_SUBJECT_MAPPING",
  "CROSS_LESSON_MAPPING",
  "MEDIA_URL_INVALID",
  "MEDIA_TYPE_REQUIRED",
  "FORMULA_INJECTION",
  "MIXED_NUMERAL_SCRIPTS",
  "SCIENTIFIC_NOTATION_LOSS",
  "LEGACY_INFORMATION_LOSS",
  "NORMALIZATION_CHANGED",
] as const;

export const QB_IMPORT_CODES = Object.fromEntries(
  [...FILE_CODES, ...ROW_CODES].map((code) => [code, code]),
) as { [K in (typeof FILE_CODES)[number] | (typeof ROW_CODES)[number]]: K };

export type QbImportCode = keyof typeof QB_IMPORT_CODES;

export type CodeDefaults = {
  severity: "error" | "warning";
  row_blocking: boolean;
  file_blocking: boolean;
};

const WARNING_CODES = new Set<QbImportCode>([
  "UNKNOWN_COLUMN",
  "DUPLICATE_ACCEPTED_ANSWER",
  "NORMALIZATION_CHANGED",
]);

export const VALIDATION_CODE_DEFAULTS = Object.fromEntries(
  [...FILE_CODES, ...ROW_CODES].map((code) => {
    const warning = WARNING_CODES.has(code);
    const isFile = (FILE_CODES as readonly string[]).includes(code);
    return [
      code,
      {
        severity: warning ? "warning" : "error",
        row_blocking: !warning && !isFile,
        file_blocking: !warning && isFile,
      } satisfies CodeDefaults,
    ];
  }),
) as Record<QbImportCode, CodeDefaults>;

export const QB_IMPORT_AR_MESSAGES: Record<QbImportCode, string> = {
  FILE_TYPE_UNSUPPORTED: "نوع الملف غير مدعوم؛ المطلوب مصنف .xlsx فقط.",
  FILE_TOO_LARGE: "حجم الملف المضغوط يتجاوز 5 ميبيبايت.",
  ZIP_BOMB_SUSPECTED: "مؤشرات ضغط/تفجير أرشيف غير آمنة.",
  ZIP_ENTRY_LIMIT: "عدد مداخل الأرشيف يتجاوز الحد المسموح (200).",
  WORKBOOK_ENCRYPTED: "المصنف المشفّر غير مدعوم.",
  MACRO_CONTENT: "تم اكتشاف محتوى ماكرو أو محتوى نشط.",
  EXTERNAL_LINK: "تم اكتشاف روابط خارجية في المصنف.",
  PATH_TRAVERSAL: "مسار أرشيف أو علاقة غير آمن.",
  FORMULA_CELL: "خلايا الصيغ غير مسموحة.",
  MERGED_DATA_CELL: "خلايا مدمجة تتقاطع مع منطقة البيانات.",
  HIDDEN_SHEET_DATA: "ورقة مخفية تحتوي بيانات.",
  HIDDEN_ROW_DATA: "صف مخفي يحتوي بيانات.",
  HIDDEN_COLUMN_DATA: "عمود دلالي مخفي يحتوي بيانات.",
  SHEET_COUNT_INVALID: "تخطيط أوراق المصنف غير مدعوم.",
  ROW_LIMIT: "عدد صفوف البيانات يتجاوز 1000.",
  COLUMN_LIMIT: "عدد الأعمدة يتجاوز 256.",
  CELL_TOO_LARGE: "حجم الخلية يتجاوز 64 كيبيبايت.",
  MALFORMED_UNICODE: "يونيكود غير صالح أو محظور.",
  MISSING_HEADER: "عنوان عمود مطلوب مفقود.",
  DUPLICATE_HEADER: "عنوان عمود مكرر بعد التطبيع.",
  UNKNOWN_COLUMN: "عمود غير معروف وسيُتجاهل إن لم يكن حساساً.",
  FORBIDDEN_COLUMN: "عمود حساس أو مخصص للكاتب غير مسموح.",
  LEGACY_COLUMN_COUNT: "عقد legacy يتطلب 15 عموداً ظاهراً بالضبط.",
  LEGACY_COLUMN_ORDER: "أعمدة legacy مُعاد ترتيبها.",
  MISSING_VALUE: "قيمة مطلوبة مفقودة في الصف.",
  INVALID_CONTRACT: "عقد المصدر مفقود أو غير مدعوم.",
  INVALID_INTERACTION_TYPE: "نوع التفاعل غير مدعوم.",
  INVALID_GRADING_MODE: "وضع التصحيح غير مدعوم.",
  INCOMPATIBLE_TYPE_MODE: "نوع التفاعل ووضع التصحيح غير متوافقين.",
  OPTION_COUNT: "أسئلة الاختيار تتطلب من خيارين إلى ستة خيارات متجاورة.",
  DUPLICATE_OPTION: "نصوص أو رموز الخيارات مكررة.",
  MISSING_CORRECT_INDEX: "فهرس الإجابة الصحيحة مفقود.",
  INVALID_CORRECT_INDEX: "فهرس الإجابة الصحيحة غير صالح وفق العقد.",
  CORRECT_INDEX_NO_OPTION: "فهرس الإجابة يشير إلى خيار فارغ.",
  ANSWER_NOT_ALLOWED: "مواد الإجابة ممنوعة لأسئلة التصحيح اليدوي.",
  ACCEPTED_ANSWER_REQUIRED: "سؤال النص التلقائي يتطلب إجابة مقبولة.",
  DUPLICATE_ACCEPTED_ANSWER: "إجابة مقبولة مكررة بعد التطبيع.",
  INVALID_SCORE: "الدرجة يجب أن تكون رقماً موجباً محدوداً.",
  PARTIAL_NOT_ALLOWED: "الدرجة الجزئية غير متوافقة مع هذا السؤال.",
  QUESTION_CODE_INVALID: "رمز السؤال غير صالح.",
  DUPLICATE_CODE_IN_FILE: "رمز السؤال مكرر داخل الملف.",
  DUPLICATE_CODE_EXISTS: "رمز السؤال موجود مسبقاً ولا يُسمح بالاستبدال الصامت.",
  UNKNOWN_SUBJECT: "رمز المادة غير موجود ضمن النطاق المصرّح.",
  UNKNOWN_LESSON: "رمز الدرس غير موجود ضمن النطاق المصرّح.",
  CROSS_SUBJECT_MAPPING: "المادة المستهدفة خارج نطاق الاستيراد المصرّح.",
  CROSS_LESSON_MAPPING: "الدرس لا ينتمي إلى المادة/النطاق المحدد.",
  MEDIA_URL_INVALID: "رابط الوسائط يخالف سياسة المخطط/المضيف/الأمان.",
  MEDIA_TYPE_REQUIRED: "تعذر تحديد نوع الوسائط بأمان.",
  FORMULA_INJECTION: "نص شبيه بصيغة غير آمن للاستيراد/التصدير.",
  MIXED_NUMERAL_SCRIPTS: "الرمز الرقمي يخلط أنظمة أرقام مختلفة.",
  SCIENTIFIC_NOTATION_LOSS: "تم إجبار المعرّف/الإجابة إلى تدوين علمي.",
  LEGACY_INFORMATION_LOSS: "صف legacy لا يستطيع التعبير عن الدلالة المطلوبة.",
  UNAUTHORIZED_IMPORT: "المستخدم لا يملك صلاحية الاستيراد.",
  PRIVILEGE_ESCALATION: "المدخل يحاول التحكم بالدور أو الحالة أو النشر.",
  PREVIEW_TOKEN_INVALID: "رمز المعاينة غير صالح أو منتهٍ أو مستهلك.",
  STALE_VALIDATION: "تغيرت صلاحيات أو مراجع الكتالوج بعد المعاينة.",
  CONTENT_HASH_MISMATCH: "محتوى التطبيق لا يطابق بصمة المعاينة.",
  IMPORT_REPLAY_CONFLICT: "أُعيد استخدام مفتاح التماثل مع محتوى مختلف.",
  ATOMIC_APPLY_FAILED: "فشل التطبيق ويجب التراجع عن كل التغييرات.",
  NORMALIZATION_CHANGED: "التطبيع الآمن غيّر تمثيل المصدر.",
};
