# CURRICULUM_CONTENT_ENTRY_READINESS_13 — تقرير الإغلاق

الوضع: **CONTENT_ENTRY_OPERATOR_READY = YES**
CURRICULUM DATA WRITES = 0 · PRODUCTION CONTENT INSERT = 0 · NEW MIGRATION APPLIED = 0

## بوابة الإغلاق

| البند | النتيجة | الدليل |
| --- | --- | --- |
| SUBJECT_AS_BRANCH OPERATIONAL | PASS | `subject_code` يُحدد عند الإنشاء ثم يقفل (`assert_natural_code_immutable`)؛ `group_code` يُقبل من NULL ثم يقفل (`assert_subject_group_code_immutable`)؛ `group_name` قابل للتعديل مع تحقق التناسق (`assert_subject_group_name_consistent`) وأخطاء عربية في `SubjectEditDialog`. |
| SAFE ADMIN CRUD | PASS | كل مسارات الحذف تمر بـ `CurriculumDeleteDialog` → RPC `admin_curriculum_delete` مع معاينة الأثر ومنع الحذف عند وجود نشاط طالب. |
| DIRECT DELETE BYPASS ZERO | PASS | `tests/import/no-direct-curriculum-delete.test.ts` — 3/3 PASS، صفر استدعاء `.from(<curriculum>).delete()` في `src/`. |
| CONTENT_MANAGER MATRIX VERIFIED | PASS | `docs/import/CONTENT-MANAGER-PERMISSION-MATRIX.md` مع نقطة الفرض لكل صف. |
| OFFICIAL 01–09 TEMPLATES | PASS | `public/content-import-templates/` (9 ملفات) + اختبارات `template-contract-sync-12a`. |
| DATA DICTIONARY / NAMING / OPERATOR GUIDE | PASS | `DATA-DICTIONARY-AR.md`، `NAMING-CONVENTION.md`، `OPERATOR-RUNBOOK-AR.md` (محدَّث ببوابة المراجعة والنشر). |
| IMPORT CENTER LEGACY UX CLOSED | PASS | حذف نصوص «قريباً» و POC؛ الصفحة أصبحت صفحة تشغيل. |
| TEMPLATE ORDER SINGLE SOURCE | PASS | شريط الخطوات مشتق من `IMPORT_EXECUTION_ORDER` عبر `CONTENT_IMPORT_WORKFLOW_STEPS`. |
| سجل العمليات كامل | PASS | القالب، الملف، الصفوف، مُدرج، مُحدّث، متجاوَز، محجوب، أخطاء، الحالة، المشغّل، التاريخ. |
| TESTS / TYPECHECK | PASS | tsgo نظيف؛ 60 اختبار node + 26 اختبار vitest. |

## ما أُضيف في هذه المرحلة

- تحقق fail-closed في المعاينة: `GROUP_NAME_REQUIRED` و `GROUP_NAME_CONFLICT` لقالب المواد.
- رسائل عربية لحُرّاس قاعدة البيانات في حوار تعديل المادة.
- اختبار «صفر مسار حذف مباشر» على كل كيانات المنهج.
- شريط ترتيب الاستيراد الرسمي (01→07 ← مراجعة ← نشر ← 09 → 08) في مركز الاستيراد.
- حزمة المشغّل الرسمية: `public/operator-pack/tamkeen-content-operator-pack.zip` (9 قوالب + 3 أدلة) وزر تحميلها، وتُبنى بـ `node scripts/build-operator-pack.mjs`.
- مصفوفة صلاحيات `content_manager`.

## ملاحظة على الترحيل المعلق

`supabase/migrations-pending/20260814020000_content_entry_readiness_13.sql` (دعم حقول التجميع في `import_execute_template`) **لم يُطبَّق** — بقي معلقاً وفق قاعدة NEW MIGRATION = NOT EXPECTED. يُطبَّق بإشارة صريحة قبل أول دفعة محتوى حقيقية تستخدم `group_code` عبر القالب 01.

---

## CONTENT_ENTRY_GROUP_IMPORT_BINDING_13A — PASS

**Migration:** `supabase/migrations/20260814020000_content_entry_readiness_13.sql`
(moved out of `migrations-pending`; applied to the shared database).

### Pre-apply review (no CRITICAL / HIGH)
- Redefines `import_execute_template` only; no other object is dropped or rewritten.
- No curriculum data is written, deleted, or migrated.
- No RLS policy touched; no new grant to `anon` or `authenticated`
  (the tail only REVOKEs from PUBLIC/anon/authenticated and grants `service_role`).
- `SECURITY DEFINER` preserved; `SET search_path = public, pg_temp` preserved.
- `group_code` / `group_name` optional (`NULLIF(...,'')`); ungrouped subjects unaffected.
- Template 01 idempotency preserved (COALESCE-based, immutable `group_code`).
- Branches for templates 02–09 unchanged.

### PG17 isolated rehearsal — 18/18 PASS
`tests/import/run-pg17-group-import-binding-13a-rehearsal.sh`

| Check | Result |
|---|---|
| SECURITY DEFINER preserved | PASS |
| search_path fixed | PASS |
| anon EXECUTE not granted | PASS |
| group binding present in body | PASS |
| subject without group | PASS |
| grouped subject | PASS |
| same group + same group_name | PASS |
| same group + different group_name (fail-closed) | PASS |
| group_code immutable on replay | PASS |
| ungrouped subject untouched | PASS |
| templates 02–09 branch regression (8 branches) | PASS |

### Post-apply structural verification (shared DB, read-only)
- signature `import_execute_template(uuid, text)` — correct
- `prosecdef = true` — preserved
- `proconfig = {search_path=public, pg_temp}` — fixed
- `anon` EXECUTE = false — zero exposure
- `authenticated` EXECUTE = true (pre-existing, operator path gated by `assert_import_job_operator`)
- `service_role` EXECUTE = true
- curriculum row counts before/after: subjects 0/0, units 0/0, lessons 0/0, questions 0/0 — unchanged

### Gate
```
GROUP IMPORT EXECUTION                PASS
GROUP CONSISTENCY FAIL-CLOSED         PASS
UNGROUPED SUBJECT IMPORT              PASS
TEMPLATE 01 IDEMPOTENCY               PASS
02–09 REGRESSION                      PASS
RLS / GRANTS                          PASS
ANON EXPOSURE                         ZERO
CURRICULUM DATA WRITES                ZERO
TESTS (60 node / 26 vitest) / TYPECHECK  PASS

CONTENT_ENTRY_GROUP_IMPORT_BINDING_13A = PASS
CONTENT_ENTRY_OPERATOR_READY           = YES
```
