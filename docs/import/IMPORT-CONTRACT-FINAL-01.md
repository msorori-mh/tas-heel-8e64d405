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

## 6. الفجوات السبع — الحالة: **7/7 مغلقة تصميمياً** (مرحلة 02)

المرجع الآلي: `IMPORT_GAP_RESOLUTIONS` في `src/lib/import/import-contract.ts`.
مسودة SQL للمراجعة فقط (**غير مطبَّقة**): `docs/migration-drafts/IMPORT-EXECUTION-READINESS-02.NOT_APPLIED.sql`.

| # | الفجوة | نوع الإغلاق | القرار المُثبَّت |
|---|---|---|---|
| GAP-01 | `lesson_assessments.code` غير موجود | Schema (مسودة) | إضافة `code text` + `UNIQUE (code) WHERE code IS NOT NULL`. النطاق **عام** وليس داخل الدرس، لأن القالب 08 يشير للتقييم بـ `assessment_code` وحده — مطابقاً لنطاق `subjects_code_uniq` و`questions_code_uniq`. |
| GAP-02 | لا مفتاح فريد لـ `lesson_explanations` / `lesson_resources` | Schema (مسودة) | `explanation_code` / `resource_code` (عمود `code`) + `UNIQUE (lesson_id, code)`. **`sort_order` لا يدخل في الهوية إطلاقاً** — إعادة الترتيب ليست تعديل كيان. |
| GAP-03 | لا أعمدة مراجعة/نشر | Schema (مسودة) | جدول جانبي واحد `content_review_state (entity_type, entity_id)` **مرتبط بـ `content_hash`**: أي تغيّر في البصمة يعيد الصف إلى `pending + draft` عبر Trigger، فلا تنجو موافقة قديمة على محتوى جديد. |
| GAP-04 | `resource_url` اختياري بينما العمود NOT NULL | Template فقط | `resource_url` يصبح مطلوباً في القالب 06؛ الغياب يُرفض بكود `MISSING_RESOURCE_URL`. لا DDL. |
| GAP-05 | 7 أعمدة بلا وجهة في القالب 06 | Schema (مسودة) | `lesson_resources.metadata jsonb NOT NULL DEFAULT '{}'` مع **قائمة سماح مغلقة** (`RESOURCE_METADATA_ALLOWLIST`)؛ أي مفتاح خارجها يُرفض. ليس مخزناً حراً. |
| GAP-06 | `lesson_code` وحده غامض | Template فقط | `subject_code` يصبح عموداً مطلوباً في القوالب 04–07؛ `(subject_code, lesson_code)` يحل درساً واحداً عبر `lessons_subject_id_slug_key`، والتطابق المتعدد يُرفض بـ `AMBIGUOUS_LESSON_CODE`. |
| GAP-07 | `subjects.slug` مطلوب وغير موجود في القالب 01 | اشتقاق برمجي | `deriveSubjectSlug(subject_code)`: الأكواد الآمنة تُطابق نفسها، وأي كود آخر → `normalized--<sha256_128(canonical(raw))>` (32 خانة hex = 128 بت). **لا يُدّعى استحالة التصادم**؛ العقد هو: اشتقاق حتمي + `UNIQUE(subjects.slug)` (`subjects_slug_key`) + كشف تصادم صريح عبر `planSubjectSlugs()` + **fail closed** بكود `SLUG_COLLISION` بلا أي كتابة. الفاصل `--` محجوز ويجبر أي كود يحتويه على المسار المُبَصَّم، فالفرعان منفصلان. تطبيع مدخل واحد (`canonicalSubjectCodeInput`) يضمن تطابق مسار المتصفح (Web Crypto) ومسار الخادم. |

ملاحظة حاسمة: «مغلقة تصميمياً» ≠ «مطبَّقة». لا يوجد أي DDL مطبَّق في هذه المرحلة، ولا يزال شرط الانتقال إلى Migration قائماً.


## 7. أكواد الأخطاء الموحدة

المرجع الواحد: `src/lib/import/import-error-codes.ts` — يدمج مفردات استيراد المحتوى مع مفردات بنك الأسئلة (`QB_IMPORT_CODES`).
لكل كود: الخطورة (`error | warning | info`)، هل يمنع الصف، هل يمنع الملف، ورسالة عربية.
اختبار حارس يمنع أي اختلاف في دلالات الأكواد المشتركة بين المفردتين (`ROW_LIMIT`, `EMPTY_FILE`, `MISSING_VALUE`, `INVALID_CORRECT_INDEX` …).

## 8. الأمان

- الاستيراد متاح لـ `admin` و`content_manager` فقط عبر `requireContentStaffAuth`؛ نوع `config` للإدارة الكاملة فقط.
- أعمدة الإجابات (`correct_index`, `accepted_answers`) لا تُعاد أبداً في تقارير الـ dry-run الموجهة لغير المحررين.
- حدود الملف: 5MB، 1000 صف، والتحقق من مطابقة حجم الـ base64 للحجم المعلن قبل الفكّ.

## 9. تصميم Staging / Execute (مرحلة 02 — تصميم فقط)

المصدر الآلي: `src/lib/import/import-staging-design.ts` — `EXECUTION_DESIGN_STATUS = "design_closed_not_applied"`.

### 9.1 جداول Staging
- `import_staging_rows`: صف لكل صف Excel ضمن مهمة، يحمل `natural_key` و`row_hash` و`payload` المعياري و`resolved_refs` و`planned_action` و`target_id`. مفتاح فريد `(job_id, template_key, natural_key)` يمنع تكرار نفس الكيان داخل المهمة. القراءة لطاقم المحتوى فقط.
- `content_review_state`: محورا المراجعة والنشر لكل كيان، مربوطان بـ `content_hash` (GAP-03). النشر بصلاحية `is_full_admin` فقط.

### 9.2 آلة حالة التنفيذ

```text
uploaded → validating → validated → applying → applied
              ↓             ↓          ↓
            failed      cancelled    failed
```

`applied` و`failed` و`cancelled` حالات نهائية؛ لا استئناف، فقط مهمة جديدة.

### 9.3 قواعد التنفيذ (`EXECUTION_RULES`)
- **الذرّية**: قالب واحد = معاملة واحدة؛ فشل صف واحد يُرجع القالب بالكامل، والقوالب اللاحقة لا تُنفّذ.
- **الترتيب**: ترتيب التبعية المعتمد في العقد.
- **Idempotency**: `(job_id, template_key, natural_key, row_hash)`؛ إعادة التشغيل لا تُنتج أي تغيير.
- **إعادة التحقق إلزامية داخل المعاملة** — نتائج dry-run ليست مصدر ثقة عند التنفيذ.
- **الصلاحية**: `is_content_staff` للتنفيذ، `is_full_admin` للنشر، داخل RPC بـ SECURITY DEFINER يعيد فحص الدور خادمياً.
- **`BLOCKED_PUBLISHED` يُبلَّغ عنه ولا يُنفَّذ أبداً** — لا مسار للكتابة فوق صف منشور.
- أسئلة القالب 09 تمر حصراً عبر مسار بنك الأسئلة، لا عبر upsert عام.
