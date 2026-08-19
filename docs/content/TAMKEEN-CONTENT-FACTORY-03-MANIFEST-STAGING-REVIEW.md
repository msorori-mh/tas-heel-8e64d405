# CONTENT FACTORY 03 — MANIFEST DRY-RUN AND REVIEW GATE

## Decision

`PASS_CONTENT_FACTORY_03_SOURCE_REVIEW_GATE`

تضيف هذه المرحلة مسارًا مستقلًا وآمنًا لمراجعة حزمة Golden Lesson كاملة دون
إجبارها على قوالب Excel 01–09 ودون تنفيذ أي كتابة خادمية أو إنتاجية.

## التدفق

1. يرفع الفريق Manifest الناتج من Content Factory 02.
2. يتحقق النظام من الحجم وJSON وعقد الحزمة والهوية والقدرات والـhash/provenance.
3. تُحسب SHA-256 للـManifest محليًا.
4. تُعرض خطة تجهيز حتمية للقدرات السبع والجداول الهدف، من دون تنفيذها.
5. تمر المراجعة عبر أدوار منفصلة:
   `CONTENT_EDITOR → CONTENT_REVIEWER → TECHNICAL_REVIEWER`.
6. كل انتقال يحتاج أدلة محددة، ولا يمكن القفز بين الحالات.
7. الحالة النهائية `APPROVED_FOR_STAGING` وليست `READY` ولا تمنح execute.

## الثوابت

- `domainWritesPerformed=0`.
- `productionWritesPerformed=0`.
- `executable=false`.
- لا RPC ولا Server Function في لوحة الحزمة.
- لا إجابات في الحمولة العامة.
- لا direct READY ولا auto publish.

## المرحلة التالية

Content Factory 04 ينشئ persistence خادمية مع migration/RLS/audit منفصلة، ثم يربط
`APPROVED_FOR_STAGING` بتجهيز ذري قابل للإلغاء. هذه المرحلة لا تمنح ذلك التفويض.
