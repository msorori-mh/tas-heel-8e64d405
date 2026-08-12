# IMPORT_STAGING_AND_EXECUTION_IMPLEMENTATION_03 — تقرير التنفيذ

الحالة: **مكتمل داخل المستودع — لم يُطبَّق أي Migration، لا كتابة إنتاجية، لا Publish.**

## 1. ملف الـ Migration

`supabase/migrations-pending/20260813010000_import_staging_and_execution_03.sql`

> ملاحظة موقع الملف: المنصّة تعامل `supabase/migrations/` كمجلد تنفيذ (أي ملف يوضع فيه يُطبَّق عبر أداة الترحيل). لأن المرحلة 03 تمنع التطبيق صراحةً، وُضع الملف في `supabase/migrations-pending/` بمحتواه النهائي، ليُنقل ويُطبَّق حرفياً عند فتح بوابة `NON_PROD_MIGRATION_APPLY_REVIEW`.

يحتوي:

| البند | التنفيذ |
|---|---|
| GAP-01 | `lesson_assessments.assessment_code` + `lesson_assessments_code_uniq` (عام) + trigger تطبيع مفعّل |
| GAP-02 | `lesson_explanations.explanation_code` + فريد لكل درس؛ `lesson_resources.resource_code` قائم مسبقاً. `sort_order` خارج الهوية |
| GAP-05 | `lesson_resources.metadata jsonb NOT NULL DEFAULT '{}'` + trigger allowlist **مفعّل** |
| GAP-03 | `content_review_state` مربوط بـ `content_hash` + trigger تصفير المراجعة **مفعّل** |
| Staging | `import_staging_rows` مع `row_hash` و`natural_key` و`planned_action` و`applied_action` والفهارس |
| State | `import_jobs.execution_state` + `staged_at` + `applied_at` مع CHECK |

## 2. الأمن (شروط 02B الإلزامية)

- **S3 (MEDIUM) مغلق**: قراءة Staging مقيدة بمالك الـ Job (`import_jobs.created_by = auth.uid()`) وسياسة منفصلة للأدمن الكامل.
- **S4 (MEDIUM) مغلق fail-closed**: trigger `assert_content_review_entity_exists` يتحقق من وجود الكيان لكل نوع صراحةً (بدون SQL ديناميكي) ويرفع استثناءً في `ELSE`؛ و6 triggers حذف تُزيل حالة المراجعة عند حذف الكيان فلا تبقى حالة يتيمة.
- **S5 (LOW) مغلق**: لا يوجد أي trigger معلّق؛ اختبار ثابت يفشل عند وجود `-- CREATE TRIGGER`.
- **لا GRANT لـ anon** في أي سطر. `authenticated` يحصل على `SELECT` فقط على `import_staging_rows` و`content_review_state`؛ كل تعديل يمر عبر RPC.
- كل دالة `SECURITY DEFINER` تحمل `SET search_path = public, pg_temp`، و`REVOKE EXECUTE ... FROM PUBLIC, anon`.
- `content_review_state` لا يقبل كتابة مباشرة إطلاقاً — حتى للأدمن — والمسار الوحيد هو `content_review_set_state` (نشر يتطلب موافقة مسبقة).

## 3. الذرّية والتزامن

- الذرّية داخل قاعدة البيانات: `import_execute_template(job, template)` = استدعاء واحد = معاملة واحدة. أي استثناء داخل الحلقة يُرجع كل كتابات القالب.
- العدّادات تُحدَّث بعد نهاية الحلقة فقط، داخل المعاملة نفسها.
- التزامن: `assert_import_job_operator()` ينفّذ `SELECT ... FOR UPDATE` على الـ Job ويرفض التحويلات غير الصالحة (`INVALID_STATE_TRANSITION`) وغير المالك (`NOT_JOB_OWNER`).
- إعادة التحقق إلزامية داخل المعاملة: كل المراجع (subject/lesson/unit) تُحل من جديد من الـ payload ولا يُوثق بمخرجات dry-run.

## 4. الفصل بين المراحل

```
validate (dry-run)  → صفر كتابة   (content-import-dry-run.functions.ts)
prepare  (stage)    → import_jobs + import_staging_rows فقط
execute             → كتابات المحتوى داخل معاملة لكل قالب
```

`prepareContentImportStaging` يعيد التحليل والتحقق على الخادم ثم يستدعي `import_stage_rows` فقط.

## 5. Idempotency و BLOCKED_PUBLISHED

`import_plan_row_action()` هو المكان الوحيد الذي يقرر:

```
لا مطابقة                → INSERT
نفس المفتاح + نفس الهاش  → SKIP
مسودة + هاش مختلف        → UPDATE_DRAFT
منشور + هاش مختلف        → BLOCKED_PUBLISHED (يُبلَّغ ولا يُطبَّق)
```

القرار يسبق أي كتابة محتوى، ويُسجَّل في `import_staging_rows.applied_action`.

## 6. حدود بنك الأسئلة (قالب 09)

`import_execute_template` يرفض `questions` بـ `QUESTION_BANK_WORKFLOW_REQUIRED`، ولا يوجد في الـ Migration أي `INSERT/UPDATE` على `public.questions`. الحدّ موثّق صراحةً في `QUESTION_BANK_BOUNDARY`: **لا تُدّعى ذرّية مشتركة** بين استيراد بنك الأسئلة واستيراد المحتوى؛ هما وحدتا عمل منفصلتان. `assessment_questions` تربط أسئلة موجودة فقط.

## 7. الكود المضاف

- `src/lib/import/import-execution-state.ts` — آلة الحالة، أسماء الـ RPC، حدود بنك الأسئلة، نطاق الكتابة لكل مرحلة.
- `src/lib/import/import-row-hash.ts` — التطبيع، المفتاح الطبيعي، هاش الصف، كشف التكرار داخل نفس الـ Job.
- `src/lib/import/import-staging.server.ts` — بناء صفوف Staging، `stageContentImportRows`, `executeContentImport`, ترتيب القوالب حسب التبعية.
- `src/lib/import/import-staging.functions.ts` — `prepareContentImportStaging`, `runContentImportExecute` (كلاهما خلف `requireContentStaffAuth`).

واجهة `/admin/import` لم تُربط بأزرار prepare/execute بعد لأن الـ RPCs غير مطبَّقة؛ الربط يتم بعد بوابة التطبيق.

## 8. الاختبارات

`tests/import/import-staging-execution-03.test.ts` — 25 اختباراً، والحزمة الكاملة `npm run test:import-contract` = **60/60 PASS**، typecheck = PASS.

يغطي: منع الـ triggers المعلّقة، غياب anon، REVOKE على PUBLIC/anon، `search_path` ثابت، SELECT-only على الجداول المحكومة بـ RPC، عزل الملكية، fail-closed للمرجع متعدد الأشكال، الأعمدة والفهارس، مطابقة allowlist، قفل التزامن، أسبقية BLOCKED_PUBLISHED، توقيت العدّادات، غياب أي كتابة عامة على الأسئلة، صفرية كتابة dry-run، فصل prepare عن كتابات المحتوى، آلة الحالة، وثبات الهاش والمفاتيح الطبيعية ومنع تكرار المفتاح الطبيعي.

## بوابة الخروج

```
Migration reviewed            ✔ (NOT applied)
dry-run remains zero-write    ✔
staging separated             ✔
triggers ACTIVE               ✔
RLS/GRANT hardened            ✔
RPC-only mutations            ✔
fixed search_path             ✔
polymorphic refs fail-closed  ✔
staging ownership isolation   ✔
concurrency locking           ✔
atomic rollback (in-DB)       ✔
idempotency                   ✔
BLOCKED_PUBLISHED             ✔
Question Bank workflow        ✔ (حدود موثقة، بلا ادعاء ذرّية مشتركة)
MEDIUM ×2 + LOW ×1            ✔ مغلقة
tests / typecheck             ✔ 60/60 PASS
CRITICAL / HIGH               0 / 0
= READY_FOR_NON_PROD_MIGRATION_APPLY_REVIEW
```
