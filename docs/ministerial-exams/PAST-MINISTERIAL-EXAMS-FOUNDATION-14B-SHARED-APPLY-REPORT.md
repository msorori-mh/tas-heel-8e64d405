# PAST_MINISTERIAL_EXAMS_FOUNDATION_14B_SHARED_APPLY — Report

التاريخ: 2026-08-14 (UTC)
المرحلة: تطبيق Foundation النماذج الوزارية على القاعدة المشتركة (DB فقط — لا UI، لا بيانات).

---

## 1. هوية النص المطبَّق

| البند | القيمة |
|---|---|
| الملف قبل النقل | `supabase/migrations-pending/20260814020000_ministerial_exams_foundation_14b.sql` |
| الملف بعد النقل | `supabase/migrations/20260814020000_ministerial_exams_foundation_14b.sql` |
| SHA-256 | `c9c803c4eb583df97ddc6c5aacf208dbc3a01e96028927c7b49f50f106f948fc` |
| الحجم | 25,624 بايت / 727 سطر |
| التطابق مع نسخة بروفة PG17 | مطابق حرفياً (نفس الـ SHA قبل وبعد التطبيق والنقل) |

تشديد لاحق منفصل (Post-apply hardening، لا يمس نص 14B):
`REVOKE ALL ON public.ministerial_exam_models, public.ministerial_exam_questions FROM anon;`

---

## 2. الحالة قبل التطبيق

| الجدول | العدد |
|---|---|
| subjects | 16 |
| units | 0 |
| lessons | 0 |
| questions | 0 |
| exam_templates | 0 |
| exam_sessions | 0 |
| ministerial_exam_models | N/A (الجدول غير موجود) |

توقيعات الدوال ذات العلاقة قبل التطبيق:

- `create_exam_session_with_snapshot(p_template_id uuid)`
- `can_access_subject(_subject_id uuid)`
- `has_active_subscription(_user_id uuid)`
- `qb_has_capability(p_user_id uuid, p_capability text)`

جميعها موجودة بنفس التواقيع بعد التطبيق (14B عدّل جسم `create_exam_session_with_snapshot` فقط بإضافة بوابة منع القوالب الوزارية، ولم يغيّر أي توقيع).

---

## 3. التحقق بعد التطبيق

### A) SCHEMA — MEX_SCHEMA = PASS
- `ministerial_exam_models` موجود ✔
- `ministerial_exam_questions` موجود ✔
- `exam_sessions.ministerial_model_id` موجود ✔ + فهرس `idx_exam_sessions_ministerial_model`
- 19 قيداً على الجدولين: PK/UNIQUE/FK/CHECK كاملة (template_id UNIQUE، model_code UNIQUE، natural_uk، year_positive، variant_not_empty، published_requires_meta، status_check، marks_check، model_question_uk).
- RLS مفعّل على الجدولين (`relrowsecurity = t`) ✔
- لا يوجد `grade_id` في جدول النموذج (لا تكرار للصف — الصف يُشتق من المادة) ✔
- Natural key = `UNIQUE (subject_id, curriculum_track_id, academic_year, round_code, variant_code)` ✔

### B) MODEL VALIDITY — MODEL_VALIDITY_GATE = PASS
- `trg_ministerial_model_validity_gate` يفرض وجود ربط نشط في `subject_curriculum_tracks`.
- الربط الناقص أو غير النشط ⇒ رفض (fail-closed) بخطأ `MODEL_VALIDITY_GATE`.
- `trg_ministerial_model_template_match` يفرض أن القالب `mode = 'ministry'` ولنفس المادة.
- المادة المشتركة (TCS-2) تسمح بنموذج صنعاء ونموذج عدن ككيانين مستقلين بفضل المفتاح الطبيعي المتضمن للمسار.

### C) SESSION SAFETY — GENERIC_MINISTRY_BYPASS = CLOSED
- `create_exam_session_with_snapshot` و `start_exam_session` كلاهما يستدعي `assert_exam_template_not_ministry_bypassed` ⇒ القوالب الوزارية DENY.
- القوالب العادية غير متأثرة (المسار القديم كما هو).
- الجلسات الوزارية تبدأ حصراً عبر `create_ministerial_exam_session(model_id)`.

### D) REVISION PINNING — EXACT_REVISION_PINNING = PASS
- العضوية تخزّن `published_revision_id` صراحة، ولقطة الجلسة تستخدم نفس المعرّف حرفياً في `exam_session_questions` و `exam_session_answers` مع `pin_mode = 'REVISION_PINNED'`.
- لا يوجد أي استعلام عن أحدث نسخة منشورة داخل مسار إنشاء الجلسة.

### E) TEMPLATE/MEMBERSHIP PARITY — TEMPLATE_MEMBERSHIP_PARITY = PASS
- `can_publish_ministerial_model` يشترط تساوي العدد + غياب أي Missing/Extra عبر EXCEPT في الاتجاهين.
- `publish_ministerial_model` يرفض النشر عند أي اختلاف (`MINISTERIAL_PUBLISH_GATE_FAILED`).

### F) ANSWER SECURITY
- ANSWER_LEAK = ZERO: لا يوجد أي عمود `correct_*` / `solution` / `explanation` / `answer` في الجدولين (استعلام أعمدة = 0 صف).
- STUDENT_DIRECT_MEMBERSHIP_READ = DENY: سياسة `ministerial_exam_questions` الوحيدة مقصورة على `is_content_staff(auth.uid())`.
- ANON_EXECUTE = ZERO: كل الدوال الـ13 ذات الصلة `has_function_privilege('anon', …) = false`.
- PUBLIC sensitive EXECUTE = ZERO (REVOKE من PUBLIC داخل الترحيل).
- anon table SELECT على الجدولين = false بعد تشديد ما بعد التطبيق.
- `question_targets` لم يُمس ويبقى مستقلاً عن المسار.

### G) TRACK ISOLATION — TRACK_ISOLATION = PASS
`create_ministerial_exam_session` يشترط:
1. `can_access_subject(model.subject_id)` (الصف + المنهج)، و
2. تطابق `profiles.curriculum_track_id` مع `model.curriculum_track_id`.

⇒ صنعاء→صنعاء ALLOW، صنعاء→عدن DENY، عدن→صنعاء DENY، حتى مع مادة مشتركة.

### H) DATA INTEGRITY
| البند | النتيجة |
|---|---|
| subjects | 16 → 16 (بدون تغيير) |
| lessons | 0 → 0 |
| questions | 0 → 0 |
| exam_templates | 0 → 0 |
| ministerial_exam_models rows | 0 |
| ministerial_exam_questions rows | 0 |
| REAL_MINISTERIAL_DATA_INSERTED | ZERO |
| CURRICULUM_DATA_CHANGED (بفعل الترحيل) | ZERO — الترحيل لا يحتوي أي عبارة INSERT/UPDATE على بيانات المنهج |

ملاحظة تشغيلية: أثناء نافذة التنفيذ ظهرت 21 صفاً جديداً في `units` جميعها بختم زمني واحد (`2026-08-14 19:12:33Z`) ناتجة عن نشاط استيراد للمشغّل متزامن مع التطبيق. الترحيل لا يكتب في `units` إطلاقاً، ولم يُمس محتوى يوسف.

### I) REGRESSION
| الفحص | النتيجة |
|---|---|
| 14B guards + QB tests + import contract + TCS-2 + 13C guards (vitest) | 60/60 PASS |
| مجموعات bun test (contract-01, readiness-02, slug-02b, staging-03, qb01) | 97/97 PASS |
| typecheck (`tsgo --noEmit`) | نظيف |
| ORDINARY_EXAMS_REGRESSION | PASS (مسار القوالب غير الوزارية دون تغيير سلوكي) |

---

## 4. الحكم النهائي

**PAST_MINISTERIAL_EXAMS_FOUNDATION_14B_SHARED_APPLY = PASS**

- MEX_SCHEMA = PASS
- MODEL_VALIDITY_GATE = PASS
- TRACK_ISOLATION = PASS
- GENERIC_MINISTRY_BYPASS = CLOSED
- EXACT_REVISION_PINNING = PASS
- TEMPLATE_MEMBERSHIP_PARITY = PASS
- STUDENT_DIRECT_MEMBERSHIP_READ = DENY
- ANSWER_LEAK = ZERO
- ANON_EXECUTE = ZERO
- ORDINARY_EXAMS_REGRESSION = PASS
- CURRICULUM_DATA_CHANGED = ZERO
- REAL_MINISTERIAL_DATA_INSERTED = ZERO
