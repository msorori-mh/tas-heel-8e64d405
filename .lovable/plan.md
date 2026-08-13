# PRODUCTION_CONTENT_IMPORT_READINESS_REVIEW_10

مرحلة مراجعة وجاهزية + قرار معماري لـ G-1. لا استيراد إنتاجي فعلي ولا نشر محتوى في هذه المرحلة.

## حقيقة أساسية يجب تثبيتها أولاً

فحص قاعدة البيانات الحالية أظهر:

- لا توجد قاعدتان (Non-Prod / Prod) منفصلتان. المشروع يعمل على قاعدة Lovable Cloud واحدة تخدم المعاينة والموقع المنشور معاً.
- كل migrations المراحل 03–09 **مطبقة بالفعل** على هذه القاعدة الواحدة، و`supabase/migrations-pending/` فارغة عملياً.
- بقايا الـ e2e: `subjects/questions_revisions/question_targets/assessment_questions` بأكواد `e2e-*` = **صفر**، بينما `import_jobs` = 29 صف (سجل تدقيق محفوظ كما هو مطلوب).
- `question_revisions` = 0، `published` = 0، أي لا يوجد أي محتوى بنك أسئلة حقيقي بعد.

النتيجة: «نقل migrations إلى الإنتاج» ليس بنداً قابلاً للتنفيذ هنا. البند الحقيقي هو: **أول كتابة محتوى حقيقي تتم على نفس القاعدة التي يراها الطلاب**، ولذلك تتحول المرحلة 10 من «مقارنة بيئتين» إلى «ضوابط كتابة آمنة على بيئة واحدة».

## ما تنفذه المرحلة 10

### 1. تقرير الجاهزية `docs/import/PRODUCTION-CONTENT-IMPORT-READINESS-REVIEW-10.md`

- جرد كامل للـ migrations المطبقة الخاصة بالاستيراد وبنك الأسئلة مع حالة كل منها.
- إثبات موثق بالاستعلامات لخلو القاعدة من بيانات `e2e-*` مع بقاء `import_jobs`.
- Baseline snapshot لأعداد الصفوف في جداول المحتوى قبل أول دفعة.
- خطة Backup/Rollback: نقطة استرجاع قبل كل دفعة، وrollback على مستوى القالب اعتماداً على ذرّية per-template + `import_jobs.id` كمفتاح تتبع، وقائمة استعلامات حذف عكسي بأكواد الدفعة.
- حدود الدفعات: حد أقصى للصفوف لكل قالب، ومنع تشغيل دفعتين متزامنتين، ومراقبة `import_jobs` (jobs عالقة، jobs فاشلة، معدل الأخطاء).
- صلاحيات المشغلين: من يملك `admin` / `content_manager` / capability النشر، ومن يُسمح له فعلياً بتشغيل prepare/execute.

### 2. Checklist أول دفعة حقيقية

`docs/import/FIRST-PRODUCTION-BATCH-CHECKLIST-10.md`: مادة واحدة → وحدة → درس → موارد → تقييم، بدون أسئلة، مع تحقق طالب حقيقي بعد الدفعة. لا تُنفذ الدفعة في هذه المرحلة؛ تبقى بانتظار تفويض مكتوب.

### 3. قرار G-1 (المخرج الأهم)

الوضع المؤكد بالكود: `qb_import_ingest_revision` ينشئ جذر السؤال كـ identity shell بلا `lesson_id/subject_id`، و`qb_sync_question_legacy` ما زالت stub، وtrigger التحقق يرفض الربط لأنه يقرأ الربط legacy من جذر السؤال.

الخيار الموصى به: **الربط عبر `question_targets` وقت النشر، لا عبر جذر السؤال**.

```text
draft revision → publish_question_revision → question_targets (subject/lesson)
                                                    ↓
                        validate_assessment_question_link يقرأ targets
                                                    ↓
                        assessment_questions binding مسموح للمنشور فقط
```

قواعد ملزمة للقرار:
- لا كتابة أي أعمدة legacy في `public.questions` كشرط للربط.
- الربط مسموح فقط لسؤال له `current_published_revision_id` غير فارغ.
- التحقق يطابق مادة/درس التقييم مع `question_targets` وليس مع جذر السؤال.
- المسودات تبقى غير مرئية للطالب، وحماية الإجابات كما هي.

الخيار البديل الموثق للرفض: تعبئة legacy عند النشر (أبسط لكنه يعيد ازدواج الهوية ويخالف نموذج revisions/targets).

المرحلة 10 تنتج القرار والتصميم والاختبارات المطلوبة لإغلاقه؛ التنفيذ الفعلي (migration + E2E) يصبح المرحلة 11 بعد اعتمادك.

## بوابات الخروج

- تقرير الجاهزية مكتمل ومدعوم باستعلامات فعلية.
- Checklist الدفعة الأولى جاهز.
- قرار G-1 معتمد كتابياً مع مسار تنفيذ محدد.
- لا كتابة بيانات، لا نشر، لا migration جديدة في هذه المرحلة.

## تفاصيل تقنية

- الاستعلامات المرجعية تُنفذ للقراءة فقط عبر أداة قراءة قاعدة البيانات.
- ملفات جديدة تحت `docs/import/` فقط؛ لا تعديل على كود التطبيق.
- مراجع مستخدمة: `supabase/migrations/20260801120000_qb01_question_bank_schema_foundation.sql` (publish + stub)، migrations الاستيراد `20260813*`، و`docs/import/CONTENT-AND-QUESTION-UNIFIED-OPERATIONAL-E2E-09.md`.
