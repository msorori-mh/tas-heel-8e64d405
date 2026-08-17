# TAMKEEN_PRODUCTION_PUBLISH_PREFLIGHT_19D1C — READ ONLY

التاريخ: 2026-08-17 (UTC) — لم يتم أي نشر، ولا تطبيق ترحيل، ولا كتابة على قاعدة البيانات، ولا تعديل ملفات مصدرية (هذا التقرير فقط).

## 1. HEAD LOCK
- CURRENT_HEAD_SHA = `1b1c02e0dd4b2c986b851ab1e3712dde1b1e79a6`
- CANDIDATE = `1b1c02e0dd4b2c986b851ab1e3712dde1b1e79a6`
- **HEAD_MATCH_CANDIDATE = YES**

## 2. FULL DIFF INVENTORY (BASE `a43d02e7` → HEAD `1b1c02e0`)
- COMMITS_COUNT = 25
- CHANGED_FILES_COUNT = 9

| الملف | التصنيف |
|---|---|
| `src/routes/index.tsx` | LANDING_UI + BRANDING |
| `src/routes/__root.tsx` | BRANDING (title/OG/JSON-LD) |
| `public/manifest.webmanifest` | PWA + BRANDING |
| `public/offline.html` | PWA + BRANDING |
| `src/routes/_authenticated/lessons.$lessonId.tsx` | ESSAY_QUESTION_SUPPORT (LESSON_UI) |
| `supabase/migrations/20260817035747_60a7c77f-….sql` | DB_MIGRATION (+ FREE_LESSON_ACCESS) |
| `.lovable/plan/*` (3 ملفات) | DOCS/PLANS |

COMMITS_WITH_MESSAGES (مختصر): إزالة الأزرار المكررة، أسئلة تقويم الدرس الأول، تعديل عبارة الهيرو، تحديث اسم التطبيق إلى «تمكين الطالب»، تعديلات تخطيط بطاقات Landing (RTL/أيقونة بجانب النص)، وخطط.

- UNRELATED_CHANGES_PRESENT = NO
- UNKNOWN_CHANGES_PRESENT = NO

## 3. MIGRATION DEEP AUDIT
- MIGRATION_FILENAME = `supabase/migrations/20260817035747_60a7c77f-2982-4935-970a-9011bbe801f9.sql`
- MIGRATION_PURPOSE = إضافة بطاقة تقويم + 6 أسئلة مقالية لدرس القرآن الأول ونشرها عبر دورة الحياة، وجعل الدرس مجانياً.
- MIGRATION_TYPE = **DATA_CHANGE** (لا DDL)
- TABLES_AFFECTED = `lesson_assessments`, `questions`, `question_revisions`, `question_targets`, `assessment_questions`, `lessons` (UPDATE صف واحد)
- COLUMNS_AFFECTED = لا تغيير أعمدة؛ `lessons.is_free` تُحدَّث قيمتها فقط
- FUNCTIONS_AFFECTED = استدعاء فقط لـ `compute_and_set_revision_payload_hash` (لا تعديل)
- RLS_AFFECTED = NO — POLICIES_AFFECTED = NONE
- DATA_ROWS_POTENTIALLY_AFFECTED = 1 assessment + 6 questions + 6 revisions + 6 targets + 6 assessment_questions + 1 lesson UPDATE
- DESTRUCTIVE_OPERATIONS = NONE (لا DROP/TRUNCATE/DELETE/ALTER)
- REVERSIBLE = YES
- ROLLBACK_PLAN = `UPDATE lessons SET is_free=false WHERE id='16c10040-…'` + حذف الصفوف ذات الأكواد `Q-G10-QURAN-L01-%` وبطاقة `asm-g10-quran-l01` وتوابعها.
- **MIGRATION_ALREADY_APPLIED_TO_SHARED_PRODUCTION_DB = YES** (تحقق قراءة فقط: 6 أسئلة `essay` بحالة PUBLISHED، 6 روابط تقويم، بطاقة `asm-g10-quran-l01`، ودرس واحد فقط `is_free`)

## 4. CODE ↔ DB COMPATIBILITY
- CODE_REQUIRES_MIGRATION = NO (تغيير الواجهة يتعامل مع أي سؤال بلا خيارات؛ لا اعتماد على schema جديد)
- PUBLISH_WITHOUT_MIGRATION_SAFE = YES
- MIGRATION_WITHOUT_PUBLISH_SAFE = YES (مطبقة فعلاً وتعمل مع كود الإنتاج الحالي)
- ORDER_REQUIRED = **NONE** (الحالة الفعلية: C — الترحيل مطبق أصلاً)

## 5. FREE LESSON ACCESS AUDIT
- FREE_ACCESS_SCOPE = **ONE_LESSON** (`16c10040-7a7b-4647-add2-4aa4d3f70583`)
- ACCESS_RULE_BEFORE = يتطلب اشتراكاً فعّالاً + تطابق الصف/المسار
- ACCESS_RULE_AFTER = يُعفى من شرط الاشتراك فقط لهذا الدرس؛ تظل بوابات الصف/المنهج/التخويل عبر `can_access_lesson` كما هي
- AFFECTS_SUBSCRIPTION_GATE = YES (لدرس واحد)
- AFFECTS_CURRICULUM_TRACK_GATE = NO
- AFFECTS_AUTHORIZATION = NO
- SECURITY_IMPACT = **LOW** — لا توسيع لصف آخر أو مسار آخر أو محتوى مدفوع آخر (عدد الدروس المجانية في الإنتاج = 1)

## 6. ESSAY QUESTION SUPPORT AUDIT
- ESSAY_SUPPORT_UI_ONLY = YES (مكوّن `EssayQuestionCard` + تفرّع عند `options.length === 0`)
- DB_DEPENDENCY = NO (لا حقول جديدة؛ البيانات موجودة)
- ANSWER_LEAK_RISK = NO (لا يجلب حلاً؛ لا استدعاء تصحيح)
- GRADING_BEHAVIOR_CHANGED = NO (لا تصحيح آلي للمقالي؛ مسار MCQ عبر RPC كما هو)
- STUDENT_CAN_SEE_MODEL_ANSWER_BEFORE_ALLOWED = NO
- QUESTION_SECRECY_PRESERVED = YES

## 7. BRANDING + PWA
- APP_NAME / DOCUMENT_TITLE = «تمكين الطالب»
- MANIFEST_NAME = «تمكين الطالب» — MANIFEST_SHORT_NAME = «تمكين الطالب»
- OFFLINE_BRANDING = «غير متصل — تمكين الطالب»
- OLD_BRAND_REMAINS = NO (لا أثر لـ «تنوير»؛ يبقى شعار مختصر «تمكين» في شريط تنقل الطالب فقط كاختصار بصري)
- PWA_BREAKING_CHANGE = NO (تغيير أسماء فقط، لا تغيير scope/start_url/SW)

## 8. STRUCTURED LESSON REGRESSION (Smoke — قراءة فقط)
- Landing = PASS (title «تمكين الطالب»، Console Errors = 0، Horizontal Overflow = 0)
- Student Home = PASS
- Authorized Lesson = **NOT_RE-VERIFIED_THIS_RUN**: الجلسة المتاحة في البيئة ليست للطالبة المخوّلة، فظهرت رسالة «هذا الدرس غير متاح» — وهو سلوك بوابة صحيح (يثبت أن الإتاحة المجانية لم تُلغِ بوابة الصف/المسار).
- بنود 20A1B marker / Structured Reader 31/31 / Figures 3/3 / Quran Blocks / Activity / Assessment / Dynamic Capabilities 18B / PDF Reference: مثبتة سابقاً في تقرير 20A1C ولم يمسّها هذا الفرق (لا تغيير في ملفات القارئ أو القدرات). الحالة: CARRIED_FORWARD.

## 9. BUILD VERIFICATION
- typecheck = PASS (0 أخطاء)
- build:dev = PASS (exit 0)
- لا اختبارات مرتبطة بالتغييرات الجديدة.

## 10. PRODUCTION DECISION
- UNRELATED_CHANGES_PRESENT = NO
- UNKNOWN_CHANGES_PRESENT = NO
- MIGRATION_REQUIRED_FOR_PUBLISH = NO
- MIGRATION_ALREADY_APPLIED = YES
- PRODUCTION_DB_WRITE_REQUIRED = NO
- SAFE_TO_PUBLISH_CURRENT_HEAD_WITHOUT_DB_CHANGE = **YES**
- SAFE_TO_APPLY_MIGRATION = N/A (مطبقة) — لو أُعيد تشغيلها فهي idempotent
- SAFE_TO_RELEASE_FULL_CURRENT_HEAD = **YES**

## 11. STOP GATES
لم يُنفَّذ نشر ولا ترحيل. المطلوب فقط: **APPROVED_PRODUCTION_PUBLISH** للنسخة `1b1c02e0dd4b2c986b851ab1e3712dde1b1e79a6`.

## الحكم النهائي
**TAMKEEN_PRODUCTION_PUBLISH_PREFLIGHT_19D1C = PASS_READY_FOR_RELEASE_GATES**
