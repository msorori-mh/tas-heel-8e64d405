# SEC-PURGE-GUARD-11B + FIRST_REAL_CONTENT_BATCH_12

## الجزء أ — تشديد ثم حذف دالة التنظيف (قبل أي محتوى حقيقي)

الدالة `qb_e2e_purge_questions` قادرة على تعطيل Triggers مؤقتاً، وتجربة 11A أثبتت أن Supabase قد تعيد منح `anon` صلاحية تنفيذ الدوال المعاد إنشاؤها. لذلك: نشدّدها، نثبت أن الحارس يعمل، ثم نحذفها قبل الدفعة.

### أ-1: ترحيل التشديد
إعادة تعريف الدالة بحيث:
- ترفض أي بادئة لا تبدأ بـ `e2e-` (قائم) **وأيضاً** ترفض إذا كانت البادئة أقصر من `e2e-` أو تحتوي محارف بدل (`%` أو `_`) — لمنع `e2e-%` من التحول إلى مسح واسع.
- فحص ما قبل الحذف: إذا وُجد أي صف ضمن المجموعة المستهدفة كوده لا يبدأ بـ `e2e-` → إجهاض.
- تسجيل سطر في `audit_logs` عند كل استدعاء (البادئة، عدد الصفوف، المنفّذ، الوقت) قبل الحذف وبعده.
- `REVOKE ALL FROM PUBLIC, anon, authenticated` و`GRANT EXECUTE TO service_role` فقط، مع `REVOKE` صريح يوضع بعد `CREATE OR REPLACE` في نفس الترحيل.

### أ-2: اختبار الحارس (على القاعدة المشتركة، قراءة/استدعاء فقط)
| # | الفحص | المتوقع |
| --- | --- | --- |
| G1 | استدعاء بعميل `anon` | permission denied |
| G2 | استدعاء بعميل طالب مسجل (authenticated) | permission denied |
| G3 | استدعاء بـ `service_role` ببادئة `prod-` | `E2E_PREFIX_REQUIRED` |
| G4 | استدعاء ببادئة تحتوي `%` | رفض |
| G5 | استدعاء بـ `e2e-` والقاعدة نظيفة | 0 وبدون أي حذف |
| G6 | `audit_logs` يحتوي سطر كل استدعاء ناجح | نعم |
| G7 | جدول ACL للدالة | `service_role` فقط |

### أ-3: الحذف النهائي
ترحيل `DROP FUNCTION public.qb_e2e_purge_questions(text)`، ثم إثبات `0 rows` في `pg_proc`.
يُحدَّث `tests/e2e/content-import/qb-e2e-teardown.ts` ليعمل بالمسار الاحتياطي فقط (حذف مباشر بـ service_role)، مع ملاحظة موثقة: أي E2E مستقبلي يحتاج نسخاً منشورة على القاعدة المشتركة يجب أن يعيد إنشاء الدالة بترحيل مؤقت ثم يحذفها في نفس الجلسة.

**بوابة أ:** `PURGE_FUNCTION_ABSENT = YES`، `ANON/AUTH EXECUTE = DENIED`، `AUDIT = PRESENT (لسجل الاختبار)`.

---

## الجزء ب — FIRST_REAL_CONTENT_BATCH_12

### ب-0: نتيجة الجرد الفعلي للقاعدة (تم الآن، قراءة فقط)

لا توجد اليوم مادة حقيقية مكتملة تصلح كمرشح. الجرد الكامل:

| المادة (code) | الوحدات | الدروس | محتوى الكتاب | شرح | موارد | تقييم |
| --- | --- | --- | --- | --- | --- | --- |
| `physics-g3-sanaa-grade-12-sanaa` (الفيزياء – ثالث ثانوي) | 1 | 3 | 3 | 0 | 0 | 0 |
| `math-g1-sanaa-grade-10-sanaa` (الرياضيات – أول ثانوي) | 1 | 3 | 3 | 0 | 0 | 0 |
| `biology-grade-12-all` (الأحياء) | 1 | 1 | 0 | 0 | 0 | 0 |
| `quran-grade-12-all` (القرآن) | 1 | 1 | 0 | 0 | 0 | 0 |
| `QA_C01_C02_SUBJECT` | 2 | 2 | 0 | 0 | 0 | 0 | 

`lesson_explanations` = 0، `lesson_resources` = 0، `lesson_assessments` = 0 على مستوى القاعدة كلها. الباقي مواد بلا وحدات ولا دروس (هياكل بذور).

**الاستنتاج:** الدفعة 12 ليست «اختيار مادة قائمة»، بل **إدخال أول مادة حقيقية جديدة** من ملفاتك. لذلك أكواد المادة/الوحدة/الدرس ستأتي من ملفاتك أنت، ولن أخترعها — سأستخرجها من الملفات في خطوة المعاينة وأعرضها للاعتماد قبل أي كتابة.

الأكواد الأبوية المتاحة فعلياً في القاعدة لبناء الملفات:
- مسارات المناهج: `sanaa` / `aden` / `other`
- الصفوف: `grade-10` / `grade-11` / `grade-12`

### ب-1: هوية الدفعة
```text
Batch Code : PROD-B12-20260813-01
Job slug   : prod-b12-20260813-01
Templates  : subjects, units, lessons, lesson_contents(book+explanation), resources, assessments
Questions  : NO
Auto publish: NO
```

### ب-2: التسلسل التنفيذي

| # | الخطوة | من ينفذ | المخرج |
| --- | --- | --- | --- |
| 1 | تثبيت Batch Code | معتمد | أعلاه |
| 2 | Logical snapshot: تصدير CSV لكل صف قد يتأثر (subjects/units/lessons/contents/resources/assessments + review state) قبل أي كتابة | أنا | ملفات snapshot موثقة في التقرير |
| 3 | Baseline counts لكل جدول | أنا | جدول أرقام |
| 4 | Validate: ترفع الملفات في `/admin/import` وتشغّل الفحص لكل قالب | أنت + أنا | صفر أخطاء |
| 5 | Prepare (staging) | أنت | job id + preparedHash |
| 6 | **بوابة اعتماد:** أعرض عليك Batch Code + `subject_code` + `unit_code` + `lesson_code` + أسماءها + عدد الصفوف المتوقع لكل قالب + قائمة planned actions (INSERT/UPDATE/SKIP) — ولا كتابة قبل موافقتك | أنا | جدول المعاينة |
| 7 | Execute مرة واحدة فقط | أنت | executed = عدد القوالب |
| 8 | تحقق Admin: الشجرة كاملة، `content_review_state` = pending/draft، لا نشر تلقائي | أنا | فحوصات SQL |
| 9 | تحقق طالب حقيقي: القوائم + الدرس بالمعرّف + RPC المحتوى → لا شيء ظاهر | أنا | zero exposure |
| 10 | إعادة نفس الملفات حرفياً → كل الصفوف SKIPPED، صفر revisions/صفوف جديدة | أنت + أنا | idempotency |
| 11 | مراجعة `import_jobs`: حالة نهائية، صفر عالق في `applying` | أنا | جدول |
| 12 | تقرير الإغلاق `docs/import/FIRST-REAL-CONTENT-BATCH-12.md` | أنا | تقرير |

### ب-3: قاعدة الأمان أثناء التنفيذ
- لا أنفذ أنا أي `INSERT/UPDATE` على جداول المحتوى؛ كل الكتابة تمر حصراً عبر مسار الاستيراد المعتمد من لوحة التحكم بحسابك.
- عند أي `UNEXPECTED UPDATE` (تحديث صف خارج نطاق الدفعة) نتوقف فوراً ونستخدم الـsnapshot للتراجع اليدوي الموثق.

### ب-4: بوابة النجاح
```text
VALIDATION               PASS
PLANNED DOMAIN CHANGES   EXPECTED ONLY
EXECUTION                PASS
UNEXPECTED UPDATES       ZERO
DRAFT STUDENT EXPOSURE   ZERO
EXACT REPLAY             ALL SKIPPED
IMPORT JOBS STUCK        ZERO
ROLLBACK SNAPSHOT        VERIFIED
```

## ملاحظات تقنية
- تحذيرات اللينتر الـ120 مسجّلة كـBaseline قديم خارج نطاق الاستيراد/QB، ولم ينتج عن 11A أي CRITICAL/HIGH جديد — غير مانعة.
- الجزء أ يتم بترحيلين (تشديد ثم حذف) لأن أدوات الترحيل هي المسار الوحيد لتغيير الدوال.
- الجزء ب لا يتضمن أي ترحيل: مسار الاستيراد وRPCs جاهزة منذ المراحل 01–11A.
