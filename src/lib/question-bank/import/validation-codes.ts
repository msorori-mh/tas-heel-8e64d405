/** Closed Failure Vocabulary and Audit Registry with Arabic messages and blocking defaults. */

const FILE_CODES = [
  "FILE_TYPE_UNSUPPORTED",
  "FILE_TOO_LARGE",
  "ZIP_BOMB_SUSPECTED",
  "ZIP_ENTRY_LIMIT",
  "ZIP_TOTAL_SIZE_LIMIT",
  "ZIP_DECLARED_SIZE_LIMIT",
  "ZIP_DUPLICATE_ENTRY",
  "ZIP_MALFORMED_CENTRAL_DIRECTORY",
  "ZIP_MISSING_EOCD",
  "ZIP_ABSOLUTE_PATH",
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
  "AUTH_MISSING",
  "AUTH_MALFORMED",
  "AUTHENTICATION_REQUIRED",
  "CAPABILITY_INVALID",
  "SCOPE_MISMATCH",
  "AUTH_EXPIRED",
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
  "LEGACY_INFORMATION_LOSS",
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
  FILE_TOO_LARGE: "حجم الملف يتجاوز الحد الأقصى المسموح (5 ميبيبايت).",
  ZIP_BOMB_SUSPECTED: "نسبة ضغط الأرشيف تتجاوز الحد الآمن (10:1).",
  ZIP_ENTRY_LIMIT: "عدد مداخل الأرشيف يتجاوز الحد المسموح (200).",
  ZIP_TOTAL_SIZE_LIMIT: "الحجم الإجمالي غير المضغوط لمداخل الأرشيف يتجاوز 20 ميبيبايت.",
  ZIP_DECLARED_SIZE_LIMIT: "الحجم المعلن لمداخل الأرشيف يتجاوز الحدود المسموحة.",
  ZIP_DUPLICATE_ENTRY: "يحتوي أرشيف ZIP على مداخل مكررة بنفس الاسم.",
  ZIP_MALFORMED_CENTRAL_DIRECTORY: "فهرس الدليل المركزي لأرشيف ZIP تالف أو غير متوافق.",
  ZIP_MISSING_EOCD: "بنية أرشيف ZIP غير مكتملة أو يفتقر لسجل نهاية الدليل (EOCD).",
  ZIP_ABSOLUTE_PATH: "مسار ملف داخل الأرشيف مطلق أو يشير لنظام الملفات المحلي.",
  WORKBOOK_ENCRYPTED: "المصنف المشفّر بكلمة مرور غير مدعوم.",
  MACRO_CONTENT: "تم اكتشاف محتوى ماكرو أو محتوى نشط.",
  EXTERNAL_LINK: "تم اكتشاف روابط خارجية في المصنف.",
  PATH_TRAVERSAL: "مسار ملف داخل الأرشيف يحتوي على محاولة تجاوز المجلد (Path Traversal).",
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
  AUTH_MISSING: "التوثيق أو كائن التفويض مفقود.",
  AUTH_MALFORMED: "كائن التفويض غير صالح أو مشوّه.",
  AUTHENTICATION_REQUIRED: "يتطلب التوثيق أولاً قبل تنفيذ الاستيراد.",
  CAPABILITY_INVALID: "القدرة (Capability) المحددة غير صالحة لاستيراد بنك الأسئلة.",
  SCOPE_MISMATCH: "نطاق الاستيراد (Scope) غير مطابق لنطاق المستند.",
  AUTH_EXPIRED: "صلاحية التوثيق/التفويض منتهية أو تم سحبها.",
  PRIVILEGE_ESCALATION: "المدخل يحاول التحكم بالدور أو الحالة أو النشر.",
  PREVIEW_TOKEN_INVALID: "رمز المعاينة غير صالح أو منتهٍ أو مستهلك.",
  STALE_VALIDATION: "تغيرت صلاحيات أو مراجع الكتالوج بعد المعاينة.",
  CONTENT_HASH_MISMATCH: "محتوى التطبيق لا يطابق بصمة المعاينة.",
  IMPORT_REPLAY_CONFLICT: "أُعيد استخدام مفتاح التماثل مع محتوى مختلف.",
  ATOMIC_APPLY_FAILED: "فشل التطبيق ويجب التراجع عن كل التغييرات.",
  NORMALIZATION_CHANGED: "التطبيع الآمن غيّر تمثيل المصدر.",
};

export type ImportStage =
  | "AUTHORIZATION"
  | "PREFLIGHT_RAW"
  | "PREFLIGHT_ZIP"
  | "PREFLIGHT_OOXML"
  | "WORKBOOK_PARSE"
  | "ADAPTER_DETECT"
  | "ROW_VALIDATION"
  | "IDEMPOTENCY";

export type AuditRegistryEntry = {
  canonical_code: QbImportCode;
  stage: ImportStage;
  trigger: string;
  message_ar: string;
  internal_audit_detail: string;
  retryable: boolean;
  severity: "error" | "warning";
  blocking: boolean;
  test_coverage_ids: string[];
  source_module: string;
  status: "COVERED" | "UNCOVERED";
};

const AUDIT_DETAILS: Record<
  QbImportCode,
  { trigger: string; internal_audit_detail: string; test_coverage_ids: string[]; source_module: string }
> = {
  FILE_TYPE_UNSUPPORTED: {
    trigger: "File extension is not .xlsx or binary signature missing PK magic header",
    internal_audit_detail: "Preflight rejected unsupported container format or invalid ZIP header signature",
    test_coverage_ids: ["QB02-046", "QB02-146"],
    source_module: "zip-preflight",
  },
  FILE_TOO_LARGE: {
    trigger: "Uploaded raw byte size exceeds DEFAULT_IMPORT_LIMITS.maxFileBytes (5 MiB)",
    internal_audit_detail: "Preflight raw byte size check rejected oversized input stream",
    test_coverage_ids: ["QB02-099", "QB02-100"],
    source_module: "zip-preflight",
  },
  ZIP_BOMB_SUSPECTED: {
    trigger: "Uncompressed size to compressed size ratio exceeds maxCompressionRatio (10:1) for uncompressed data > 1MB",
    internal_audit_detail: "ZIP entry preflight flagged potential compression bomb pattern",
    test_coverage_ids: ["QB02-122", "QB02-155"],
    source_module: "zip-preflight",
  },
  ZIP_ENTRY_LIMIT: {
    trigger: "Total entry count in central directory exceeds maxZipEntries (200)",
    internal_audit_detail: "ZIP central directory scan found entry count exceeding safety limit",
    test_coverage_ids: ["QB02-101", "QB02-102"],
    source_module: "zip-preflight",
  },
  ZIP_TOTAL_SIZE_LIMIT: {
    trigger: "Sum of uncompressed bytes across all entries exceeds maxUncompressedBytes (20 MiB)",
    internal_audit_detail: "ZIP preflight cumulative uncompressed byte counter exceeded limit",
    test_coverage_ids: ["QB02-103", "QB02-104"],
    source_module: "zip-preflight",
  },
  ZIP_DECLARED_SIZE_LIMIT: {
    trigger: "Single entry declared uncompressed size exceeds maxSingleEntryUncompressedBytes (10 MiB)",
    internal_audit_detail: "ZIP central directory header declared uncompressed size overflowed entry threshold",
    test_coverage_ids: ["QB02-105", "QB02-106"],
    source_module: "zip-preflight",
  },
  ZIP_DUPLICATE_ENTRY: {
    trigger: "Central directory contains multiple entries with identical normalized file paths",
    internal_audit_detail: "ZIP central directory parser detected duplicate filename record",
    test_coverage_ids: ["QB02-123"],
    source_module: "zip-preflight",
  },
  ZIP_MALFORMED_CENTRAL_DIRECTORY: {
    trigger: "Central directory record offset or local header signature invalid",
    internal_audit_detail: "ZIP binary structural validator encountered truncated or corrupt central directory offset",
    test_coverage_ids: ["QB02-124"],
    source_module: "zip-preflight",
  },
  ZIP_MISSING_EOCD: {
    trigger: "End of Central Directory (EOCD) signature 0x06054b50 not found in tail buffer",
    internal_audit_detail: "ZIP binary scanner failed to find EOCD marker",
    test_coverage_ids: ["QB02-125"],
    source_module: "zip-preflight",
  },
  ZIP_ABSOLUTE_PATH: {
    trigger: "ZIP entry filename begins with root slash, backslash, UNC prefix, or drive letter",
    internal_audit_detail: "ZIP preflight rejected absolute or drive-rooted archive entry path",
    test_coverage_ids: ["QB02-117", "QB02-118"],
    source_module: "zip-preflight",
  },
  WORKBOOK_ENCRYPTED: {
    trigger: "ZIP general purpose flag bit 0 set or workbook requires decryption key",
    internal_audit_detail: "Workbook parser detected password-protected or encrypted XML payload",
    test_coverage_ids: ["QB02-047"],
    source_module: "workbook-parser",
  },
  MACRO_CONTENT: {
    trigger: "Workbook container contains VBA binary streams, macros, or .xlsm extensions",
    internal_audit_detail: "OOXML security scanner detected active macro content",
    test_coverage_ids: ["QB02-048", "QB02-120"],
    source_module: "workbook-parser",
  },
  EXTERNAL_LINK: {
    trigger: "OOXML relationship contains TargetMode=External or forbidden URI scheme/traversal",
    internal_audit_detail: "OOXML rel scanner identified external link or remote entity target",
    test_coverage_ids: ["QB02-049", "QB02-121"],
    source_module: "workbook-parser",
  },
  PATH_TRAVERSAL: {
    trigger: "ZIP entry name or OOXML rel target contains directory traversal sequences (..) or percent-encoded variants",
    internal_audit_detail: "Path sanitizer caught illegal directory traversal segment",
    test_coverage_ids: ["QB02-116"],
    source_module: "zip-preflight",
  },
  FORMULA_CELL: {
    trigger: "Worksheet cell contains formula signature starting with =, +, -, @, or tab",
    internal_audit_detail: "Formula detector found active cell formula string",
    test_coverage_ids: ["QB02-050"],
    source_module: "workbook-parser",
  },
  MERGED_DATA_CELL: {
    trigger: "Worksheet contains merged cells overlapping with data table region",
    internal_audit_detail: "Preflight detected merged cell ranges within active data bounds",
    test_coverage_ids: ["QB02-051"],
    source_module: "preflight",
  },
  HIDDEN_SHEET_DATA: {
    trigger: "Workbook contains hidden or very hidden sheet containing question rows",
    internal_audit_detail: "Preflight sheet visibility inspector found non-visible data sheet",
    test_coverage_ids: ["QB02-052"],
    source_module: "preflight",
  },
  HIDDEN_ROW_DATA: {
    trigger: "Worksheet contains hidden rows within data range",
    internal_audit_detail: "Preflight row visibility inspector found hidden row record",
    test_coverage_ids: ["QB02-053"],
    source_module: "preflight",
  },
  HIDDEN_COLUMN_DATA: {
    trigger: "Worksheet contains hidden columns containing header or value cells",
    internal_audit_detail: "Preflight column visibility inspector found hidden column record",
    test_coverage_ids: ["QB02-054"],
    source_module: "preflight",
  },
  SHEET_COUNT_INVALID: {
    trigger: "Workbook visible sheet count exceeds maxVisibleSheets (2)",
    internal_audit_detail: "Preflight sheet count validator rejected workbook layout",
    test_coverage_ids: ["QB02-055"],
    source_module: "preflight",
  },
  ROW_LIMIT: {
    trigger: "Total data row count exceeds maxRows limit (1000)",
    internal_audit_detail: "Preflight row counter exceeded maximum allowed question row count",
    test_coverage_ids: ["QB02-091", "QB02-092"],
    source_module: "preflight",
  },
  COLUMN_LIMIT: {
    trigger: "Total worksheet column count exceeds maxColumns limit (256)",
    internal_audit_detail: "Preflight column inspector exceeded maximum allowed column count",
    test_coverage_ids: ["QB02-097", "QB02-098"],
    source_module: "preflight",
  },
  CELL_TOO_LARGE: {
    trigger: "Cell string byte length exceeds maxCellBytes limit (64 KiB)",
    internal_audit_detail: "Preflight cell byte length inspector caught oversized string cell",
    test_coverage_ids: ["QB02-095", "QB02-096"],
    source_module: "preflight",
  },
  MALFORMED_UNICODE: {
    trigger: "Cell string contains invalid UTF-8 sequences, NUL bytes, or control characters",
    internal_audit_detail: "Unicode sanitizer rejected control code point or invalid byte sequence",
    test_coverage_ids: ["QB02-056"],
    source_module: "unicode",
  },
  MISSING_HEADER: {
    trigger: "Required contract column header is missing from worksheet header row",
    internal_audit_detail: "Adapter header detector failed to locate required column name",
    test_coverage_ids: ["QB02-057"],
    source_module: "detect",
  },
  DUPLICATE_HEADER: {
    trigger: "Worksheet header row contains multiple columns with identical normalized names",
    internal_audit_detail: "Adapter header detector found duplicate normalized header",
    test_coverage_ids: ["QB02-058"],
    source_module: "detect",
  },
  UNKNOWN_COLUMN: {
    trigger: "Header row contains column not defined in active import contract schema",
    internal_audit_detail: "Adapter detector encountered unrecognized non-blocking header",
    test_coverage_ids: ["QB02-059"],
    source_module: "detect",
  },
  FORBIDDEN_COLUMN: {
    trigger: "Header row contains forbidden sensitive metadata column name",
    internal_audit_detail: "Adapter header detector rejected restricted system column",
    test_coverage_ids: ["QB02-060"],
    source_module: "detect",
  },
  LEGACY_COLUMN_COUNT: {
    trigger: "Legacy flat 15-column schema input does not have exactly 15 columns",
    internal_audit_detail: "Legacy flat adapter verified column count mismatch",
    test_coverage_ids: ["QB02-034"],
    source_module: "legacy-flat-15col",
  },
  LEGACY_COLUMN_ORDER: {
    trigger: "Legacy flat 15-column schema input headers do not match expected positional order",
    internal_audit_detail: "Legacy flat adapter detected column sequence order mismatch",
    test_coverage_ids: ["QB02-038"],
    source_module: "legacy-flat-15col",
  },
  INVALID_CONTRACT: {
    trigger: "Header structure does not conform to any supported question bank import schema",
    internal_audit_detail: "Adapter detection failed to match active schema contract",
    test_coverage_ids: ["QB02-061"],
    source_module: "detect",
  },
  DUPLICATE_CODE_IN_FILE: {
    trigger: "Multiple rows within the same import file share the same question_code",
    internal_audit_detail: "Row validator detected intra-file duplicate question_code",
    test_coverage_ids: ["QB02-062"],
    source_module: "validate",
  },
  DUPLICATE_CODE_EXISTS: {
    trigger: "Imported question_code already exists in system catalog without idempotency match",
    internal_audit_detail: "Catalog validator found existing question_code collision",
    test_coverage_ids: ["QB02-063"],
    source_module: "validate",
  },
  UNAUTHORIZED_IMPORT: {
    trigger: "Authorization context authorized flag is false or capability check denied",
    internal_audit_detail: "Authorization guard rejected unauthorized actor context",
    test_coverage_ids: ["QB02-064"],
    source_module: "authorization",
  },
  AUTH_MISSING: {
    trigger: "Authorization context is null, undefined, or false",
    internal_audit_detail: "Authorization guard missing required authentication token",
    test_coverage_ids: ["QB02-065"],
    source_module: "authorization",
  },
  AUTH_MALFORMED: {
    trigger: "Authorization context object is malformed or missing mandatory fields like actorId",
    internal_audit_detail: "Authorization guard caught malformed auth payload structure",
    test_coverage_ids: ["QB02-066"],
    source_module: "authorization",
  },
  AUTHENTICATION_REQUIRED: {
    trigger: "Actor is unauthenticated (authenticated flag is false)",
    internal_audit_detail: "Authorization guard rejected unauthenticated user session",
    test_coverage_ids: ["QB02-067"],
    source_module: "authorization",
  },
  CAPABILITY_INVALID: {
    trigger: "Authorization capability does not match 'question_bank.import'",
    internal_audit_detail: "Authorization guard rejected context lacking question_bank.import capability",
    test_coverage_ids: ["QB02-068"],
    source_module: "authorization",
  },
  SCOPE_MISMATCH: {
    trigger: "Authorization scope does not match expected document tenant scope or is wildcard '*'",
    internal_audit_detail: "Authorization guard rejected scope mismatch or wildcard scope",
    test_coverage_ids: ["QB02-069"],
    source_module: "authorization",
  },
  AUTH_EXPIRED: {
    trigger: "Authorization token expired flag is true, revoked flag is true, or expiresAt is in the past",
    internal_audit_detail: "Authorization guard rejected expired or revoked authorization token",
    test_coverage_ids: ["QB02-070"],
    source_module: "authorization",
  },
  PRIVILEGE_ESCALATION: {
    trigger: "Row input attempts to set protected metadata fields like owner_role or publication_status",
    internal_audit_detail: "Row validator blocked unauthorized attribute escalation attempt",
    test_coverage_ids: ["QB02-071"],
    source_module: "validate",
  },
  PREVIEW_TOKEN_INVALID: {
    trigger: "Dry run preview token is expired, tampered, or invalid",
    internal_audit_detail: "Preview token verification failed security check",
    test_coverage_ids: ["QB02-072"],
    source_module: "preview",
  },
  STALE_VALIDATION: {
    trigger: "Catalog snapshot timestamp or state changed between dry run preview and apply",
    internal_audit_detail: "Apply token validation caught stale catalog state snapshot",
    test_coverage_ids: ["QB02-073"],
    source_module: "validate",
  },
  CONTENT_HASH_MISMATCH: {
    trigger: "Apply request payload canonical hash does not match preview validation hash",
    internal_audit_detail: "Apply token validator detected payload content mutation after preview",
    test_coverage_ids: ["QB02-074"],
    source_module: "canonical-json",
  },
  IMPORT_REPLAY_CONFLICT: {
    trigger: "Same question_code re-imported with modified content without explicit revision",
    internal_audit_detail: "Idempotency checker caught content conflict on duplicate question code",
    test_coverage_ids: ["QB02-075"],
    source_module: "validate",
  },
  ATOMIC_APPLY_FAILED: {
    trigger: "Transactional write operation failed during batch commit phase",
    internal_audit_detail: "Apply pipeline caught database write error and triggered rollback",
    test_coverage_ids: ["QB02-076"],
    source_module: "dry-run",
  },
  MISSING_VALUE: {
    trigger: "Required field cell is empty or missing from question row",
    internal_audit_detail: "Row validator detected missing mandatory column value",
    test_coverage_ids: ["QB02-077"],
    source_module: "validate",
  },
  INVALID_INTERACTION_TYPE: {
    trigger: "interaction_type string is not a recognized canonical question type",
    internal_audit_detail: "Adapter type validator rejected unknown interaction_type value",
    test_coverage_ids: ["QB02-078"],
    source_module: "official-flat-v0",
  },
  INVALID_GRADING_MODE: {
    trigger: "grading_mode string is not a valid canonical grading mode",
    internal_audit_detail: "Adapter grading mode validator rejected unknown grading_mode value",
    test_coverage_ids: ["QB02-079"],
    source_module: "official-flat-v0",
  },
  INCOMPATIBLE_TYPE_MODE: {
    trigger: "interaction_type and grading_mode combination is logically incompatible",
    internal_audit_detail: "Row validator rejected incompatible interaction_type and grading_mode pair",
    test_coverage_ids: ["QB02-080"],
    source_module: "validate",
  },
  OPTION_COUNT: {
    trigger: "Multiple choice question does not have between 2 and 6 options",
    internal_audit_detail: "Option validator rejected question option count out of bounds",
    test_coverage_ids: ["QB02-081"],
    source_module: "correct-answer",
  },
  DUPLICATE_OPTION: {
    trigger: "Multiple options within the same question have identical option_code or text",
    internal_audit_detail: "Option validator detected duplicate option body or code",
    test_coverage_ids: ["QB02-082"],
    source_module: "correct-answer",
  },
  MISSING_CORRECT_INDEX: {
    trigger: "Auto-graded single choice question lacks specified correct answer index or key",
    internal_audit_detail: "Answer resolver failed to locate correct_index field",
    test_coverage_ids: ["QB02-083"],
    source_module: "correct-answer",
  },
  INVALID_CORRECT_INDEX: {
    trigger: "correct_index out of bounds or cannot be mapped to any option",
    internal_audit_detail: "Answer resolver failed to map correct_index to valid option code",
    test_coverage_ids: ["QB02-084"],
    source_module: "correct-answer",
  },
  CORRECT_INDEX_NO_OPTION: {
    trigger: "correct_index points to an option column that has an empty body string",
    internal_audit_detail: "Answer resolver found correct answer index referencing empty option cell",
    test_coverage_ids: ["QB02-085"],
    source_module: "correct-answer",
  },
  ANSWER_NOT_ALLOWED: {
    trigger: "Manually graded question includes automated answer keys or options",
    internal_audit_detail: "Row validator rejected answer options on manual grading mode question",
    test_coverage_ids: ["QB02-086"],
    source_module: "validate",
  },
  ACCEPTED_ANSWER_REQUIRED: {
    trigger: "AUTO_TEXT question does not provide any accepted answer text strings",
    internal_audit_detail: "Answer resolver found AUTO_TEXT question missing accepted answers",
    test_coverage_ids: ["QB02-087"],
    source_module: "correct-answer",
  },
  DUPLICATE_ACCEPTED_ANSWER: {
    trigger: "Accepted answer list contains duplicate entries after string normalization",
    internal_audit_detail: "Answer resolver found duplicate accepted answer string",
    test_coverage_ids: ["QB02-107"],
    source_module: "correct-answer",
  },
  INVALID_SCORE: {
    trigger: "max_score is not a finite positive number",
    internal_audit_detail: "Score validator rejected non-positive or non-numeric max_score value",
    test_coverage_ids: ["QB02-108"],
    source_module: "validate",
  },
  PARTIAL_NOT_ALLOWED: {
    trigger: "allow_partial is set to true on a question type that does not support partial credit",
    internal_audit_detail: "Row validator rejected partial credit flag on single choice question",
    test_coverage_ids: ["QB02-109"],
    source_module: "validate",
  },
  QUESTION_CODE_INVALID: {
    trigger: "question_code contains invalid characters or exceeds length limit",
    internal_audit_detail: "Code validator rejected malformed question_code string",
    test_coverage_ids: ["QB02-110"],
    source_module: "validate",
  },
  UNKNOWN_SUBJECT: {
    trigger: "subject_code does not exist in authorized curriculum catalog",
    internal_audit_detail: "Catalog validator failed to find subject_code in active catalog",
    test_coverage_ids: ["QB02-111"],
    source_module: "validate",
  },
  UNKNOWN_LESSON: {
    trigger: "lesson_code does not exist in authorized curriculum catalog",
    internal_audit_detail: "Catalog validator failed to find lesson_code in active catalog",
    test_coverage_ids: ["QB02-112"],
    source_module: "validate",
  },
  CROSS_SUBJECT_MAPPING: {
    trigger: "Target subject is outside actor's authorized scope",
    internal_audit_detail: "Catalog validator rejected subject outside authorized import scope",
    test_coverage_ids: ["QB02-113"],
    source_module: "validate",
  },
  CROSS_LESSON_MAPPING: {
    trigger: "Specified lesson does not belong to specified subject",
    internal_audit_detail: "Catalog validator caught lesson/subject hierarchy mismatch",
    test_coverage_ids: ["QB02-114"],
    source_module: "validate",
  },
  MEDIA_URL_INVALID: {
    trigger: "media_url is not a valid HTTPS URL or points to an untrusted domain/local path",
    internal_audit_detail: "Media policy validator rejected unsafe or untrusted media URL",
    test_coverage_ids: ["QB02-188", "QB02-189"],
    source_module: "media-policy",
  },
  MEDIA_TYPE_REQUIRED: {
    trigger: "media_url is provided without valid media_type",
    internal_audit_detail: "Media policy validator required explicit media_type for URL",
    test_coverage_ids: ["QB02-190"],
    source_module: "media-policy",
  },
  FORMULA_INJECTION: {
    trigger: "Cell text begins with CSV/Formula injection trigger characters (=, +, -, @, \\t, \\r)",
    internal_audit_detail: "Formula injection detector caught cell text starting with unsafe character",
    test_coverage_ids: ["QB02-115"],
    source_module: "validate",
  },
  MIXED_NUMERAL_SCRIPTS: {
    trigger: "Question code or index combines Western Arabic digits (0-9) with Eastern Arabic-Indic digits (٠-٩/۰-۹)",
    internal_audit_detail: "Unicode numeral validator caught mixed script digits within same code string",
    test_coverage_ids: ["QB02-119"],
    source_module: "unicode",
  },
  SCIENTIFIC_NOTATION_LOSS: {
    trigger: "Numeric identifier string was parsed as floating point scientific notation (e.g. 1e5)",
    internal_audit_detail: "Row validator detected precision loss from scientific notation parsing",
    test_coverage_ids: ["QB02-088"],
    source_module: "unicode",
  },
  LEGACY_INFORMATION_LOSS: {
    trigger: "Legacy format row cannot express required modern fields without semantic loss",
    internal_audit_detail: "Legacy flat adapter flagged semantic information loss during conversion",
    test_coverage_ids: ["QB02-042"],
    source_module: "legacy-flat-15col",
  },
  NORMALIZATION_CHANGED: {
    trigger: "Text normalization modified whitespace, Unicode normalization, or digit script representation",
    internal_audit_detail: "Unicode normalizer recorded non-identity text normalization transformation",
    test_coverage_ids: ["QB02-166"],
    source_module: "unicode",
  },
};

export const QB_IMPORT_AUDIT_REGISTRY: Record<QbImportCode, AuditRegistryEntry> = Object.fromEntries(
  Object.keys(QB_IMPORT_AR_MESSAGES).map((codeStr) => {
    const code = codeStr as QbImportCode;
    const defaults = VALIDATION_CODE_DEFAULTS[code];
    const details = AUDIT_DETAILS[code];

    let stage: ImportStage = "ROW_VALIDATION";
    if (["AUTH_MISSING", "AUTH_MALFORMED", "AUTHENTICATION_REQUIRED", "CAPABILITY_INVALID", "SCOPE_MISMATCH", "AUTH_EXPIRED", "UNAUTHORIZED_IMPORT", "PRIVILEGE_ESCALATION"].includes(code)) {
      stage = "AUTHORIZATION";
    } else if (["FILE_TOO_LARGE", "FILE_TYPE_UNSUPPORTED"].includes(code)) {
      stage = "PREFLIGHT_RAW";
    } else if (["ZIP_BOMB_SUSPECTED", "ZIP_ENTRY_LIMIT", "ZIP_TOTAL_SIZE_LIMIT", "ZIP_DECLARED_SIZE_LIMIT", "ZIP_DUPLICATE_ENTRY", "ZIP_MALFORMED_CENTRAL_DIRECTORY", "ZIP_MISSING_EOCD", "ZIP_ABSOLUTE_PATH", "PATH_TRAVERSAL", "WORKBOOK_ENCRYPTED"].includes(code)) {
      stage = "PREFLIGHT_ZIP";
    } else if (["MACRO_CONTENT", "EXTERNAL_LINK", "FORMULA_CELL", "MERGED_DATA_CELL", "HIDDEN_SHEET_DATA", "HIDDEN_ROW_DATA", "HIDDEN_COLUMN_DATA", "SHEET_COUNT_INVALID", "ROW_LIMIT", "COLUMN_LIMIT", "CELL_TOO_LARGE", "MALFORMED_UNICODE"].includes(code)) {
      stage = "PREFLIGHT_OOXML";
    } else if (["MISSING_HEADER", "DUPLICATE_HEADER", "UNKNOWN_COLUMN", "FORBIDDEN_COLUMN", "LEGACY_COLUMN_COUNT", "LEGACY_COLUMN_ORDER", "INVALID_CONTRACT"].includes(code)) {
      stage = "ADAPTER_DETECT";
    } else if (["DUPLICATE_CODE_EXISTS", "PREVIEW_TOKEN_INVALID", "STALE_VALIDATION", "CONTENT_HASH_MISMATCH", "IMPORT_REPLAY_CONFLICT", "ATOMIC_APPLY_FAILED"].includes(code)) {
      stage = "IDEMPOTENCY";
    }

    const testCoverageIds = details?.test_coverage_ids ?? [];

    return [
      code,
      {
        canonical_code: code,
        stage,
        trigger: details?.trigger ?? `Trigger condition for ${code}`,
        message_ar: QB_IMPORT_AR_MESSAGES[code],
        internal_audit_detail: details?.internal_audit_detail ?? `Audit detail record for ${code}`,
        retryable: false,
        severity: defaults.severity,
        blocking: defaults.file_blocking || defaults.row_blocking,
        test_coverage_ids: testCoverageIds,
        source_module: details?.source_module ?? "unknown",
        status: testCoverageIds.length > 0 ? "COVERED" : "UNCOVERED",
      } satisfies AuditRegistryEntry,
    ];
  }),
) as Record<QbImportCode, AuditRegistryEntry>;
