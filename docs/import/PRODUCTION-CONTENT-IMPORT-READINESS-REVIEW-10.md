# PRODUCTION_CONTENT_IMPORT_READINESS_REVIEW_10

- **التاريخ:** 2026-08-13
- **الحالة:** مراجعة قراءة فقط — **ZERO DB WRITES**، لا migrations، لا نشر محتوى.
- **المدخل:** `CONTENT_AND_QUESTION_UNIFIED_OPERATIONAL_E2E_09 = PASS (40/40)`.

```text
DATABASE_CLASSIFICATION = SHARED_PRODUCTION_DATASTORE
STAGE_10_DB_WRITES      = NONE (verified: read-only queries only)
STAGE_10_MIGRATIONS     = NONE
CONTENT_PUBLISH         = NONE
```

---

## 1. حقيقة البيئة (CONFIRMED)

المشروع يعمل على **قاعدة Lovable Cloud واحدة** تخدم المعاينة والموقع المنشور معاً. لا توجد
قاعدة Non-Prod منفصلة. لذلك:

- كل ما نُفِّذ في المراحل 03–09 نُفِّذ فعلياً على **قاعدة الإنتاج**.
- أي كتابة قادمة من واجهة المعاينة — حتى بمحتوى `draft` — هي كتابة إنتاجية.
- التوصيف الصحيح للـ schema هو: `SCHEMA_ALREADY_PRESENT_ON_SHARED_PRODUCTION_DB`،
  وليس «migrations جاهزة للنقل إلى الإنتاج». لا يوجد نقل، ولا إعادة تطبيق.

---

## 2. جرد الـ Schema المطبق (APPLIED — لا يُعاد تطبيقه)

| Migration | الدور | الحالة |
|---|---|---|
| `20260606004917_*` | جذر المحتوى + `assessment_questions` + trigger `validate_assessment_question_link` | APPLIED |
| `20260703121000_content_manager_rbac_policies` | رتبة `content_manager` وسياساتها | APPLIED |
| `20260705160000` / `20260720120000` | بوابات المحتوى المجاني وتشديدها | APPLIED |
| `20260731120000_exam_answers_postgrest_leak_hardening` | منع تسريب الإجابات | APPLIED |
| `20260731180000_restrict_units_select_to_authenticated` | إغلاق قراءة `units` للزائر | APPLIED |
| `20260801120000_qb01_question_bank_schema_foundation` | بنك الأسئلة: revisions / targets / options / solutions / capabilities / publish RPC | APPLIED |
| `20260806050000` … `20260809010000` | سلسلة content HTML + `resource_code` boundary | APPLIED |
| `20260812234007`, `20260813000329`, `20260813004255…005253` | staging + execute RPCs، توجيه القالب 09، أقفال، تنظيف e2e | APPLIED |
| `20260813010000_import_staging_and_execution_03` | أساس staging/execute (المرحلة 03 المصححة 04A) | APPLIED |

`supabase/migrations-pending/` لم يعد يحمل أي migration بانتظار التطبيق.

---

## 3. Baseline Snapshot (قبل أول دفعة حقيقية)

| الجدول | العدد |
|---|---|
| `subjects` | 30 |
| `units` | 6 |
| `lessons` | 10 |
| `lesson_book_contents` | 6 |
| `lesson_resources` | 0 |
| `lesson_explanations` | 0 |
| `lesson_assessments` | 0 |
| `assessment_questions` | 0 |
| `questions` (legacy roots) | 14 |
| `question_revisions` | 0 |
| `question_targets` | 0 |
| `question_options` | 0 |
| `import_jobs` | 29 (`completed` / `failed` فقط، لا job عالق) |
| `import_staging_rows` | 130 |
| `import_errors` | 0 |
| `grades` / `governorates` / `curriculum_tracks` | 3 / 22 / 3 |
| `profiles` | 18 |
| `question_bank_runtime_config.attempt_pin_mode` | `LEGACY` |

---

## 4. بقايا الـ e2e

| الفحص | النتيجة |
|---|---|
| `subjects` بأكواد/أسماء e2e | 0 |
| `units` e2e | 0 |
| `lessons` e2e | 0 |
| `questions` بكود e2e | 0 |
| `question_revisions` / `question_targets` / `assessment_questions` | 0 |
| `import_jobs` | 29 — **محفوظة عمداً (سجل تدقيق)** |
| `import_staging_rows` بمفاتيح `e2e-*` | **130 — بقايا staging** |

**DOMAIN RESIDUE = ZERO.** لا صف محتوى واحد من الـ e2e باقٍ في جداول المجال.

**ملاحظة صريحة (R-1):** `import_staging_rows` ما زالت تحمل 130 صفاً مرتبطة بمهام
`e2e-u9-*` و`e2e-qi-*`. هذه ليست محتوى مرئياً للطالب وهي جزء من أثر الـ jobs
(RLS: مشغّلو الاستيراد فقط)، لكنها ضجيج تشغيلي. **القرار الموصى به:** إبقاؤها
كأثر تدقيق مصاحب لـ `import_jobs`، أو تنظيفها لاحقاً بقرار مالك مستقل — لا تُلمس
في المرحلة 10 لأنها كتابة بيانات.

---

## 5. Backup / Rollback (النسخة المصححة)

الحذف العكسي بأكواد الدفعة **غير كافٍ وحده**: فهو يصلح للإدراجات الجديدة فقط، ولا يعيد
الحالة السابقة عند `UPDATE_DRAFT` أو تغيير targets أو `content_review_state`.

الإجراء الملزم قبل كل دفعة حقيقية:

1. **Baseline counts** لكل جدول يمسّه القالب.
2. **Logical snapshot** للصفوف المتأثرة: تصدير `SELECT *` (JSON) لكل صف سيُحدَّث،
   مطابَقاً بالمفتاح الطبيعي المستخرج من ملف الدفعة قبل التنفيذ.
3. تنفيذ الدفعة بمهمة `import_jobs` واحدة، وتسجيل `job_id` في سجل التشغيل.
4. **Rollback:**
   - صفوف `INSERT` → حذف عكسي بالأكواد.
   - صفوف `UPDATE_DRAFT` → إعادة القيم من الـ logical snapshot.
   - القالب الفاشل نفسه لا يحتاج rollback (الذرّية per-template تضمن عدم تطبيقه جزئياً).
   - القوالب السابقة الناجحة تُرجَّع يدوياً بالخطوتين أعلاه فقط عند قرار إلغاء الدفعة كاملة.
5. لا rollback على `import_jobs` / `import_errors` — سجل التدقيق يبقى.

---

## 6. حدود الدفعات والمراقبة

```text
MAX_ROWS_PER_TEMPLATE_PER_BATCH = 200   (أول 3 دفعات: 50)
MAX_FILE_BYTES                  = 5 MB
CONCURRENT_IMPORT_JOBS          = 1     (لا تشغيل متوازٍ إطلاقاً)
QUESTIONS_TEMPLATE_09           = محظور حتى إغلاق G-1
PUBLISH                         = محظور في كل الدفعات الأولى
```

مراقبة بعد كل دفعة: `import_jobs` بحالة غير نهائية، عدد `failed`، `import_errors`،
وفرق العدّادات مقابل الـ baseline.

---

## 7. مصفوفة صلاحيات المشغلين

| الصلاحية | العدد الحالي | المسموح |
|---|---|---|
| `admin` | 1 | dry-run + prepare + execute |
| `content_manager` | 1 | dry-run + prepare + execute (قوالب المحتوى) |
| `question_bank_capability_grants` (نشر/مراجعة) | 0 | لا أحد يملك صلاحية نشر مراجعة سؤال حالياً |
| `anon` | — | لا شيء |

النشر مغلق فعلياً بحكم غياب أي capability grant — وهذا متسق مع منع النشر في هذه المرحلة.

---

## 8. قرار G-1 (معتمَد تصميمياً)

```text
G-1 ARCHITECTURE     = TARGETS-BASED
LEGACY ROOT BINDING  = REJECTED
```

### الوضع المؤكد بالكود

- `qb_import_ingest_revision` ينشئ جذر السؤال كـ identity shell بلا `lesson_id` / `subject_id`.
- `qb_sync_question_legacy` ما زالت stub (`NULL;`) في `20260801120000` و`20260813002731`.
- `validate_assessment_question_link` يقرأ `questions.lesson_id` / `questions.subject_id`
  فقط، فيرفض الربط بسؤال مستورد. هذا fail-closed صحيح.
- `question_targets` **لا يحتوي `revision_id`** اليوم: أعمدته
  `question_id, target_type, subject_id, unit_id, lesson_id, is_primary`.

### العقد المعتمد

```text
Draft question              → لا ربط بأي تقييم
Published question          → يُسمح بالربط فقط عبر target
                              يخص النسخة المنشورة الحالية
Draft/new-revision targets  → لا تؤثر على الربط
publish_question_revision   → يفعّل targets النسخة المنشورة ذرياً
assessment link validation  → published revision + active target match
answer protections          → دون تغيير
```

النقطة الحرجة المضافة: **الوجهة يجب أن تكون قابلة للإثبات على مستوى المراجعة**. لا يكفي
`current_published_revision_id IS NOT NULL`، لأن القالب 09 قد يضيف وجهة أثناء وجود
Draft على سؤال منشور سابقاً، فتصبح الوجهة الجديدة صالحة فوراً دون نشر.

خياران مقبولان للتنفيذ في المرحلة 11 (يُحسم عند التصميم التفصيلي):

- **T-A (مفضّل):** إضافة `question_targets.revision_id` والتحقق من
  `target.revision_id = question.current_published_revision_id`.
- **T-B:** حالة تفعيل (`activated_revision_id` / `is_active`) تُرقّى ذرياً داخل
  `publish_question_revision`، بحيث تُنشَّط وجهات النسخة المنشورة فقط.

كلاهما يمنع تسرب وجهات المسودة، ولا يكتب أي عمود legacy في `public.questions`.

**مرفوض:** تعبئة `questions.lesson_id/subject_id` عند النشر — يعيد ازدواج الهوية ويناقض
نموذج revisions/targets.

---

## 9. بوابة الخروج

| البند | الحالة |
|---|---|
| Shared production datastore fact | CONFIRMED |
| Applied schema inventory | COMPLETE |
| e2e domain residue | ZERO (مع ملاحظة R-1 على staging) |
| import_jobs audit history | RETAINED (29) |
| Baseline snapshot | COMPLETE |
| Logical backup/restore procedure | READY |
| Operator/capability matrix | READY |
| Batch limits + concurrency policy | READY |
| First real batch checklist | READY (`FIRST-PRODUCTION-BATCH-CHECKLIST-10.md`) |
| G-1 targets-based architecture | APPROVED |
| Target/revision binding semantics | EXPLICIT (T-A / T-B) |
| ZERO DB WRITES during stage 10 | VERIFIED |

```text
PRODUCTION_CONTENT_IMPORT_READINESS_REVIEW_10 = PASS
NEXT = G1_PUBLISHED_REVISION_TARGET_BINDING_11
```
