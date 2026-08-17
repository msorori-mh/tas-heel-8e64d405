# TAMKEEN_GOLDEN_LESSON_QUICK_REVIEW_CLOSURE_20D1 — تقرير

- **الدرس:** `lesson-g10-001-001` — `16c10040-7a7b-4647-add2-4aa4d3f70583`
- **النطاق:** إغلاق فجوة المراجعة السريعة بإعادة استخدام نظام 15A القائم. لا ترحيلات، لا RLS/RPC جديدة.

## 1. AUDIT — نظام Quick Review القائم

| البند | القيمة الفعلية |
| --- | --- |
| CURRENT_QUICK_REVIEW_TABLE | `lesson_summaries` |
| CURRENT_DATA_MODEL | `summary` (نص) + `key_points` (JSON/مصفوفة) + `study_tip` |
| CURRENT_ADMIN_PATH | `/admin/lesson-content/$lessonId` → قسم «🧠 المراجعة السريعة» → `LessonSummaryDialog` |
| CURRENT_STUDENT_RENDERER | صفحة الدرس (قدرة 18B من نوع `SUMMARY`) + مركز المراجعة `/quick-review` (`ReviewCard` / `FocusReader`) |
| CURRENT_IMPORT_PATH | قوالب Excel للاستيراد + التحرير المباشر من النافذة |
| CURRENT_LIFECYCLE_SUPPORT | نعم — `quickReview` ضمن `LIFECYCLE_CAPABILITIES` ويستخدم `lesson_capability_transition` (DRAFT→REVIEW→READY) |
| CURRENT_LESSON_BINDING | `lesson_summaries.lesson_id` |

**DUPLICATE_QUICK_REVIEW_SYSTEM = NO** · **EXISTING_QUICK_REVIEW_SYSTEM_REUSED = YES**

## 2. حالة المحتوى للدرس الذهبي

استعلام `lesson_summaries` لهذا الدرس أرجع **صفر صفوف**.

- **QUICK_REVIEW_CONTENT_EXISTS = NO**
- **CONTENT_ENTRY_REQUIRED_FROM_YOUSUF = YES**
- لم يُؤلَّف أي محتوى تلقائياً (التزاماً بـ §5).

## 3. مسار يوسف (تم التحقق منه فعلياً في الواجهة)

في `/admin/lesson-content/16c10040-…` يظهر الصف:

`🧠 | 6. | المراجعة السريعة | ناقص (MISSING) | lesson_summaries | سبب عدم الجاهزية: لم يُدخل بعد | [تحرير]`

- **YOUSUF_ENTRY_PATH** = `/admin/lesson-content/$lessonId` → «تحرير» → نافذة المراجعة السريعة (ملخص + نقاط رئيسية + تلميح دراسي) → حفظ (مسودة).
- بعد وجود المحتوى تظهر أزرار المسار: **إرسال للمراجعة** ثم **اعتماد (READY)** — الاعتماد محصور بالأدمن الكامل عبر RPC، ولا يوجد نشر تلقائي.
- زر **«معاينة كطالب (تشمل المسودات)»** موجود في مساحة العمل (`?preview=1`).
- أُضيف داخل نافذة التحرير تنبيه بقاعدة المحتوى §2: المراجعة السريعة طبقة تعلّم من تمكين (أهم الأفكار، ما يجب تذكره، المفاهيم، الأخطاء الشائعة) وليست نسخاً من نص الكتاب أو تقويمه.

## 4. النتائج

| المؤشر | القيمة |
| --- | --- |
| LIFECYCLE | DRAFT → REVIEW → READY (Fail-Closed، لا Auto Publish) |
| STUDENT_VISIBILITY | DRAFT = مخفي · REVIEW = مخفي · READY = ظاهر |
| STUDENT_ORDER | `quickReview` مرتبة بعد المحاكاة/الموارد وقبل «اختبر فهمك» في `STUDENT_CAPABILITY_ORDER` |
| «غير متوفر» | لا تظهر إطلاقاً (تم التحقق على صفحة الطالب) |
| 18B | PASS — الرؤية من `computeLessonCapabilities` والترتيب من عقد 20B، بلا ازدواج |
| RTL / NO_HORIZONTAL_OVERFLOW | PASS (تجاوز أفقي = 0px) |
| CONSOLE_ERRORS | ZERO |
| اختبارات دورة الحياة والعقد | 7/7 PASS · Typecheck نظيف |

E2E الكامل للحالات الأربع (DRAFT/معاينة/REVIEW/READY) غير قابل للتشغيل الآن لعدم وجود محتوى حقيقي — المسار نفسه مُثبت مسبقاً في 20C-B على «شرح تمكين» بنفس الـ RPC ونفس البوابة.

## 5. الجاهزية

- **BOOK_READY = YES** (بقيت كما هي)
- **LEARNING_READY = NO** — ينقص `quickReview` فقط (السياسة: كتاب رسمي + شرح تمكين + مراجعة سريعة)
- **FULLY_READY = NO** — يتحقق بعد اعتماد المراجعة السريعة (اختبر فهمك جاهز بالفعل)
- المحاكاة والخريطة الذهنية غير مطلوبة ولا تدخل في الحساب.

## الحكم

**TAMKEEN_GOLDEN_LESSON_QUICK_REVIEW_CLOSURE_20D1 = PASS_WORKFLOW_READY_CONTENT_ENTRY_PENDING**
