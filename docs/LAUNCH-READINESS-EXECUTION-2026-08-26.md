# LAUNCH-READINESS-EXECUTION-2026-08-26

## القرار التنفيذي الحالي

**HOLD للإطلاق العام، PASS للانتقال إلى مراحل الإغلاق أدناه.**

سبب HOLD ليس فشل البناء: الفرع الرئيسي `7ca6902b92498cc7b16bf2b37850f4bf8070b2a6` ناجح، والإنتاج العام يستجيب. المانع هو أن الإثبات الحالي يغطي البناء وعقد درس الحديد أكثر مما يغطي رحلة إطلاق كاملة بأدوار حقيقية، بيانات إنتاج، استعادة، مراقبة، وأجهزة جوال.

## خط الأساس الموثوق

- Repository: `msorori-mh/tas-heel-8e64d405`
- Production: `https://studentamkeen.com`
- Main SHA: `7ca6902b92498cc7b16bf2b37850f4bf8070b2a6`
- Web CI run: `32920403518` — success
- بوابات CI الناجحة: Typecheck/tests/build، Content V3 PG17، CF04–CF11 + RLS/idempotency PG17، Iron seven-capability Chromium.
- فحص الإنتاج العام: الصفحة الرئيسية والروابط العامة تعمل؛ الفحص المصدق بالأدوار يحتاج مرحلة مستقلة.
- GitHub issues المفتوحة: 0.
- PR مفتوح عالي المخاطر: #109، متأخر 42 commit عن main ويمس عقد template 01؛ لا يدمج دون إعادة بناء من main أو يغلق كـ superseded.

## الثوابت الحاكمة

1. لا كتابة إنتاجية قبل preflight وrollback وpost-verify.
2. لا حذف واسع ولا تعطيل triggers/RLS/FK.
3. لا تسريب للإجابات قبل محاولة الطالب.
4. عقد الدرس: خمسة HTML، قالبا Excel إلزاميان 09 و10، والمختبر/النشاط اختياري فقط.
5. `اختبر فهمك`: أربعة خيارات مكتملة بالضبط.
6. كل قالب 01–10 مرتبط باسم ورقة البيانات العربية المحدد ولا يقبل تخمين الورقة.
7. البيانات التجريبية موسومة ومعرفاتها محددة، ولا تمس المالية أو المستخدمين الحقيقيين.
8. RTL والجوال وحفظ حالة التبويبات جزء من معيار القبول.
9. Lovable خارج مسار التنفيذ؛ يستخدم فقط إذا تعذر النشر ببديل آخر.

## جرد المنجز

| المجال | الحالة | الدليل |
|---|---|---|
| الأساس العام وSSR/PWA | منجز تقنيًا | build + PWA policy |
| المصادقة والملف الشخصي واستعادة كلمة المرور | موجود | routes والعقود الحالية؛ يحتاج E2E إنتاجي |
| مناهج/مواد/كتب/وحدات/دروس | منجز معماريًا | migrations + PG17 |
| مركز الاستيراد 01–10 | منجز ومحصّن | PR #118 + اختبارات المصنفات |
| نشر الحزمة CF04–CF11 | منجز تقنيًا | PG17 full chain + idempotency |
| درس الحديد الذهبي | منجز | خمسة HTML + 09/10 + 4 خيارات + Chromium |
| عرض الطالب الأفقي | منجز | tabs responsive + حفظ حالة panels |
| HTML التفاعلي | منجز | CSP معزول، mindmap/lab، ارتفاع متكيف |
| أسئلة الكتاب واختبر فهمك | منجز | RPC/RLS وعدم تسرب الإجابة |
| التقدم والاختبارات والمراجعة | موجود | routes/tests الحالية؛ يحتاج مصفوفة E2E شاملة |
| RBAC/RLS | منجز كأساس | PG17 والعقود الأمنية؛ يحتاج تحقق أدوار حي |
| Android/Capacitor وoffline shell | موجود | source/static contracts؛ يحتاج build جهاز وإصدار مرشح |
| الصفحات القانونية العامة | موجودة | privacy/terms/data deletion/contact |

## الفجوات المثبتة أو غير المثبتة بعد

| ID | الفجوة | الشدة | بوابة الإغلاق |
|---|---|---:|---|
| G01 | PR #109 قديم ومتعارض محتملًا | عالية | إغلاق/استبدال مع توثيق |
| G02 | لا توجد مصفوفة E2E حية كاملة لكل الأدوار | حرجة | student/admin/content-staff auth E2E |
| G03 | لا يوجد snapshot حديث موثق لأعداد وسلامة بيانات الإنتاج | حرجة | read-only inventory قبل/بعد |
| G04 | النسخ الاحتياطي والاستعادة وRTO/RPO غير مثبتة في هذه الدورة | حرجة | restore rehearsal موثق |
| G05 | مراقبة الأخطاء والتنبيهات وrunbook الحوادث غير مثبتة | عالية | synthetic checks + alert test |
| G06 | CI الحالي لا يظهر lint/dependency/security audit كبوابة مستقلة | عالية | release workflow fail-closed |
| G07 | لا يوجد إثبات أداء/إتاحة وصول على الجوال الحقيقي لهذه النسخة | عالية | budgets + axe/Lighthouse + 4 viewports |
| G08 | Android release candidate/signing/store checklist غير مثبت | عالية | reproducible signed RC + smoke |
| G09 | تنظيف بقايا TEST_ONLY/QA وإغلاق قدرة purge قبل الإطلاق غير مثبت حديثًا | عالية | exact manifest + lock + zero residue |
| G10 | اختبارات بقية المسارات ليست مجمعة في release regression واحدة | عالية | suite موحدة auth/content/exam/progress/payments-safe |
| G11 | اكتمال المحتوى الفعلي لكل المواد والفصول ليس مساويًا لاكتمال المحرك | حرجة محتوى | coverage report 100% للنطاق المراد إطلاقه |
| G12 | خطة rollback للنشر وقاعدة البيانات غير مربوطة بإصدار مرشح | حرجة | tagged RC + rollback rehearsal |

## مراحل التنفيذ الثابتة

### Stage 0 — Baseline & Governance
- يغلق G01.
- ينشئ لوحة حقيقة واحدة، ويثبت SHA/CI/production.
- Exit: لا PR قديم قابل للدمج يعيد عقودًا سابقة.

### Stage 1 — Release Gate CI
- يضيف lint، dependency/security audit، route manifest diff، migration lint، اختبارات الوحدة والبناء وPG17 وChromium ضمن بوابة إصدار واحدة.
- Exit: فشل أي طبقة يمنع RC.

### Stage 2 — Production Read-only Preflight
- جرد migrations، RLS/RBAC، أعداد الكيانات، READY/REVIEW، orphan/duplicate، storage references، QA residue، answer exposure.
- Exit: تقرير صفر Critical، وثوابت موقعة بالأعداد.

### Stage 3 — Authenticated Role E2E
- طالب، content_staff، full_admin؛ happy path ورفض الصلاحيات وإعادة المحاولة.
- يشمل التسجيل/الدخول/استكمال الملف/استعادة الحساب.
- Exit: جميع السيناريوهات تعمل ولا يوجد privilege bleed.

### Stage 4 — Student Full Regression
- المواد، الوحدات، الدرس بتبويباته، HTML، mindmap لكل فرع، lab لكل زر، أسئلة الكتاب، self-test، progress، exams، mistakes، offline/retry.
- Exit: Chromium بأربعة أحجام + Android smoke، صفر console/network error مانع.

### Stage 5 — Content Factory Scale Rehearsal
- تمرير القوالب 01–10 الصحيحة والخاطئة، فصلان، مادتان، درس بلا مختبر وآخر به مختبر، replay/duplicate/rollback.
- Exit: atomic/idempotent، no partial publish، coverage صحيح لدى الطالب.

### Stage 6 — Security, Privacy, Reliability
- تحقق RLS حي، CSP، rate limits، secrets/client bundle، dependency audit، data deletion، backups/restore، incident runbooks.
- Exit: zero Critical/High مفتوح؛ استعادة ناجحة.

### Stage 7 — Performance, Accessibility, Mobile RC
- budgets للأداء والحجم، RTL، keyboard/ARIA، screen-reader basics، شبكات بطيئة، Android build/signing/update.
- Exit: budgets ناجحة وRC قابل للتكرار.

### Stage 8 — Content & Operational Launch
- تقرير اكتمال المحتوى، تدريب الفريق، قوالب versioned، support/runbooks، analytics/alerts، TEST_ONLY cleanup، قفل purge.
- Exit: 100% من محتوى نطاق الإطلاق READY، لا بقايا اختبارية.

### Stage 9 — Limited Release ثم General Availability
- canary داخلي، rollback window، مراقبة، ثم توسيع تدريجي.
- Exit: قرار PASS صريح مبني على metrics، لا على نجاح البناء فقط.

## ترتيب التنفيذ العملي

`Stage 0 → 1 → 2 → 3 → 4/5 → 6 → 7 → 8 → 9`

يجوز تنفيذ 4 و5 بالتوازي بعد ثبات 2 و3. لا يبدأ 9 قبل نجاح 6–8.

## معيار التقرير اليومي

لكل مرحلة يسجل: SHA، البيئة، الملفات/الجداول، الاختبارات وعدد النجاح/الفشل، الثوابت قبل/بعد، المخاطر، rollback، والقرار `PASS|HOLD|BLOCKED`.

## الخطوة التالية المباشرة

1. إغلاق PR #109 كـ superseded أو إعادة بنائه من main؛ الافتراضي الآمن الإغلاق.
2. إنشاء Release Gate workflow على فرع مستقل.
3. تشغيل Production read-only inventory دون أي DML.
4. بناء مصفوفة E2E مصدقة وإصدار تقرير Stage 3.
