# TAMKEEN_GOLDEN_LESSON_OPERATIONAL_CLOSURE_20D — تقرير الإغلاق

- **الدرس المرجعي:** `lesson-g10-001-001` — «سورة السجدة – الدرس الأول: مكانة القرآن الكريم وكمال قدرة الله»
- **المعرف:** `16c10040-7a7b-4647-add2-4aa4d3f70583`
- **النطاق:** UI + محتوى + تحقق. لا ترحيلات، لا تغييرات RLS.

## 1. جرد القدرات (Inventory)

| القدرة | الحالة الفعلية | Lifecycle | ملاحظة |
| --- | --- | --- | --- |
| محتوى الكتاب الرسمي (officialBookContent) | موجود | READY | 31 بلوكاً |
| نسخة الكتاب الأصلية PDF (originalBookPdf) | موجود | READY | مورد أساسي `is_primary=true` |
| شرح تمكين (tamkeenExplanation) | موجود | READY | مرّ بدورة DRAFT→REVIEW→READY في 20C-B |
| اختبر فهمك (checkUnderstanding) | موجود | READY | يظهر للطالب |
| اختبار الدرس (lessonAssessment) | موجود | READY | 6 أسئلة |
| المراجعة السريعة (quickReview) | غير مُدخل | — | MISSING (مطلوب للجاهزية الكاملة) |
| الخريطة الذهنية (mindMap) | غير مُدخل | — | N/A لهذا الدرس |
| المحاكاة (simulation) | غير مُدخل | — | N/A لهذا الدرس |
| فيديو / موارد إضافية | غير مُدخل | — | N/A |

## 2. سلامة المحتوى الرسمي (20A1B)

- 31 بلوكاً: 11 فقرة، 9 عناوين، 2 آيات، 2 معاني، 2 figure (3 أصول صور)، قائمة، ترويسة، أهداف، نشاط، تقويم.
- علامة الـ Pilot `TAMKEEN_STRUCTURED_PILOT:20A1B` ما تزال مثبتة في `lesson_book_contents` ومرتبطة بـ `src/content/official-textbook/pilot-20a1b/approved.json`.
- **BOOK_CONTENT_INTEGRITY = PASS**

## 3. مصفوفة الأدمن (Yousuf Workspace)

`LessonContentWorkspace.tsx` صار يميز صراحة بين:
- **ناقص (MISSING)** — قدرة مطلوبة للجاهزية وغير مُدخلة (المراجعة السريعة هنا).
- **غير مطلوب لهذا الدرس (N/A)** — قدرة اختيارية غائبة (الخريطة، المحاكاة).
- **قيد المراجعة** لحالة DRAFT الموجودة في مرحلة REVIEW.

**YOUSUF_WORKFLOW_USABLE = PASS** (أزرار: إنشاء مسودة / إرسال للمراجعة / اعتماد / معاينة كطالب `?preview=1`).

## 4. تجربة الطالب (E2E — 390×1600، RTL)

الترتيب المعروض فعلياً:
1. اقرأ الدرس (محتوى الكتاب الرسمي المهيكل)
2. شرح إضافي (شرح تمكين)
3. اختبر فهمك
4. 📚 نسخة الكتاب الأصلية (مرجع اختياري في النهاية)

- `dir = rtl` ✔
- تجاوز أفقي = **0px** ✔
- لا توجد بطاقات «غير متوفر» ✔
- أخطاء Console / HTTP ≥400: **لا شيء** ✔

**STUDENT_ORDER = PASS · RTL_NO_OVERFLOW = PASS · PDF_REFERENCE = PASS**

## 5. تغيير الكود في هذه المرحلة

- `src/components/admin/LessonContentWorkspace.tsx` — تمييز MISSING مقابل N/A.
- `src/routes/_authenticated/lessons.$lessonId.tsx` — إظهار «نسخة الكتاب الأصلية» كقسم مرجعي مستقل في نهاية الدرس، محكوم ببوابة Lifecycle (`originalBookPdf = READY`) وبصلاحية الوصول، ولا يظهر إطلاقاً عندما يكون الـ PDF هو المحتوى الأساسي.

## 6. الجاهزية

- `BOOK_READY` = **PASS** (محتوى الكتاب + PDF المرجعي معتمدان)
- `LEARNING_READY` = **PASS** (شرح + اختبر فهمك + اختبار الدرس)
- `FULLY_READY` = **NOT YET** — ينقص «المراجعة السريعة» فقط.

## الحكم

**TAMKEEN_GOLDEN_LESSON_OPERATIONAL_CLOSURE_20D = PASS_WITH_ONE_OPEN_ITEM (quickReview)**
