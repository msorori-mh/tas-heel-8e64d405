# TAMKEEN_OFFICIAL_STRUCTURED_CONTENT_DB_BINDING_20A1C_PREFLIGHT

**READ-ONLY PREFLIGHT — لم تُنفَّذ أي عملية كتابة (لا INSERT / UPDATE / DELETE / Migration / Storage / RLS / Publish).**

---

## 1. الدرس الفعلي (RESOLVE REAL LESSON)

```
LESSON_ID     = 16c10040-7a7b-4647-add2-4aa4d3f70583
LESSON_CODE   = lesson-g10-001-001        (lessons.slug — لا يوجد عمود lesson_code في المخطط)
LESSON_TITLE  = مكانة القرآن الكريم وكمال قدرة الله
SUBJECT_ID    = 1234e882-b0b2-499a-bd66-f91f480e1081  (القرآن الكريم، subjects.slug = sub-g10-001)
GRADE         = الصف الأول الثانوي
UNIT_ID       = NULL (درس مرتبط بالمادة مباشرة — مدعوم بالمخطط)
DELIVERY_MODE = external_resource
IS_FREE       = false
TRACK_BINDING = subjects.curriculum_track_id = NULL،
                والربط الفعلي عبر subject_curriculum_tracks = { aden, sanaa }
                ⇒ الدرس مرئي لمسار Aden (وأيضاً Sanaa) — مطابق للطالبة المخوّلة.
```

لم يُخمَّن أي معرّف؛ كل القيم من استعلام قراءة مباشر.

## 2. صف المحتوى الحالي (lesson_book_contents)

```
ROW_EXISTS               = YES (صف واحد فقط — قيد UNIQUE(lesson_id))
ROW_ID                   = 188ff951-95d3-453a-b350-8c0a65d748ea
CURRENT_STATUS           = لا يوجد عمود status في الجدول (id, lesson_id, content, pdf_url, created_at, updated_at)
CURRENT_HTML_PRESENT     = NO — نص عادي بطول 95 حرفاً:
                           "الفصل الأول - أولاً الحفظ والتفسير - الدرس الأول - سورة السجدة: مراجعة الآيات الكريمة والدلالات"
CURRENT_STRUCTURED_MARKER= ABSENT
CURRENT_SOURCE_HASH      = ABSENT (لا يوجد عمود hash، ولا بصمة داخل النص)
CURRENT_PUBLISHED_STATE  = content_review_state لا يحتوي أي صف لهذا الكيان
                           (الموجود فقط: lessons=40 و subjects=16، جميعها draft/pending)
PDF_URL                  = https://drive.google.com/uc?export=download&id=1cb_MkmG-IwcCVcu__Am2RffiKvsXVBH1&filename=lesson.pdf
```

### السبب الدقيق لعدم ظهور القارئ البنيوي

`src/routes/_authenticated/lessons.$lessonId.tsx` يقرأ `lesson_book_contents.content` ثم يستدعي
`resolveStructuredDocument(bookContent)` من `src/lib/content/official-textbook/structured-blocks.ts`.
تلك الدالة تُرجع الحزمة **فقط** إذا احتوى النص على العلامة النصية:

```
TAMKEEN_STRUCTURED_PILOT:20A1B
```

`MISSING_BINDING_CAUSE = العلامة TAMKEEN_STRUCTURED_PILOT:20A1B غير موجودة داخل lesson_book_contents.content للصف 188ff951…`
لا ينقص شيء آخر: الحزمة والأصول والقارئ كلها داخل المستودع.

## 3. التحقق من الحزمة المعتمدة (20A1)

| البند | المتوقع | الفعلي في المستودع | النتيجة |
|---|---|---|---|
| SOURCE_PDF_SHA256 | e4474b4c…f2cd0d | e4474b4c5f044bf256b8bf443f26d310f794f746b9b80782fbe0580ab2f7cd0d | MATCH |
| STRUCTURED_BLOCKS | 31 | 31 | MATCH |
| QURAN_HUMAN_REVIEW | APPROVED | APPROVED | MATCH |
| FIGURES | 3 | 3 (b025-01, b027-01, b027-02) | MATCH |
| AUTO_PUBLISH | false | false | MATCH |
| approved.json sha256 | 926b0227…4b54a (manifest) | 926b022791f58bf885c2671f09a76e5a6ad71ec61d0ae7ce494506759754b54a | MATCH |

`APPROVED_PACKAGE_MATCH = YES`، `SOURCE_HASH_MATCH = YES`. لا حزمة أخرى مستخدمة.

## 4. المسار الرسمي للكتابة

المسارات المتاحة:

1. **Admin UI — `src/components/admin/LessonBookContentDialog.tsx`** (من `admin.lessons.$lessonId`):
   يقرأ الصف الواحد ثم ينفّذ `supabase.from("lesson_book_contents").update({ content }).eq("id", …)`
   عبر جلسة أدمن وسياسات RLS القائمة، ولا يمسّ `pdf_url`. ← **المسار الرسمي المختار**.
2. Template 04 `book_contents` (content import prepare/execute): يعمل بمفتاح طبيعي
   `(subject_code, lesson_code)` ويكتب `content` و`pdf_url`. صالح لكنه ثقيل ويطلب ملف Excel،
   وخطر تمرير `pdf_url` فارغ فيدهس المرجع الحالي.
3. RPC مخصص: غير موجود لهذا الجدول.

```
OFFICIAL_WRITE_PATH  = Admin UI → LessonBookContentDialog (UPDATE عبر Supabase client بجلسة أدمن)
DIRECT_SQL_REQUIRED  = NO
```

## 5. خطة الكتابة الحرفية (غير منفَّذة)

```
OPERATION     = UPDATE_EXISTING_ROW   (ممنوع INSERT — قيد UNIQUE(lesson_id) ولتفادي التكرار)
TARGET_TABLE  = public.lesson_book_contents
TARGET_ROW    = id = 188ff951-95d3-453a-b350-8c0a65d748ea
                (lesson_id = 16c10040-7a7b-4647-add2-4aa4d3f70583)
FIELDS_TO_CHANGE = content   (+ updated_at تلقائياً)
```

OLD_VALUES:
```
content = "الفصل الأول - أولاً الحفظ والتفسير - الدرس الأول - سورة السجدة: مراجعة الآيات الكريمة والدلالات"
pdf_url = https://drive.google.com/uc?export=download&id=1cb_MkmG-IwcCVcu__Am2RffiKvsXVBH1&filename=lesson.pdf
```

NEW_VALUES:
```
content = "الفصل الأول - أولاً الحفظ والتفسير - الدرس الأول - سورة السجدة: مراجعة الآيات الكريمة والدلالات
TAMKEEN_STRUCTURED_PILOT:20A1B"
pdf_url = بدون تغيير (لا يُمرَّر في العملية)
```

السطر الأصلي يبقى كما هو؛ يُضاف سطر العلامة فقط. لا يُخزَّن أي نص رسمي في قاعدة البيانات —
النص المعتمد يبقى في `approved.json` داخل المستودع (immutable, sha256 مثبت).

## 6. السلامة (SAFETY)

```
PDF_PRESERVED               = YES (pdf_url غير ممسوس؛ وlesson_resources غير ممسوسة)
LESSON_IDENTITY_UNCHANGED   = YES (لا كتابة في lessons)
CURRICULUM_TRACK_UNCHANGED  = YES (لا كتابة في subjects / subject_curriculum_tracks)
OFFICIAL_TEXT_UNCHANGED     = YES (المصدر ملف المستودع)
ASSETS_PRESERVED            = YES (لا Storage mutation)
QUESTIONS/ASSESSMENTS       = UNCHANGED
PUBLISH_STATE_CHANGE        = NO
MIGRATION_REQUIRED          = NO
RLS_RPC_CHANGE_REQUIRED     = NO
PRODUCTION_DATA_WRITE_REQUIRED = YES
```

**ملاحظة حاكمة (DRAFT/REVIEWABLE):** الجدول لا يملك حقل حالة، ولا يوجد صف
`content_review_state` لكيان `lesson_book_contents`؛ لذلك أي ربط يصبح مرئياً فوراً لأي طالب مخوّل
لهذه المادة. الاحتواء المتاح دون تغيير Schema:

- الدرس `is_free = false` ⇒ يتطلب اشتراكاً فعّالاً (نطاق التعرض محدود).
- المراجعة قبل الربط تتم على `/preview/structured-textbook-20a1b` (موجود، noindex).
- الربط قابل للتراجع فوراً بإزالة سطر العلامة الواحد (rollback بخطوة واحدة).

إن كان مطلوباً DRAFT حقيقي على مستوى القاعدة فهذا يحتاج Migration (المقترح المعلّق
`20260821010000_official_textbook_content_20a_proposal.sql`) — وهو خارج نطاق هذه المرحلة.

## 7. خطة ما بعد الكتابة

بعد الربط (بجلسة الطالبة المخوّلة على الدرس الحقيقي): 31/31 بلوك، 3/3 صور، بلوكات القرآن،
النشاط، التقويم، RTL، NO_HORIZONTAL_OVERFLOW على 390px و1440px، CONSOLE_ERRORS=ZERO،
قدرات 18B الديناميكية كما هي، ومرجع PDF ظاهر. ثم فقط يُعاد حكم 19D.

## 8. الخلاصة

```
LESSON_ID=16c10040-7a7b-4647-add2-4aa4d3f70583
LESSON_CODE=lesson-g10-001-001
ROW_EXISTS=YES
ROW_ID=188ff951-95d3-453a-b350-8c0a65d748ea
MISSING_BINDING_CAUSE=marker TAMKEEN_STRUCTURED_PILOT:20A1B absent from lesson_book_contents.content
APPROVED_PACKAGE_MATCH=YES
SOURCE_HASH_MATCH=YES
OFFICIAL_WRITE_PATH=Admin UI LessonBookContentDialog (UPDATE)
DIRECT_SQL_REQUIRED=NO
FIELDS_TO_CHANGE=content
PUBLISH_STATE_CHANGE=NO
PDF_PRESERVED=YES
ASSETS_PRESERVED=YES
MIGRATION_REQUIRED=NO
RLS_RPC_CHANGE_REQUIRED=NO
PRODUCTION_DATA_WRITE_REQUIRED=YES
READY_FOR_APPROVED_PRODUCTION_DATA_BIND=YES
```

**الحكم: TAMKEEN_OFFICIAL_STRUCTURED_CONTENT_DB_BINDING_20A1C_PREFLIGHT = PASS_READY_FOR_PRODUCTION_DATA_BIND_GATE**

متوقف عند `APPROVED_PRODUCTION_DATA_BIND` — لن تُنفَّذ أي كتابة قبل موافقتك الصريحة.
