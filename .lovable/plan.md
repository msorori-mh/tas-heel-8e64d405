# IMPORT_EXECUTION_READINESS_SECURITY_AND_SQL_REVIEW_02B

مرحلة **غير إنتاجية**: لا Migration مطبّق، لا كتابة في قاعدة البيانات، لا Publish. الهدف: تصحيح عقد اشتقاق الـslug، ومراجعة أمنية مستقلة لمسودة SQL/RLS/GRANT/Triggers، ثم إعادة تشغيل الاختبارات.

## 1. تصحيح عقد deriveSubjectSlug

الحالة الحالية (مؤكدة بالقراءة): `deriveSubjectSlug` يبني `<normalized>--<fnv1a64>` والتوثيق يصف ذلك بأنه "لا يمكن أن يتصادم" — وهذه دعوى غير صحيحة رياضياً لأي بصمة 64-bit.

التصحيح:

- استبدال FNV-1a بـ **SHA-256** (أول 16 خانة hex كلاحقة)، حتمي وبلا اعتماد على locale، عبر Web Crypto مع مسار مزامن نقي للاختبارات.
- إلغاء أي عبارة "impossible collision" من العقد والوثيقة، واستبدالها بالصياغة المعتمدة:
  ```text
  deterministic slug
  + UNIQUE(subjects.slug)
  + collision detection
  + fail closed on collision
  ```
- إضافة كود خطأ `SLUG_COLLISION` كـ **blocking**: عند اشتقاق slug يطابق slug موجود لـ`subject_code` مختلف، أو تصادم داخل نفس الدفعة، تُرفض الصفوف ولا يُكتب شيء (fail closed) — لا لاحقة تلقائية ولا تخمين.
- الاعتماد على القيد الحالي `subjects_slug_key` كخط الدفاع الأخير في قاعدة البيانات، وتوثيقه صراحةً في العقد.
- الاحتفاظ بمسار "slug-safe code يطابق نفسه" كما هو، مع بقاء الفرعين منفصلين عبر الفاصل المحجوز `--`.

## 2. مراجعة أمنية مستقلة لمسودة SQL

مراجعة `docs/migration-drafts/IMPORT-EXECUTION-READINESS-02.NOT_APPLIED.sql` بنداً بنداً، وتسجيل النتائج في تقرير مراجعة مخصص. نقاط الفحص:

- **GRANT**: كل جدول جديد (`content_review_state`, `import_staging_rows`) له GRANT صريح متوافق مع سياساته؛ لا GRANT لـ`anon`؛ `service_role` موجود.
- **RLS**: التأكد من أن سياسات القراءة مقيدة بـ`is_content_staff` والكتابة بـ`is_full_admin`، وأن `import_staging_rows` لا تكشف صفوف مهام مستخدمين آخرين دون داعٍ.
- **Triggers**: التحقق من أن `validate_lesson_resource_metadata` و`reset_review_state_on_hash_change` مضبوطتان بـ`SET search_path = public`، وأنهما معطّلتان (مُعلّقتان) في المسودة عمداً مع توثيق أن تفعيلهما شرط في المرحلة 03 — trigger معلّق يعني allowlist غير مُنفَّذة فعلياً.
- **content_review_state**: التحقق من أن الموافقة مرتبطة بـ`content_hash` وأن أي تغير في البصمة يعيد `pending + draft`، وأن لا مسار يسمح بتحديث `review_status` دون المرور بالـtrigger.
- **BLOCKED_PUBLISHED**: تتبع كل مسار كتابة محتمل والتأكد من عدم وجود bypass — الحالة تُحسم قبل أي domain write، ومغطاة باختبار حارس.
- **Atomicity / applying / failed**: تثبيت أن `applying → failed` لا يترك كتابات جزئية، وتحديد حدود المعاملة (transaction) لكل دفعة، وتوثيق أن `blocked` = لم تبدأ الكتابة و`failed` = بدأت وفشلت وتم rollback.

## 3. اختبارات الحراسة

- اختبار: أكواد مختلفة لا تشتق نفس الـslug؛ وعند التصادم المصطنع يجب أن يرفع `SLUG_COLLISION` ولا يُرجع slug.
- اختبار: العقد لا يحتوي أي ادعاء "impossible/never collide".
- اختبار: كل جدول في المسودة له GRANT + ENABLE RLS + سياسة واحدة على الأقل.
- اختبار: كل trigger في المسودة يحمل `SET search_path`.
- إعادة تشغيل `bun run test:import-contract` كاملة.

## المخرجات

1. `src/lib/import/import-contract.ts` — SHA-256، صياغة fail-closed، توثيق `UNIQUE(subjects.slug)`.
2. `src/lib/import/import-error-codes.ts` — `SLUG_COLLISION` كخطأ حاجب برسالة عربية.
3. `docs/migration-drafts/IMPORT-EXECUTION-READINESS-02.NOT_APPLIED.sql` — تعليقات مراجعة أمنية داخل المسودة عند الحاجة (تبقى NOT APPLIED وخارج `supabase/migrations/`).
4. `docs/import/IMPORT-EXECUTION-READINESS-02B-SECURITY-REVIEW.md` — تقرير المراجعة المستقلة بتصنيف CRITICAL/HIGH/MEDIUM/LOW.
5. تحديث `docs/import/IMPORT-CONTRACT-FINAL-01.md` بعقد الـslug المصحّح.
6. اختبارات جديدة في `tests/import/import-execution-readiness-02.test.ts`.

## بوابة الخروج

```text
slug contract CORRECTED (SHA-256 + UNIQUE + fail closed)
+ independent SQL/RLS/GRANT/trigger review DONE
+ ZERO CRITICAL / ZERO HIGH
+ no BLOCKED_PUBLISHED bypass
+ atomicity + applying/failed contract explicit
+ test:import-contract ALL PASS
= OPEN IMPORT_STAGING_AND_EXECUTION_IMPLEMENTATION_03
```

لا Migration مطبّق ولا Publish في هذه المرحلة.
