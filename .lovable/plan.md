# 20E — معيار استلام المحتوى ليوسف (توثيق تشغيلي فقط)

مهمة توثيق: لا كود، لا Migration، لا RLS/RPC، لا نشر، لا كتابة محتوى إنتاجي. المخرج ملفان في `docs/content/`.

## التدقيق أولاً (قراءة فقط)

قبل الكتابة، أتحقق من الحقائق التي سيبني عليها المعيار من المصدر الفعلي:
- ترتيب القدرات العشر وحالاتها من `src/lib/lessons/lesson-content-contract.ts`.
- انتقالات دورة الحياة (DRAFT → REVIEW → READY) والصلاحيات من `src/lib/lessons/lesson-lifecycle.ts`.
- الأزرار والحوارات الفعلية في مركز محتوى الدرس `/admin/lesson-content/$lessonId`.
- الصيغ المقبولة فعلياً لكل قدرة من القوالب القائمة (`content-import-templates.ts`) ومعيار المحتوى الرسمي 20A.

أي فجوة تمنع يوسف من إتمام درس تُسجَّل كـ BLOCKER في التقرير بدون تنفيذ إصلاح في هذه المهمة.

## الملف 1 — TAMKEEN-YOUSUF-CONTENT-INTAKE-STANDARD-20E.md

بالعربية، مختصر وعملي، بالأقسام:

1. حزمة الدرس الكاملة (9 عناصر يدخلها يوسف). «مستواك وأخطاؤك» مشتقة آلياً — ليست مادة إدخال.
2. تصنيف كل قدرة: MANDATORY / TARGET / OPTIONAL / DEPENDS_ON_LESSON / N/A_BY_LESSON، مع القاعدة: القدرة غير المناسبة لا تمنع اكتمال الدرس.
3. الصيغ المقبولة لكل قدرة — من الأنظمة القائمة فقط (Structured HTML للكتاب، HTML للخريطة، PDF للأصل، lesson_summaries للمراجعة السريعة، بنك الأسئلة، مسار التقييم، مسار المحاكاة القائم).
4. تسمية الملفات: `lesson_code` هو المفتاح (`lesson-g10-001-001.pdf` / `.html`)، وممنوع المطابقة الجماعية بعنوان الدرس.
5. مسار يوسف اليومي: المادة → الدرس → مركز محتوى الدرس → مصفوفة الجاهزية → إضافة/استيراد → حفظ مسودة → معاينة كطالب → إرسال للمراجعة → اعتماد → READY. بدون SQL/RPC/أسماء جداول/أرقام قوالب.
6. قائمة فحص الجودة قبل الاعتماد (SOURCE_MATCH, CONTENT_COMPLETE, RTL, MOBILE, ASSETS_PRESENT, NO_EXTERNAL_BROKEN_URL, NO_SCRIPT_RISK, NO_HORIZONTAL_OVERFLOW) + فحوص المحتوى الرسمي (TEXT/FIGURE/ORDER_FIDELITY, HUMAN_REVIEW).
7. معيار المراجعة السريعة: طبقة تعلّم قصيرة (أهم الأفكار، المفاهيم/التعريفات، ما يجب تذكره، أخطاء شائعة، قوانين حسب المادة)، مع حدود واضحة تفصلها عن محتوى الكتاب وشرح تمكين والخريطة الذهنية. تعريف فقط — بدون تأليف محتوى درس القرآن.
8. مصفوفة الجاهزية: BOOK_READY / LEARNING_READY / FULLY_READY وكيف تُقرأ، مع التمييز الصريح بين MISSING_CONTENT و SYSTEM_ERROR.
9. مساران: إدخال درس مفرد من الـ Workspace، واستيراد جماعي بالمستوردات القائمة عبر `lesson_code` (توثيق فقط، بدون تنفيذ Bulk جديد).
10. خريطة إدخال يوسف ← ظهور الطالب: ماذا يظهر، أين، ومتى، وماذا يخفيه DRAFT/REVIEW، مطابقاً للترتيب المعتمد من 1 محتوى الكتاب حتى 10 PDF الأصلي.

## الملف 2 — TAMKEEN-LESSON-CONTENT-CHECKLIST-20E.md

نموذج قابل للنسخ لكل درس: LESSON_CODE / SUBJECT / GRADE / SEMESTER، ثم حقول القدرات التسع، ثم BOOK_READY / LEARNING_READY / FULLY_READY، ثم MISSING_CONTENT و REVIEW_NOTES — مع مثال معبّأ لدرس القرآن الذهبي كما هو اليوم (المراجعة السريعة = MISSING_CONTENT).

## الحكم

في نهاية الملف الأول: `TAMKEEN_YOUSUF_CONTENT_INTAKE_STANDARD_20E = PASS_READY_FOR_CONTENT_OPERATIONS` إن لم يكشف التدقيق أي Blocker، وإلا `NEEDS_REVISION` مع سبب محدد.
