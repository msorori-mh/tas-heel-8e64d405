# RELEASE-STABILITY-SNAPSHOT-01 — لقطة استقرار النسخة قبل إدخال المحتوى

- **التاريخ:** 2026-07-31 (محدَّث بعد تطبيق units migration)
- **آخر main SHA:** `f5d714d1e6108a52992c633da4a92a0881e7bc07` («Applied units RLS hardening»)
- **الغرض:** تجميع حالة النسخة في نقطة واحدة قبل بدء إدخال المحتوى التعليمي. لا تغييرات كود.

> **تحديث:** PRE-IMPORT-UNITS-RLS-HARDENING-APPLY-01 = **PASS** — migration تقييد units مطبقة عبر Lovable. **units anon exposure = CLOSED.**

## PRs المنجزة والمدمجة مؤخراً

| PR | الموضوع |
|---|---|
| #27 | تصحيح أعمدة نتيجة التدريب/السجل |
| #28 | تسليم تلقائي لجلسة الاختبار الصارم المنتهية |
| #29 | `/exams` في denylist الـ service worker |
| #31 | حماية أعمدة إجابات الاختبارات (عمودية) — **+ migration مطبقة عبر Lovable: PASS** |
| #32 | تقسيم المواد الكبرى/الأقسام للصف الأول |
| #34 | تثبيت ما قبل الاستيراد: units RLS source-only + مواءمة القوالب + تحذيرات dry-run — **مدمج 2026-07-31** |

## PRs المفتوحة الناتجة عن عمل الليلة (غير مُدمجة)

| PR | الموضوع | CI | بانتظار |
|---|---|---|---|
| #35 | docs: prepare content import dry-run package (runbook) | — | مراجعة ودمج المالك |
| (هذا) | docs: release stability snapshot before content import | — | مراجعة ودمج المالك |
| #33 | docs: content data readiness audit (جرد المحتوى) | pass | مراجعة ودمج المالك |
| #30 | docs: تقارير دورة الجاهزية | — | مراجعة ودمج المالك |
| #36 | docs: independent pre-import review (خارج عمل هذه الجلسة) | — | المالك |
| #26 [Draft] | تقارير الإدارة والإشعارات | — | قرار المالك: دمج أو تأجيل صريح |
| #21/#22 [Draft] | توثيق دورات سابقة | — | المالك |

## migrations تحتاج تطبيقاً لاحقاً عبر Lovable

**لا توجد migrations معلقة.** `20260731180000_restrict_units_select_to_authenticated.sql` طُبقت عبر Lovable والنتيجة PASS (main @ f5d714d). migration حماية الإجابات لـ PR #31 مطبقة سابقاً وPASS.

## data cleanup يحتاج موافقة المالك

- **وحدتا QA متروكتان في الإنتاج:** «QA_C01_C02_FREE_UNIT — اختبار QA لا تستخدم» و«QA_C01_C02_PAID_UNIT — اختبار QA لا تستخدم» (+ مادتهما `b40d2dd5…` وملحقاتها على الأرجح). الحذف/التعطيل كتابة بيانات ⇒ **بموافقة المالك فقط**. استعلامات الكشف الجاهزة في `docs/CONTENT-DATA-READINESS-AUDIT-01-REPORT.md`.

## هل النسخة جاهزة تقنياً لبدء dry-run بعد تطبيق migrations المطلوبة؟

**نعم.** لا مانع تقني معروف:
- فحوصات main @ f5d714d: tsc / npm test 25/25 / PWA 7/7 — PASS.
- units RLS مطبقة (anon exposure مغلقة) — التحقق الحي السريع: anon لا يقرأ units بعد التطبيق.
- قوالب الاستيراد 01–09 جاهزة ومحدّثة بقاعدة تقسيم المواد، وdry-run يفحصها بتحذيرات التسمية الجديدة (مدمجة عبر PR #34).
- دليل التشغيل والـ checklist جاهزان (PR #35).
- القيم الثماني المعتمدة للصف الأول موثقة (`docs/SUBJECT-GROUPING-GRADE-10-YEMEN-CONTENT-GUIDE.md`).

## الخطوات المتبقية (بالترتيب)

1. ~~مراجعة ودمج PR #34~~ — **تم**. ~~Lovable apply لوحدات RLS~~ — **تم (PASS)**. دمج #33/#35/#37 التوثيقية متروك للمالك.
2. **تنظيف QA units** بموافقة المالك (كتابة بيانات — خطوة مالك).
3. **dry-run** على ملفات المحتوى الفعلية وفق `docs/CONTENT-IMPORT-DRY-RUN-RUNBOOK-01.md`.
4. **إصلاح التحذيرات** (خاصة تحذيرات التسمية — تُعامل كأخطاء قبل الاستيراد).
5. **import فعلي بتفويض** كتابي من المالك.
6. **smoke طالب كامل** بعد الاستيراد: مادة ← وحدة ← درس ← موارد ← تدريب ← اختبار ← نتيجة (مع التحقق من ظهور التجميع: «اللغة العربية — 3 أقسام» إلخ).

## الامتثال

لا Deploy • لا Publish • لا تطبيق migrations • لا SQL production • لا data writes • لا import • لا QA cleanup • لا merge — كل الـ PRs مفتوحة بانتظار المالك.
