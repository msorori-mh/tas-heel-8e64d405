# IMPORT_NON_PROD_MIGRATION_INDEPENDENT_REVIEW_04 — تقرير المراجعة المستقلة

الحالة: **مراجعة مكتملة على بيئة غير إنتاجية معزولة. لم يُطبَّق أي Migration على قاعدة البيانات المُدارة، ولا Publish.**

الملف قيد المراجعة: `supabase/migrations-pending/20260813010000_import_staging_and_execution_03.sql`

## 1. بيئة البروفة

عنقود PostgreSQL 17 محلي مؤقت (`initdb` داخل `/tmp`, يُدمَّر بعد التشغيل). المشغّل يرفض العمل عند وجود ربط بمشروع بعيد.

- `tests/import/fixtures/pg17-baseline-schema.sql` — نسخة مطابقة لشكل قاعدة البيانات المُدارة الحالي.
- `tests/import/fixtures/pg17-prereq-resource-code.sql` — دلتا `content_html` (resource_code) غير المطبَّقة.
- `tests/import/fixtures/pg17-runtime-smoke.sql` — 12 فحص سلوك تشغيلي.
- `tests/import/run-pg17-import-staging-03-apply-rehearsal.mjs` — المشغّل: **17/17 PASS**.

## 2. النتائج الحاكمة

| # | الفحص | النتيجة |
|---|---|---|
| A1–A2 | الترحيل يُطبَّق على الشكل الحالي بلا خطأ DDL | PASS |
| A3 | تنفيذ بلا مالك يُرفض قبل أي حلّ مراجع (fail-closed) | PASS |
| A4 | مسار `resources` ينكسر تشغيلياً بسبب غياب `lesson_resources.resource_code` | PASS (يثبت H-1) |
| B3–B4 | التطبيق على السلسلة الكاملة + إعادة التطبيق (idempotent) | PASS |
| B5 | الجداول، RLS مفعّل، لا سياسة كتابة، لا GRANT لـ anon، `search_path` ثابت، 6 triggers تنظيف | PASS |
| B6 | السلوك التشغيلي: إدراج، SKIP متكرر، BLOCKED_PUBLISHED، النشر للأدمن فقط، NOT_JOB_OWNER، تراجع ذرّي، allowlist الميتاداتا، منع الحالة اليتيمة، finalize | PASS |
| C1–C7 | إعادة بناء كاملة من الصفر بعد هدم المخطط | PASS |

## 3. الملاحظات المانعة للتطبيق (Blocking) — **أُغلقت لاحقاً في 04A**

> تحديث: انظر `docs/import/IMPORT-MIGRATION-BLOCKER-CORRECTION-04A.md`.
> H-1 أُغلق بجعل الترحيل مكتفياً ذاتياً + بوّابة fail-closed ضد عمود `code`.
> H-2 سُحب: القيد الفريد موجود فعلاً، والخلل كان انحراف fixture.

**H-1 — تبعية غير مطبَّقة (أُغلقت).**
الترحيل يكتب في `lesson_resources.resource_code`، والعمود غير موجود في قاعدة البيانات المُدارة لأن
`20260808060000_content_html_resource_contract_alignment.sql` و
`20260809010000_content_html_resource_code_boundary_hardening.sql` لم تُطبَّقا.
الأثر آنذاك: DDL ينجح، ثم ينكسر قالب 06 عند أول تنفيذ حقيقي (سيناريو A4).
المعالجة المعتمدة في 04A: الترحيل يُعلن العمود والمطبِّع والفهرس بنفسه، فلا يبقى ترتيب إلزامي.

**H-2 — `lessons` بلا فهرس فريد على `(subject_id, slug)` (سُحب — NOT_A_DEFECT).**
القيد `lessons_subject_id_slug_key` موجود في قاعدة البيانات المُدارة؛ نسخة البروفة كانت منحرفة عن الواقع.


## 4. الحكم

```
migration applies cleanly        ✔
re-appliable / idempotent        ✔
full rebuild from zero           ✔
RLS / GRANT / search_path        ✔ (لا anon، SELECT فقط، مسار RPC وحيد)
atomicity + rollback             ✔ (تحقق تشغيلي فعلي)
idempotency + BLOCKED_PUBLISHED  ✔
RBAC (owner / full admin)        ✔
question bank boundary           ✔
blocking findings                H-1 (أُغلق في 04A), H-2 (سُحب — NOT_A_DEFECT)
CRITICAL / HIGH in-file          0 / 0
= APPROVED_CONDITIONALLY — الشرطان أُغلقا في 04A؛ التطبيق يبقى غير منفَّذ
```

