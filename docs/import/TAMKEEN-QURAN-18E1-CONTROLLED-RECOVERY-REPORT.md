# TAMKEEN_QURAN_18E1 — CONTROLLED RECOVERY (SHARED APPLY) — CLOSURE REPORT

المادة: القرآن الكريم — الصف الأول الثانوي (`1234e882-b0b2-499a-bd66-f91f480e1081`)

## PHASE 1 — PG17 rehearsal (metadata contract)
`tests/question-bank/runtime/run-pg17-lesson-resource-metadata-18e1.mjs` → 14/14 PASS.

## PHASE 2 — APPLY metadata contract fix
`20260820010000_lesson_resource_upload_metadata_keys_18e1.sql` مطبّق على القاعدة المشتركة.
توسيع القائمة البيضاء بـ: `source, bucket, path, file_name, file_size, uploaded_at, version`
مع تحقق صارم (المسار يبدأ بـ `<lessonId>/`، الامتداد pdf، الحجم موجب ≤ 100MB).

## PHASE 3 — PILOT BIND (existing object)
درس «مكانة القرآن الكريم» — ربط ناجح بدون إعادة رفع البايتات.

## PHASE 4 — PG17 rehearsal (unit model)
`tests/question-bank/runtime/run-pg17-quran-unit-correction-18e1.mjs` → 7/7 PASS
(يشمل حارس الإجهاض عند وجود أي تبعية، وإثبات عدم تغيّر أكواد/ترتيب الدروس).

## PHASE 5 — APPLY unit correction
الدروس الأربعون أصبحت دروساً مباشرة (`unit_id = NULL`)، والوحدات الست الخاطئة حُذفت
بعد إثبات أنها يتيمة. لم يُحذف أو يُنشأ أي درس.

## PHASE 6 — BULK RESUME (لا إعادة رفع)
ربط 39 درساً بالكائنات المرفوعة أصلاً في `lesson-pdfs` عبر
`findUploadedLessonPdfObject` + `bindLessonPrimaryPdf`.

## PHASE 7 — INVARIANTS (كلها PASS)

| Invariant | Value |
|---|---|
| QURAN_LESSONS | 40 |
| UNIT_ID_NULL | 40 |
| QURAN_UNITS | 0 |
| STORAGE_OBJECTS (lesson-pdfs) | 40 |
| LESSON_RESOURCES | 40 |
| PRIMARY_PDFS (is_primary + pdf) | 40 |
| lessons with >1 primary | 0 |
| non-primary/extra resources | 0 |
| fake book content rows | 0 |
| duplicate storage paths | 0 |
| delivery_mode = external_resource | 40 |
| resources touched in other subjects | 0 |

## PHASE 8 — STUDENT E2E
ستة دروس عيّنة تعرض حالياً «هذا الدرس غير متاح» للطالب — وهذا **سلوك صحيح ومقصود**:
كل صفوف `content_review_state` للدروس الأربعين ما تزال `review_status = pending` /
`publication_status = draft`، والمحتوى المستورد لا يظهر للطالب قبل الاعتماد.
لا توجد أخطاء console. إظهار الدروس للطالب يتم عبر مسار مراجعة المحتوى (اعتماد + نشر)
وهو إجراء منفصل خارج تفويض 18E1.

**النتيجة النهائية: 18E1 = CLOSED / PASS**
