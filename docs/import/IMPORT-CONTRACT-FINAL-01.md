# IMPORT-CONTRACT-FINAL-01 — عقد استيراد المحتوى والأسئلة (نهائي)

الحالة: **مغلق كعقد** (Contract Closed) — التنفيذ الفعلي (Execute) لا يبدأ قبل إغلاق الفجوات المذكورة في القسم 6.

المصدر الآلي للعقد: `src/lib/import/import-contract.ts` + `src/lib/import/import-error-codes.ts`
الاختبارات الحارسة: `bun run test:import-contract` (11 اختبار).

النطاق: قوالب Excel من 01 إلى 09 (المواد، الوحدات، الدروس، محتوى الكتاب، الشروحات، الموارد، التقييمات، أسئلة التقييمات، بنك الأسئلة).
خارج النطاق في هذه المرحلة: منطق التنفيذ الفعلي (Execute)، جداول staging، رفع الملفات إلى Storage.

---

## 1. المفاتيح الطبيعية (Natural Keys) — تم التحقق منها فعلياً من قاعدة البيانات

| القالب | الجدول | المفتاح في Excel | الأعمدة في القاعدة | نطاق التفرد | التطبيق الفعلي |
|---|---|---|---|---|---|
| 01 subjects | `subjects` | `subject_code` | `code` | عام | `subjects_code_uniq` ✅ |
| 02 units | `units` | `subject_code` + `unit_code` | `(subject_id, code)` | داخل المادة | `units_code_subject_uniq` ✅ |
| 03 lessons | `lessons` | `subject_code` + `lesson_code` | `(subject_id, slug)` | داخل المادة | `lessons_subject_id_slug_key` ✅ |
| 04 book_contents | `lesson_book_contents` | `lesson_code` | `lesson_id` | صف واحد لكل درس | `lesson_book_contents_lesson_id_key` ✅ |
| 05 explanations | `lesson_explanations` | `lesson_code` + `title` + `sort_order` | — | داخل الدرس | ❌ لا يوجد فهرس فريد |
| 06 resources | `lesson_resources` | `lesson_code` + `resource_type` + `title` | — | داخل الدرس | ❌ لا يوجد فهرس فريد |
| 07 assessments | `lesson_assessments` | `assessment_code` | — | عام | ❌ لا يوجد عمود `code` أصلاً |
| 08 assessment_questions | `assessment_questions` | `assessment_code` + `question_code` | `(assessment_id, question_id)` | داخل التقييم | `assessment_questions_unique` ✅ |
| 09 questions | `questions` | `question_code` | `code` | عام | `questions_code_uniq` ✅ |

قرار مُثبَّت: **`lesson_code` هو `lessons.slug`** — لا يوجد عمود `lessons.code` ولن يُضاف.

## 2. خريطة الحقول (Excel → جدول.عمود)

الخريطة الكاملة حقلاً بحقل موجودة في `IMPORT_ENTITY_CONTRACTS` داخل `src/lib/import/import-contract.ts`، وتشمل لكل حقل: الجدول الهدف، العمود، هل هو مطلوب، وطريقة الحل (كتابة مباشرة / بحث FK / تحويل).

تحويلات إلزامية:
- `grade_slug` → `grades.slug` → `subjects.grade_id`
- `track_code` → `curriculum_tracks.track_code` → `subjects.curriculum_track_id`
- `unit_code` يُحلّ ضمن نطاق `subject_id` فقط (وليس عالمياً)، والقيمة الفارغة مسموحة (درس مرتبط بالمادة مباشرة)
- `correct_index` في Excel يبدأ من 1 بينما `questions.correct_index` يبدأ من 0 → **طرح 1 إلزامي**
- `option_1..option_6` تُجمع في `questions.options` (jsonb array) مع حذف الفراغات من النهاية

## 3. رسم التبعية وترتيب التنفيذ

```text
subjects ──┬─> units ──┐
           └──────────┴─> lessons ──┬─> book_contents
                                    ├─> explanations
                                    ├─> resources
                                    └─> assessments ──┐
subjects ─────────────────> questions ────────────────┴─> assessment_questions
```

الترتيب المعتمد (مولَّد آلياً ومُختبَر): `01 → 02 → 03 → 04 → 05 → 06 → 09 → 07 → 08`.

## 4. قواعد Idempotency

مصفوفة القرار (`resolveImportRowAction`) — مغطاة باختبارات:

| الحالة | القرار |
|---|---|
| لا يوجد صف مطابق للمفتاح الطبيعي | `INSERT` |
| مطابق + نفس `row_hash` | `SKIP` |
| مطابق + `row_hash` مختلف + الصف مسودة | `UPDATE_DRAFT` |
| مطابق + `row_hash` مختلف + الصف منشور، والكيان يدعم النُسخ | `NEW_REVISION` |
| مطابق + `row_hash` مختلف + الصف منشور، ولا يدعم النُسخ | `BLOCKED_PUBLISHED` |

قاعدة قاطعة: **لا يُستبدل صف منشور تلقائياً أبداً**، وبالأخص بيانات الإجابات. إعادة رفع نفس الملف مرتين لا تُنتج أي تغيير (No-op).

`row_hash` = بصمة القيم المعيارية للأعمدة المعروفة للقالب بعد التطبيع (trim، توحيد المسافات، توحيد الأرقام العربية) — بنفس منهج `canonical-payload-v1` المعتمد في بنك الأسئلة.

## 5. حالة المراجعة والنشر

محوران مستقلان لا يُدمجان في عمود واحد:
- `review_status`: `pending | approved | rejected`
- `publication_status`: `draft | published | archived`

الاستيراد يكتب دائماً بحالة `draft` + `pending`. النشر عملية منفصلة بصلاحية أعلى.
حالياً **لا يوجد أي من العمودين في جداول المحتوى** — عمود `review_status` في القوالب 01/02/03/05/07 لا وجهة له اليوم.

## 6. الفجوات المانعة للتنفيذ (تحتاج Migration معتمَد)

1. **`lesson_assessments.code` غير موجود** → القالبان 07 و08 غير قابلين للتنفيذ. المطلوب: `code text` + `UNIQUE (code) WHERE code IS NOT NULL`.
2. **لا فهرس فريد على `lesson_explanations` و`lesson_resources`** → إعادة الرفع تُنتج تكراراً. المطلوب: مفتاح فريد `(lesson_id, sort_order)` أو تخزين `row_hash`.
3. **لا أعمدة مراجعة/نشر** في `subjects`, `units`, `lessons`, `lesson_explanations`, `lesson_assessments`, `questions`.
4. **`lesson_resources.url` هو NOT NULL** بينما `resource_url` اختياري في القالب 06 → يجب جعله مطلوباً في القالب.
5. **7 أعمدة في القالب 06** (`resource_format`, `local_asset_path`, `thumbnail_url`, `is_interactive`, `attribution`, `license_note`, `notes`) بلا وجهة → تُحذف من القالب أو يُضاف عمود `metadata jsonb`.
6. **`lesson_code` وحده غير كافٍ** في القوالب 04–07 لأن التفرد داخل المادة → يجب إضافة `subject_code` للصف أو جعل مهمة الاستيراد مقيدة بمادة واحدة.
7. **`subjects.slug` مطلوب NOT NULL** وغير موجود في القالب 01 → يُشتق من `subject_code` أو يُضاف عمود.

## 7. أكواد الأخطاء الموحدة

المرجع الواحد: `src/lib/import/import-error-codes.ts` — يدمج مفردات استيراد المحتوى مع مفردات بنك الأسئلة (`QB_IMPORT_CODES`).
لكل كود: الخطورة (`error | warning | info`)، هل يمنع الصف، هل يمنع الملف، ورسالة عربية.
اختبار حارس يمنع أي اختلاف في دلالات الأكواد المشتركة بين المفردتين (`ROW_LIMIT`, `EMPTY_FILE`, `MISSING_VALUE`, `INVALID_CORRECT_INDEX` …).

## 8. الأمان

- الاستيراد متاح لـ `admin` و`content_manager` فقط عبر `requireContentStaffAuth`؛ نوع `config` للإدارة الكاملة فقط.
- أعمدة الإجابات (`correct_index`, `accepted_answers`) لا تُعاد أبداً في تقارير الـ dry-run الموجهة لغير المحررين.
- حدود الملف: 5MB، 1000 صف، والتحقق من مطابقة حجم الـ base64 للحجم المعلن قبل الفكّ.
