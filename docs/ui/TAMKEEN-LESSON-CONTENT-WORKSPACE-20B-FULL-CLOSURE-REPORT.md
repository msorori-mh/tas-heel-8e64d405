# TAMKEEN_LESSON_CONTENT_WORKSPACE_20B_FULL_CLOSURE

الحالة: تنفيذ UI + عقد فقط. `production writes = 0`، `migrations = 0`، `publish = NO`.

## 1. CAPABILITY_CONTRACT
`src/lib/lessons/lesson-content-contract.ts` — عقد واحد نهائي لعشر قدرات:
`officialBookContent, tamkeenExplanation, mindMap, simulation, supportingResources,
quickReview, checkUnderstanding, lessonAssessment, studentPerformance, originalBookPdf`.

لكل قدرة: `present, status, studentVisible, sourceRef, count, updatedAt, htmlRef?, note?,
readinessReason` — و`readinessReason ∈ {NOT_ENTERED, DRAFT_NOT_PUBLISHED, INVALID_DATA, ACCESS_GATED, null}`
تُشتق مركزياً داخل `state()` ولا يُعاد حسابها في أي مكوّن.

## 2. AUDIT — مصادر كل قدرة

| Capability | SOURCE_TABLE_OR_SERVICE | ADMIN_PATH | IMPORT_PATH | STUDENT_RENDERER | STATUS_MODEL | VISIBILITY_RULE |
|---|---|---|---|---|---|---|
| officialBookContent | `lesson_book_contents.content` (+ `lessons.content_text` legacy) | `/admin/lessons/$id` → LessonBookContentDialog | Template 04 | `StructuredTextbookReader` / `OfficialTextbookContent` | READY / INVALID (placeholder) / ABSENT | محتوى صالح غير Placeholder |
| tamkeenExplanation | `lesson_explanations` | LessonExplanationsDialog (تحرير/حذف) | Template 05 | قسم الشرح في صفحة الدرس | READY / ABSENT | rows > 0 |
| mindMap | `lesson_resources` (`resource_type=mindmap` أو `html_resource_type=mindmap`) — **HTML** | LessonResourcesDialog + مسار HTML القائم | رفع HTML `<lesson_code>.html` | `PublishedHtmlResourceViewer` | READY (published) / DRAFT (draft·in_review) / ABSENT | `lifecycle_status=published` + بوابة الوصول |
| simulation | `lesson_simulations` + `lesson_resources(experiment)` | LessonResourcesDialog | Template 06 / HTML | بطاقة PRACTICAL | READY / ABSENT | محتوى صالح + بوابة الوصول — **غير إلزامية** |
| supportingResources | `lesson_resources(video·link·pdf, is_primary=false)` | LessonResourcesDialog | Template 06 | بطاقتا VIDEO و EXTRA_RESOURCES | READY / ABSENT | URL صالح + بوابة الوصول |
| quickReview | `lesson_summaries` | LessonSummaryDialog | Template 06/الاستيراد | قسم الملخص + HTML summaries | READY / INVALID (سجل فارغ) / ABSENT | نص ملخص غير فارغ |
| checkUnderstanding | `questions(lesson_id)` → `get_lesson_quiz_questions` / `grade_lesson_quiz` | بنك الأسئلة (`/admin`) | Templates 08 + 09 | بطاقة ASSESSMENT | READY / ABSENT | عدد الأسئلة > 0 |
| lessonAssessment | `lesson_assessments` + `exam_templates(lesson_id)` | إدارة الاختبارات | Template 07 | بطاقة LESSON_EXAM | READY / ABSENT | عدد > 0 + بوابة الوصول |
| studentPerformance | مشتق: `user_progress` + محاولات التدريب/الاختبار | لا يُحرَّر (مشتق) | — | «مستواك وأخطاؤك» | READY متى وُجد نشاط قابل للقياس | يظهر عند وجود أسئلة/اختبار |
| originalBookPdf | `lesson_resources(is_primary=true)` أو `lesson_book_contents.pdf_url` | LessonPrimaryPdfCard + الرفع المباشر 18D | رفع مباشر / Bulk `<lesson_code>.pdf` | `InAppPdfDelivery` | READY / ABSENT | URL صالح + بوابة الوصول |

نتيجة المراجعة المطلوبة: **Simulation** و**Quick Review** و**Original PDF** لها مسارات فعلية قائمة؛
**Student Performance** مشتقة بالكامل ولا تحتاج إدخالاً.

## 3. ADMIN_WORKSPACE
`src/components/admin/LessonContentWorkspace.tsx` مثبّت الآن أعلى `/admin/lessons/$lessonId`.
يعرض القدرات العشر بالترتيب الرسمي مع: الحالة، سبب عدم الجاهزية، آخر تحديث، العدد، مصدر البيانات،
`htmlRef` للخريطة الذهنية، وزر «تحرير» **فقط** حيث يوجد محرّر فعلي (الكتاب، الشرح، المراجعة، الموارد/الخريطة/المحاكاة/PDF).
القدرات بلا محرّر تُعلَّم «عبر الاستيراد». لا أزرار وهمية.

## 4. STUDENT_RENDERER_ORDER
`STUDENT_CAPABILITY_ORDER` هو المصدر الوحيد للترتيب، ويُطبَّق في صفحة الطالب عبر
`orderStudentCapabilities(visibleLessonCapabilities(...))`:
الكتاب الرسمي → شرح تمكين → الخريطة الذهنية → المحاكاة → الموارد المساعدة → المراجعة السريعة →
اختبر فهمك → اختبار الدرس → مستواك وأخطاؤك → نسخة الكتاب PDF.
أي قدرة غير جاهزة **تُحذف تماماً** — لا وجود لعبارة «غير متوفر».

## 5. DYNAMIC_CAPABILITIES_18B_REUSED = YES
قرار الظهور يبقى في `computeLessonCapabilities` (18B) وقرار الترتيب في عقد 20B، مرتبطين عبر
`LEGACY_CAPABILITY_TO_KEY`. لا منطق ظهور داخل أي مكوّن.

## 6. PREVIEW_AS_STUDENT = REAL_RENDERER
زر «معاينة كطالب» في الـWorkspace ينتقل إلى `/lessons/$lessonId` نفسه — لا Preview موازٍ.

## 7. READINESS
- BOOK_READY_RULE = محتوى الكتاب الرسمي موجود، صالح (غير Placeholder)، وقابل للعرض.
- LEARNING_READY_RULE = BOOK_READY + شرح تمكين + المراجعة السريعة (الخريطة الذهنية مستهدفة لكل درس لكنها قدرة مستقلة، والمحاكاة اختيارية).
- FULLY_READY_RULE = LEARNING_READY + اختبر فهمك + اختبار الدرس/الأداء المرتبط به.

## 8. DRAFT_READY_GAP
`lesson_book_contents` و`lesson_explanations` و`lesson_summaries` بلا دورة حياة حقيقية: أي كتابة تظهر فوراً
للطلاب المخوّلين (أثبتته تجربة 20A1C). الخريطة الذهنية وحدها تملك `lifecycle_status` عبر مسار HTML.

Proposal (بلا تنفيذ الآن): عمود واحد
`lifecycle_status text not null default 'draft' check (in ('draft','review','ready'))`
على الجداول الثلاثة + شرط `lifecycle_status='ready'` في سياسات/استعلامات قراءة الطالب. هذا أقل تعديل ممكن.

- DRAFT_READY_MIGRATION_REQUIRED = **YES** (لاحقاً، خارج 20B)
- MIGRATION_REQUIRED_FOR_LIFECYCLE = YES

## 9. YOUSUF_WORKFLOW
المادة → الدرس → Lesson Content Workspace → إدخال/استيراد → تحقق → حفظ مسودة → معاينة كطالب →
مراجعة بشرية → Mark Ready → ظهور تلقائي للطالب.
لا يحتاج يوسف معرفة أسماء الجداول أو أرقام القوالب. (خطوة Mark Ready تكتمل تقنياً بعد ترحيل §8).

## 10. BULK + SINGLE
المساران مدعومان مفهومياً: درس مفرد من الـWorkspace، وBulk عبر `lesson_code`
(`<lesson_code>.html` للخريطة، `<lesson_code>.pdf` للكتاب). لم يُنفَّذ Bulk جديد في هذا الإغلاق.

## 11. سجل الإغلاق
```
CAPABILITY_CONTRACT=FINAL_10_CAPABILITIES
ADMIN_WORKSPACE=MOUNTED(/admin/lessons/$lessonId)
STUDENT_RENDERER_ORDER=ENFORCED_SINGLE_SOURCE
DYNAMIC_CAPABILITIES_18B_REUSED=YES
OFFICIAL_CONTENT=REUSED(lesson_book_contents)
EXPLANATION=REUSED(lesson_explanations)
MIND_MAP_HTML=REUSED(html pipeline, lifecycle aware)
SIMULATION=REUSED(lesson_simulations+resources, OPTIONAL)
RESOURCES=REUSED(lesson_resources)
QUICK_REVIEW=REUSED(lesson_summaries)
CHECK_UNDERSTANDING=REUSED(questions RPC)
ASSESSMENT=REUSED(lesson_assessments+exam_templates)
PERFORMANCE=DERIVED(user_progress+attempts)
ORIGINAL_PDF=REUSED(primary resource / book pdf_url)
PREVIEW_AS_STUDENT=REAL_STUDENT_ROUTE
BOOK_READY_RULE=official content present+valid+renderable
LEARNING_READY_RULE=BOOK_READY+explanation+quick review
FULLY_READY_RULE=LEARNING_READY+check understanding+assessment/performance
DRAFT_READY_GAP=NO_LIFECYCLE_ON_BOOK/EXPLANATION/SUMMARY
MIGRATION_REQUIRED_FOR_LIFECYCLE=YES
PRODUCTION_WRITE=NO
PUBLISH=NO
NEXT_IMPLEMENTATION_BATCH=20C_LIFECYCLE_MIGRATION + MARK_READY_UI + BULK_HTML/PDF_BY_LESSON_CODE
```

الحكم: **TAMKEEN_LESSON_CONTENT_WORKSPACE_20B = PASS_READY_FOR_YOUSUF_WORKFLOW_IMPLEMENTATION**
