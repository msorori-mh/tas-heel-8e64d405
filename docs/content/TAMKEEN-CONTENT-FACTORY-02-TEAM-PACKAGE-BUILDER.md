# CONTENT FACTORY 02 — TEAM PACKAGE BUILDER

## Decision

`PASS_CONTENT_FACTORY_02_SOURCE_BUILDER`

هذه المرحلة تضيف واجهة عربية لفريق المحتوى داخل مركز الاستيراد الرسمي، فوق عقد
Golden Lesson العام. الواجهة تبني manifest محليًا ولا تنفذ أي كتابة على قاعدة
البيانات أو التخزين.

## ما تم تنفيذه

- اختيار Profile للقرآن أو الكيمياء.
- إدخال هوية الصف والمسار والمادة والدرس دون اختراع الوحدة أو الفصل أو الترتيب.
- رفع ملفات القدرات السبع وفق `REQUIRED / OPTIONAL / NA`.
- حساب SHA-256 محليًا في المتصفح لكل ملف، بما فيه companion الإجابات.
- إلزام المحتوى الرسمي بملف provenance.
- عرض نسبة اكتمال المتطلبات وأخطاء العقد بالعربية.
- تنزيل manifest لا يُتاح إلا بعد نجاح التحقق fail-closed.
- تصميم RTL وmobile-first وأهداف لمس 44px.

## ضمانات الأمان

- `initialStatus=DRAFT` و`allowDirectReady=false`.
- `productionApply=false`.
- الإجابات لا تدخل الحمولة العامة، وملفها ينتهي بـ`.server-only.json` وله SHA-256.
- HTML التفاعلي يعلن `htmlNetworkAccess=NONE`.
- حد الملف 5MB، ولا توجد RPC أو insert/update/upsert/delete في الواجهة.

## حدود المرحلة

هذه الواجهة تجمع الحزمة وتتحقق منها وتصدر manifest فقط. ربط manifest بمرحلة staging
والمراجعة متعددة الأدوار والتنفيذ الذري يأتي في Content Factory 03، بعد اعتماد هذه
البوابة. لا توجد migrations ولا production writes هنا.

```text
PRODUCTION_WRITES=0
SCHEMA_MIGRATIONS=0
LOCAL_SHA256=ENFORCED
SERVER_ONLY_ANSWERS=HASH_PINNED
MANIFEST_DOWNLOAD=VALIDATION_GATED
```
