# TAMKEEN_QURAN_18E_PDF_UPLOAD_BIND_AND_UNIT_MODEL_DIAGNOSTIC_18E1

تشخيص P0 — قراءة فقط. لم يُنفَّذ أي DML أو Migration أو رفع/حذف.

المادة: `sub-g10-001` — القرآن الكريم — `1234e882-b0b2-499a-bd66-f91f480e1081`

---

## PHASE A — QURAN UNIT MODEL AUDIT

| unit_id | unit_code | unit_title | display_order | lesson_count |
|---|---|---|---|---|
| 61cc4360-8522-46f1-81e7-27c6e95aad85 | unit-g10-001-01 | الحفظ والتفسير | 1 | 7 (001–007) |
| 0519be6d-4344-417b-aa28-dcb9cc658bf5 | unit-g10-001-02 | علوم القرآن | 2 | 3 (008–010) |
| e18e638c-4180-45c1-adbc-d8a447e5caae | unit-g10-001-03 | التلاوة | 3 | 11 (011–021) |
| 7e212e0a-c8b6-4021-83d8-c9134f447992 | unit-g10-001-04 | الحفظ والتفسير | 4 | 7 (022–028) |
| d36c0103-60be-4660-a4db-10cc6ae5315e | unit-g10-001-05 | التجويد | 5 | 2 (029–030) |
| 02c15e57-8313-4227-ab27-9c5611e98366 | unit-g10-001-06 | التلاوة | 6 | 10 (031–040) |

مصدر الأسماء: ملف الاستيراد الذي وُلِّد في 18E من تصنيف أسماء ملفات PDF
(قسم المحتوى × الفصل الدراسي) — وليس من فهرس الكتاب الرسمي.

الدليل الحاسم: الأسماء تتكرر (الحفظ والتفسير ×2، التلاوة ×2) لأنها في الحقيقة
«قسم عرض × فصل دراسي»، وهذا لا يحدث في ترقيم وحدات كتاب رسمي.
المعمار المعتمد سابقاً للقرآن: `Subject → Lesson` مع `unit_id = NULL`.

**QURAN_UNIT_MODEL = INCORRECT_SECTION_AS_UNIT**

⇒ توقّف إلزامي: لا رفع PDF ولا Pilot ولا Bulk في هذه المرحلة.

### Correction Preview (رسمي — غير منفَّذ)

- الدروس المتأثرة: 40 (`lesson-g10-001-001..040`) بمعرفاتها الحالية — **لا حذف**.
- الحالة الحالية: `unit_id` = إحدى الوحدات الست أعلاه.
- الحالة المستهدفة: `unit_id = NULL` (Direct Lesson — مدعوم منذ 13E).
- هل يمكن تعديل الربط دون حذف الدرس؟ **نعم** — `lessons.unit_id` قابل لـ NULL،
  و`UPDATE` لا يمس `lesson_resources` ولا `user_progress` ولا الأكواد الطبيعية.
- الوحدات الست تصبح orphan (0 دروس) → تُحذف لاحقاً عبر `admin_curriculum_delete`
  فقط بعد إعادة الربط، وحذفها عندها `cascade impact = ZERO`.
- **CASCADE_IMPACT_REQUIRED = ZERO** (لا حذف دروس، لا حذف موارد، لا Template 03).
- MIGRATION_REQUIRED للتصحيح: نعم (UPDATE + DELETE units) — بانتظار تفويض صريح.

---

## PHASE B — STORAGE TRUTH AUDIT

- Bucket المستخدم في 18D: `lesson-pdfs` (خاص، `public = false`).
- مسار النظام: `<lessonId>/<uuid>.pdf`.

```
STORAGE_OBJECT_COUNT = 40
STORAGE_TOTAL_BYTES  = 68,756,075
LESSON_RESOURCES_COUNT = 0
```

- توزيع: كل درس من الأربعين لديه **كائن واحد بالضبط** (لا تكرار، لا نقص).
- كل الكائنات الأربعين تعود لدروس هذه المادة → `ORPHAN_OBJECTS = 0` بالمعنى
  الحرفي (تعود لدروس صحيحة)، لكنها جميعاً **UNBOUND**.

---

## PHASE C — CLASSIFY EXACT FAILURE

**CASE_A** — `STORAGE_OBJECTS = 40` و `LESSON_RESOURCES = 0`
⇒ `BYTES_UPLOAD_PASS` + `BIND_STEP_FAIL`.

---

## PHASE D — TRACE (بدون أي كتابة جديدة)

| # | الخطوة | النتيجة الفعلية |
|---|---|---|
| 1 | signed upload URL | نجح (40 مرة) |
| 2 | signed URL response | token صالح |
| 3 | upload bytes | نجح |
| 4 | storage response | 200 — الكائن موجود |
| 5 | verify object | 40/40 موجود |
| 6 | bind operation | فشل |
| 7 | bind response | `Error: resource_insert_failed` (مسجَّل في أخطاء التشغيل) |
| 8 | lesson_resources row | 0 |
| 9 | is_primary | لا ينطبق |
| 10 | PRIMARY_CONTENT capability | غير موجودة |
| 11 | STUDENT_READY | false للأربعين |

سبب فشل 6–7 (مثبت من القاعدة): المُشغِّل
`trg_validate_lesson_resource_metadata` → `validate_lesson_resource_metadata()`
يمتلك قائمة بيضاء لمفاتيح `metadata` هي:
`resource_format, local_asset_path, thumbnail_url, is_interactive, attribution,
license_note, notes, is_primary`.

بينما عقد 18D يكتب: `source, bucket, path, file_name, file_size, uploaded_at,
version` ⇒ `RAISE EXCEPTION 'unsupported lesson_resources.metadata key: %'`
بكود `23514` عند كل INSERT، فيُترجمها الخادم إلى `resource_insert_failed`.

---

## PHASE E — SERVER RUNTIME AUDIT

`src/lib/api/lesson-pdf.functions.ts` = `createServerFn` (TanStack Start) مع
`requireSupabaseAuth`، و`src/lib/lessons/lesson-pdf-upload.server.ts` يُستورد
ديناميكياً داخل الـ handler. الاستدعاء وصل فعلاً إلى الخادم ونفّذ الـ INSERT
(الدليل: خطأ قادم من مُشغِّل قاعدة البيانات وليس من العميل).

**SERVER_RUNTIME_ACTIVE = YES** ⇒ ليس `INVALID_SERVER_RUNTIME_ASSUMPTION`.

---

## PHASE F — AUTH / ROLE / GRANTS

- `is_content_staff` = صحيح (لولاه لظهر `forbidden` قبل الرفع).
- `SIGNED_URL_CREATE = ALLOW` (تمت 40 مرة).
- `PRIVATE_STORAGE_UPLOAD = ALLOW` (40 كائناً في bucket خاص).
- `BIND_PRIMARY_RESOURCE = BLOCKED_BY_DB_TRIGGER` — لا 401/403 ولا 42501 ولا
  رفض RLS؛ الرفض `23514` (CHECK/trigger). **لا توسعة صلاحيات مطلوبة.**

---

## PHASE G — BULK UI FALSE SUCCESS DEFECT (مُصلَح في الكود)

العيب: الحلقة كانت تزيد العداد بعد كل ملف وتعرض `done/total`، فبدا الاكتمال
نجاحاً. المُطبَّق الآن في `BulkLessonPdfUploadPanel.tsx`:

- مراحل صريحة لكل ملف: `MATCHED → SIGNED_URL_CREATED/STORAGE_VERIFIED →
  RESOURCE_BOUND → PRIMARY_VERIFIED → SUCCESS`.
- لا يُحتسب الملف ناجحاً إلا بعد استعلام تحقق فعلي (`getLessonPrimaryPdfState`)
  يُثبت وجود مورد أساسي مُدار.
- عرض منفصل: معالَج / مؤكَّد الربط / فشل الربط / بانتظار الربط.
- رسالة النجاح لا تظهر إطلاقاً عند وجود أي فشل، وكل فشل يحمل اسم المرحلة.

---

## PHASE H — ORPHAN / RETRY STRATEGY (مُطبَّق في الكود)

- أُضيف `findUploadedLessonPdf` (خادم) و`findUploadedLessonPdfObject`
  (server function) لاكتشاف الكائن المرفوع مسبقاً.
- التنفيذ الجماعي صار **RETRY_BIND_EXISTING_OBJECT**: إذا وُجد كائن بنفس الحجم
  يُعاد الربط فقط دون إعادة رفع البايتات.
- لا حذف تلقائي لأي كائن.

`RETRY_BIND_AVAILABLE = YES`

---

## PHASE I / J / K — مؤجّلة

محجوبة بقرار PHASE A (`INCORRECT_SECTION_AS_UNIT`) وبالإصلاح الجذري المعلّق.
عند التفويض: تصحيح الوحدات أولاً، ثم Pilot لملف واحد، ثم Resume Plan:
40 ملفاً كلها في خانة **BIND ONLY** (مرفوعة وغير مربوطة) — صفر إعادة رفع.

---

## الإصلاح الجذري (معلّق، لم يُطبَّق)

`supabase/migrations-pending/20260820010000_lesson_resource_upload_metadata_keys_18e1.sql`
— يوسّع القائمة البيضاء لتشمل مفاتيح عقد 18D فقط. لا يمس أي بيانات.

---

## السجل النهائي

```
QURAN_UNIT_MODEL        = INCORRECT_SECTION_AS_UNIT
UNITS_COUNT             = 6
UNITS_OFFICIAL          = 0
UNIT_CORRECTION_REQUIRED= YES (unit_id -> NULL, no lesson delete)
PDF_EXPECTED            = 40
STORAGE_OBJECT_COUNT    = 40
LESSON_RESOURCES_COUNT  = 0
SIGNED_UPLOAD           = PASS
BYTE_UPLOAD             = PASS
STORAGE_VERIFY          = PASS
BIND_STEP               = FAIL (resource_insert_failed / 23514)
PRIMARY_VERIFY          = FAIL (0/40)
SERVER_RUNTIME          = ACTIVE (YES)
ROLE_GUARD              = PASS (is_content_staff)
STORAGE_RLS             = PASS
ROOT_CAUSE              = LESSON_RESOURCE_METADATA_WHITELIST_REJECTS_18D_KEYS
BULK_UI_FALSE_SUCCESS   = CONFIRMED -> FIXED
ORPHAN_OBJECTS          = 40 UNBOUND (0 غير معروف، 0 مكرر)
RETRY_BIND_AVAILABLE    = YES
PILOT                   = NOT_STARTED (blocked by PHASE A + pending migration)
BULK_RESUME_PLAN        = 40 x BIND_ONLY
MIGRATION_REQUIRED      = YES (1: metadata whitelist) + (1: unit correction)
SHARED_DB_WRITES        = NONE
BLOCKERS                = B1 unit model correction, B2 metadata whitelist migration
```

**TAMKEEN_QURAN_18E_PDF_UPLOAD_BIND_AND_UNIT_MODEL_DIAGNOSTIC_18E1 =
PASS_READY_FOR_RECOVERY** (مشروط بتفويض الترحيلين أعلاه).
