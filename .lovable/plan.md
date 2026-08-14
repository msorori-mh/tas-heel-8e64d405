# PAST_MINISTERIAL_EXAMS_FOUNDATION_14B — DB Foundation + PG17 Rehearsal

المرجع الوحيد: `docs/ministerial-exams/PAST-MINISTERIAL-EXAMS-ARCHITECTURE-14A.md` (TCS-2).
النطاق: Schema + RPC/Guards + بروفة PG17 معزولة فقط. **لا Apply على القاعدة المشتركة، لا UI، لا بيانات.**

## نتائج الفحص الفعلي للقاعدة (تمت قراءتها الآن)

- `exam_templates`: يحوي `mode exam_mode` (يشمل `ministry`)، `subject_id/unit_id/lesson_id` (كلها nullable, ON DELETE SET NULL)، `code` مع unique جزئي + trigger `assert_natural_code_immutable`. صالح لإعادة الاستخدام كما قررت 14A.
- `exam_template_questions`: `(template_id, question_id)` unique، بلا حقول مصدر (رقم السؤال الأصلي/الصفحة) — لذا نحتاج جدول عضوية وزاري منفصل كما في 14A.
- `exam_sessions`: لا يحوي أي عمود وزاري؛ `template_id` NOT NULL؛ سياسات: قراءة المالك + إدارة الأدمن.
- `subject_curriculum_tracks(subject_id, curriculum_track_id, is_active)` = PK مركب، مع فهرس جزئي على النشط → مصدر بوابة الصلاحية.
- `question_targets`: بلا `curriculum_track_id` (مطابق للمطلوب)، يحوي `revision_id NOT NULL` + FK مركب `(revision_id, question_id)` + trigger immutability. القراءة محصورة بطاقم المحتوى.
- توقيعات مؤكدة: `can_access_subject(_subject_id uuid)`، `create_exam_session_with_snapshot(p_template_id uuid)`، `has_active_subscription(_user_id uuid)`، `is_content_staff(_user_id uuid)`، `qb_has_capability(p_user_id, p_capability)`.
- بنية البروفة المعزولة موجودة: `tests/import/run-pg17-*-rehearsal.sh` + `tests/import/fixtures/pg17-baseline-schema.sql` — سنتبع نفس النمط.

## ما سيُبنى

### 1) ملف Migration معلّق (لا يُطبَّق)
`supabase/migrations-pending/20260814020000_ministerial_exams_foundation_14b.sql`

**الجداول**
- `ministerial_exam_models`: `id`, `exam_template_id UNIQUE → exam_templates(id) ON DELETE RESTRICT`, `subject_id`, `curriculum_track_id`, `academic_year int`, `exam_round text`, `model_variant_code text`, `model_label text NULL`, `code text UNIQUE` (TCS-2: `mex-g12-001-2025-main`), `is_published bool default false`, `published_at`, `created_by`, timestamps.
  - `UNIQUE(subject_id, curriculum_track_id, academic_year, exam_round, model_variant_code)`
  - بلا `grade_id` (يُستنتج من Subject).
  - trigger: `code` immutable + `updated_at`.
- `ministerial_model_questions` (جدول العضوية الوحيد): `model_id`, `question_id`, `question_revision_id`, `original_question_number`, `section_code`, `marks numeric`, `source_page`, `source_reference`, `display_order`، مع FK مركب `(question_revision_id, question_id)` نحو `question_revisions`، و`UNIQUE(model_id, question_revision_id)` و`UNIQUE(model_id, display_order)`.
  - لا أعمدة إجابة/حل/تفسير إطلاقاً.

**عمود ربط الجلسة**
- `exam_sessions.ministerial_model_id uuid NULL → ministerial_exam_models(id)` + trigger يتحقق أن `session.template_id = model.exam_template_id` و`session.mode` متسق.

**الدوال (SECURITY DEFINER, `set search_path = public`)**
- `assert_ministerial_model_track_valid()` — بوابة MODEL_VALIDITY_GATE: ارتباط نشط في `subject_curriculum_tracks`، وإلا `MODEL_TRACK_NOT_ASSIGNED_TO_SUBJECT`. تعمل كـ trigger على INSERT/UPDATE وتُستدعى ثانيةً عند النشر.
- `assert_ministerial_question_publishable()` — trigger على جدول العضوية: النسخة `published` + وجود `question_targets` صالح + `target.subject_id = model.subject_id`. لا اشتراط مسار على الهدف.
- `ministerial_model_can_publish(p_model_id)` + `publish_ministerial_model(p_model_id)` — fail-closed: ارتباط مسار نشط، template صالح (`mode='ministry'`, `is_active`)، عضوية غير فارغة، كل نسخة منشورة، كل هدف مطابق للمادة.
- `student_can_access_ministerial_model(p_model_id)` — عزل الطالب: `profiles.curriculum_track_id = model.curriculum_track_id` **و** `can_access_subject(model.subject_id)`. Sanaa→Aden = DENY حتى لو المادة مشتركة.
- تعديل مسيطر عليه لبدء الجلسة الوزارية: wrapper `create_ministerial_exam_session(p_model_id)` يستدعي المنطق الحالي ثم يضبط `ministerial_model_id`، دون تغيير سلوك `create_exam_session_with_snapshot` للأوضاع الأخرى.

**RLS + GRANT**
- تفعيل RLS على الجدولين الجديدين.
- طلاب: SELECT على النماذج **المنشورة فقط** ضمن مسارهم (بدون أي وصول لبيانات إجابة؛ العضوية تكشف metadata مصدر فقط، والسؤال نفسه يمر عبر snapshot الجلسة).
- طاقم المحتوى/الأدمن: إدارة حسب `is_content_staff` / `is_full_admin` فقط، بلا توسيع صلاحيات عام.
- `GRANT SELECT` للـ`authenticated` فقط + `GRANT ALL` لـ`service_role`؛ **لا anon** ولا `EXECUTE` لـ`anon` على أي دالة جديدة (سحب صريح من PUBLIC).

### 2) بروفة PG17 معزولة
`tests/import/run-pg17-ministerial-foundation-14b-rehearsal.sh` + fixtures جديدة، تغطي حرفياً مصفوفة الحالات المطلوبة (ALLOW/DENY) بما فيها: المادة المشتركة على المسارين، اختلاف `model_variant_code`، تكرار المفتاح الطبيعي، أهداف خاطئة، نسخة غير منشورة، عزل الطالب، منع تسريب الإجابة، منع anon، وعدم تأثر جلسات الاختبار العادية وبنك الأسئلة.

### 3) Regression
تشغيل: اختبارات QB، اختبارات الاستيراد/العقد، حراس TCS-2، `tsgo` typecheck، والبناء إن توفر.

### 4) التقرير
`docs/ministerial-exams/PAST-MINISTERIAL-EXAMS-FOUNDATION-14B-REPORT.md` بالحقول المطلوبة كاملة مع `SHARED_DB_APPLIED=NO` وقرار `PASS_READY_FOR_APPLY / NEEDS_REVISION`.

## خارج النطاق
لا Apply على القاعدة المشتركة، لا محتوى وزاري حقيقي أو وهمي، لا UI، لا نشر فعلي، ولا قالب استيراد وزاري (يؤجَّل إلى 14C).
