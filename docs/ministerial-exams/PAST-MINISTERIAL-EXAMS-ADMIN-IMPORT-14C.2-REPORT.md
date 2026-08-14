# PAST_MINISTERIAL_EXAMS_ADMIN_IMPORT_14C.2 — REPORT

المرحلة: **Implementation + Pending Migration + Admin Workflow + Isolated PG17/E2E**.
التاريخ: 2026-08-14.
المرجع الإلزامي: `PAST-MINISTERIAL-EXAMS-ADMIN-IMPORT-14C.1.md` (العقد المعتمد)، 14A، 14B، TCS-2، محرك الاستيراد الحالي، بنك الأسئلة الحالي.

**لم يُطبَّق أي شيء على القاعدة المشتركة. لا بيانات إنتاجية، لا نموذج وزاري حقيقي، لا بيانات وهمية، لا واجهة طالب، لا نشر فعلي.**

---

## 1) إغلاق الـ Blockers الستة

| BLOCKER_ID | 14C.1_DECISION | IMPLEMENTATION | TEST | STATUS |
|---|---|---|---|---|
| **B-1** نشر مفتوح لأي `is_content_staff` | قدرة نشر منفصلة | `PUBLISH_MINISTERIAL_MODEL` أُضيفت إلى `question_bank_capability_grants`؛ `can_publish_ministerial_exams()` جديدة؛ `publish_ministerial_model()` أُعيدت كتابتها لتفرضها Server-side ولم تعد تستدعي `is_content_staff` إطلاقاً | PG17: «publish body does not trust is_content_staff»، «PUBLISH_MINISTERIAL_MODEL capability registered»؛ vitest B-1 | **CLOSED** |
| **B-2** Parity على `question_id` فقط | Parity على مستوى النسخة | `can_publish_ministerial_model()` تتحقق الآن من: ارتباط مادة/مسار نشط، `template.mode='ministry'` + `is_active` + تطابق المادة، تساوي المجموعتين، وأن كل عضوية = `questions.current_published_revision_id` وحالتها `PUBLISHED` وهدفها يطابق مادة النموذج | vitest B-2؛ PG17 apply | **CLOSED** |
| **B-3** DML مباشر من العميل | RPC-ONLY WRITES | `REVOKE INSERT/UPDATE/DELETE` من `authenticated` على الجدولين + جدول التجهيز؛ سياسات `FOR ALL` أُبدلت بسياسات `FOR SELECT` فقط؛ طبقة العميل `ministerial-admin.client.ts` لا تحوي أي `.from().insert/update/delete` | PG17: 4 فحوص امتيازات؛ vitest B-3 | **CLOSED** |
| **B-4** غياب `model_label` وحقول M02 | إضافة الأعمدة | `ministerial_exam_models.model_label/archived_at/archived_by`؛ `ministerial_exam_questions.original_question_number/section_code/source_page/source_reference` + فهرس تفرد `(model_id, sort_order)` | PG17: «M02 metadata columns present»، «model_label present»، «duplicate display order blocked» | **CLOSED** |
| **B-5** لا Unpublish/Archive | RPC + حالة `archived` | `ministerial_model_set_status(model, 'draft'\|'archived', reason)` بقدرة النشر، سبب إلزامي، ومنع إلغاء النشر عند وجود جلسات (الأرشفة بديلاً) + audit | PG17: «archived status allowed»؛ vitest B-5 | **CLOSED** |
| **B-6** لبس ترتيب كود `mex` | اعتماد ترتيب `tcs2.ts` | `ministerial_build_model_code()` في SQL و`buildMinisterialModelCode()` في TS يولّدان نفس الصيغة حرفياً: `mex-{gradeShort}-{trackCode}-{subjectNo}-{year}-{round}-{variant}` | PG17: «mex code TCS-2 order»؛ vitest B-6 + تطابق TS/SQL | **CLOSED** |

**Hard Gates:** A (تضييق النشر) ✅، B (تثبيت النسخة الدقيق) ✅، C (الكتابة عبر RPC فقط) ✅.

---

## 2) ما تم تنفيذه

### Migration (pending، غير مطبّقة)
`supabase/migrations-pending/20260814030000_ministerial_admin_import_14c.sql` — ملف واحد يحتوي فقط ما يلزم لإغلاق الـ Blockers:
أعمدة إضافية، قدرة النشر، جدول `ministerial_import_prepares`، مولّد الكود، RPCs الستة لـ M01/M02، RPCs إزالة العضوية، تشديد بوابة النشر، `set_status`، سحب صلاحيات DML، وRPC قراءة إدارية `ministerial_models_admin_list`.

### M01 — النماذج
`ministerial_m01_prepare(jsonb)` / `ministerial_m01_execute(uuid)`.
تحقق: وجود المادة، وجود المسار ونشاطه، ارتباط `subject_curriculum_tracks` نشط، صلاحية السنة/الدور/الـ variant، رفض TCS-1، منع التكرار داخل الملف، وNatural key.
التنفيذ: إنشاء `exam_templates(mode='ministry')` + `ministerial_exam_models(status='draft')`. **لا نشر تلقائي.** تحديث آمن لـ `model_label` فقط؛ أي نموذج غير مسودة يُحجب بـ `MODEL_IDENTITY_IMMUTABLE`.

### M02 — عضوية الأسئلة
`ministerial_m02_prepare(jsonb)` / `ministerial_m02_execute(uuid)`.
- رفض فوري لأي عمود ممنوع (`question_text`, `options`, `correct_answer`, `correct_index`, `explanation`, `solution`, …) على مستوى الملف كله.
- الحل: `question_code → question_id → current_published_revision_id` مع فحص `PUBLISHED` وتطابق المادة و`question_targets`.
- **Additive**: غياب سؤال من ملف جديد لا يحذف عضويته أبداً.
- يكتب العضوية و`exam_template_questions` معاً للحفاظ على Parity.

### EXACT_REVISION_PINNING
Prepare يخزّن `pinned_revision_id` لكل صف داخل `staged_rows` مع بصمة، وصلاحية 60 دقيقة.
Execute يمر بمرحلتين: **Pass 1 حارس الانحراف** قبل أي كتابة — أي اختلاف بين النسخة المثبّتة والنسخة المنشورة الحالية، أو خروج النسخة من `PUBLISHED`، أو اختلال الهدف، يرفع `MINISTERIAL_REVISION_CHANGED_REPREPARE` (fail closed، معاملة كاملة تتراجع). لا استبدال صامت بـ R4.

### إزالة العضوية
`ministerial_membership_remove_preview` + `..._execute(reason)`: تتطلب قدرة النشر، سبباً إلزامياً، مسودة فقط، ومنع الإزالة عند وجود جلسات، مع تسجيل audit.

### Admin UI
`/admin/ministerial-exams` (`src/routes/_authenticated/admin.ministerial-exams.tsx`) — قسم مستقل عن `/admin/import`، مضاف للشريط الجانبي ولمسارات `content_manager`:
- مولّد سياقي: صف → مادة → مسار (**تظهر فقط المسارات المرتبطة فعلياً بالمادة عبر `subject_curriculum_tracks.is_active`**) → سنة → دور → variant، ويولّد كود `mex` تلقائياً (لا كتابة يدوية) مع تحميل M01/M02 مُهيّأين.
- استيراد M01/M02: فحص وتجهيز ← معاينة ← تنفيذ.
- قائمة النماذج بفلاتر: الصف، المادة، المسار، السنة، الدور، الحالة، وعدد الأسئلة.
- إجراءات: نشر (معطّل ما لم تُرجع البوابة `can_publish=true`، والقرار النهائي في الخادم)، أرشفة. **لا حذف مباشر.**
- المادة المشتركة تظهر مرة واحدة، ونماذج صنعاء/عدن منفصلة تماماً.

### Preview
M01: المادة، المسار، السنة/الدور، الـ variant، كود النموذج، والإجراء INSERT/UPDATE/SKIP/BLOCKED مع السبب بالعربية.
M02: الصف، كود السؤال، `question_id`، **النسخة المثبَّتة**، الرقم الأصلي، الدرجة، الترتيب، والإجراء.
**لا يعرض أي محتوى سؤال أو إجابة.**

---

## 3) مصفوفة الصلاحيات المنفَّذة

| العملية | content_manager | حامل `PUBLISH_MINISTERIAL_MODEL` | full admin | student | anon |
|---|---|---|---|---|---|
| عرض النماذج (طاقم) | ✅ | ✅ | ✅ | ❌ | ❌ |
| M01/M02 Prepare/Execute | ✅ | ✅ | ✅ | ❌ | ❌ |
| Publish | ❌ | ✅ | ✅ | ❌ | ❌ |
| Unpublish/Archive | ❌ | ✅ | ✅ | ❌ | ❌ |
| إزالة عضوية | ❌ | ✅ | ✅ | ❌ | ❌ |
| قراءة العضوية مباشرة | ✅ (قراءة فقط) | ✅ | ✅ | ❌ | ❌ |
| DML مباشر على الجداول الوزارية | ❌ | ❌ | ❌ | ❌ | ❌ |

`is_content_staff` لم يُوسَّع، و`content_manager` لم تُمنح أي صلاحية نشر ضمنية.

---

## 4) نتائج PG17 / E2E (عنقود معزول قابل للحذف)

`bash tests/import/run-pg17-ministerial-admin-import-14c-rehearsal.sh`

```
سلسلة الترحيلات حتى 13 → 14B → 14C.2 → 14C.2 مرة ثانية (idempotency)  OK
smoke fixture: 18/18 PASS
RESULT: 14C.2 REHEARSAL = PASS
```
الفحوص المغطاة: ترتيب كود TCS-2، رفض TCS-1، اختلاف نموذج صنعاء عن عدن، منع `anon` من كل RPC حساس (prepare/execute/publish)، انعدام INSERT/UPDATE/DELETE لـ `authenticated` على الجداول الوزارية، انعدام SELECT لـ `anon` على العضوية، تسجيل قدرة النشر، خلو جسم `publish_ministerial_model` من `is_content_staff`، وجود جدول التجهيز وأعمدة M02 و`model_label`، فهرس تفرد ترتيب العرض، وحالة `archived`.

منطق الأدوار المتبقي (content_manager publish = DENY، publisher = ALLOW، student writes = DENY، drift R3→R4 = DENY_REPREPARE، exact replay = SKIP) مفروض في الكود ومُغطّى ثابتاً في vitest؛ تنفيذه الحيّ داخل جلسات JWT حقيقية يُغلق في بروفة ما بعد التطبيق (14C.3) لأن البروفة المعزولة بلا `auth.uid()`.

---

## 5) اختبارات الكود

```
vitest tests/import/ministerial-admin-import-14c.test.ts   19/19 PASS
vitest tests/import (كل ملفات vitest)                       79/79 PASS
bun run test:import-contract                               60/60 PASS
bun run test:question-bank-source                          37/37 PASS
bun run test:question-bank-hash                            12 golden vectors OK
tsgo --noEmit                                              نظيف
```

---

## 6) المخرجات

```
BLOCKERS_6_CLOSED           = YES (B-1..B-6)
MIGRATION_FILE              = supabase/migrations-pending/20260814030000_ministerial_admin_import_14c.sql
M01_IMPLEMENTED             = YES (prepare + execute، Draft فقط)
M02_IMPLEMENTED             = YES (ربط نسخ منشورة فقط، أعمدة الإجابات مرفوضة)
RPC_ONLY_WRITES             = YES (DML مسحوب من authenticated؛ سياسات SELECT فقط)
PUBLISH_CAPABILITY          = PUBLISH_MINISTERIAL_MODEL (منفصلة، مفروضة Server-side)
EXACT_REVISION_PINNING      = YES (pinned_revision_id داخل staged rows)
PREPARE_EXECUTE_DRIFT_GUARD = YES (MINISTERIAL_REVISION_CHANGED_REPREPARE، fail closed)
ADDITIVE_MEMBERSHIP         = YES (لا حذف بسبب الغياب من الملف)
REMOVAL_GUARD               = YES (preview + capability + draft-only + no-sessions + reason + audit)
ADMIN_UI                    = /admin/ministerial-exams (قسم مستقل، لا حذف مباشر)
ANSWER_LEAK                 = ZERO (لا محتوى/إجابة في القوالب أو المعاينة أو الـ audit)
ANON_EXECUTE                = 0 (REVOKE على كل دالة حساسة)
PG17                        = PASS (18/18)
REGRESSION                  = PASS (79 vitest + 60 import-contract + 37 QB + 12 hash vectors + typecheck)
SHARED_DB_APPLIED           = NO
```

## الحكم

```
PAST_MINISTERIAL_EXAMS_ADMIN_IMPORT_14C.2 = PASS_READY_FOR_APPLY
```

الخطوة التالية المقترحة: `14C.3` = تطبيق الترحيل على القاعدة المشتركة حرفياً + منح قدرة النشر لحساب معتمد + بروفة أدوار حيّة.
