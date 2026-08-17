# TAMKEEN-SUBJECT-TEXTBOOK-REAL-E2E-21B1 — REPORT

## الحالة: متوقف عند البوابة 1 (ONE REAL FULL TEXTBOOK ONLY)

لا يوجد ملف كتاب منهج كامل حقيقي للقرآن الكريم — الصف الأول الثانوي.

### الأدلة
- `storage.objects` في `lesson-pdfs`: 40 كائناً فقط، جميعها ملفات دروس مفردة (أكبرها 3.3MB) داخل مسارات `<lesson_id>/<uuid>.pdf`.
- `subject-textbooks/%` في التخزين = 0 كائن.
- الأرشيف المرفوع `القرآن_الكريم_للصف_الأول_الثانوي.zip` = 41 مُدخلاً (مجلد + 40 PDF)، كل ملف عنوانه "… الدرس …" أي درس مفرد. لا يحتوي ملف كتاب كامل واحد.
- `subject_textbooks` rows = 0.

### القيود المطبقة (لم تُخرق)
- لم يُنشأ أي كتاب وهمي، ولم تُجمع ملفات الدروس لتكوين كتاب.
- TEXTBOOK_ROWS_CREATED = 0
- STORAGE_OBJECTS_CREATED = 0
- STORAGE_MUTATIONS = 0
- OTHER_SUBJECTS_CHANGED = 0
- ADDITIONAL_MIGRATIONS = 0
- DEPLOY_PERFORMED = NO

## سجل الحقول

| الحقل | القيمة |
|---|---|
| TEXTBOOK_ID | — |
| TEXTBOOK_TITLE | — |
| FULL_TEXTBOOK_FILE | NO (غير متوفر) |
| SUBJECT | القرآن الكريم — أول ثانوي (المستهدف) |
| TRACK_BINDING | — |
| COVERAGE | FULL_ACADEMIC_YEAR (النموذج جاهز في القاعدة) |
| ADMIN_UPLOAD | NOT_RUN |
| STORAGE_OBJECTS | 0 |
| PHYSICAL_FILE_COPIES | 0 |
| SEMESTER_1_DISCOVERY | NOT_RUN |
| SEMESTER_2_DISCOVERY | NOT_RUN |
| SAME_BOOK_BOTH_SEMESTERS | NOT_RUN (مضمون تعاقدياً بعد 21B-A1) |
| DOWNLOAD | NOT_RUN |
| SECOND_DOWNLOAD_REQUIRED | NOT_RUN |
| SAME_LOCAL_CACHE_KEY | CONTRACT=YES (`resourceId = textbook.id`) |
| OFFLINE_OPEN | NOT_RUN |
| DELETE_LOCAL | NOT_RUN |
| REDOWNLOAD | NOT_RUN |
| VERSION_UPDATE | PENDING_REAL_NEW_VERSION |
| RLS | ENABLED (authenticated=SELECT فقط، anon=صفر) |
| CROSS_GRADE | DENY (سياسة `can_access_subject`) |
| CROSS_TRACK | DENY (`curriculum_track_id = current_student_track_id()`) |
| LESSON_RESOURCES_COUNT | 40 (بلا تغيير) |
| QURAN_REGRESSION | PASS (لا مساس) |
| 18B | PASS (لا تغيير) |
| OTHER_TEXTBOOKS_CREATED | 0 |
| OTHER_SUBJECTS_CHANGED | 0 |
| DEPLOY_REQUIRED | غير محسوم — يُقيَّم بعد توفر الملف الحقيقي |
| DEPLOY_PERFORMED | NO |

## BLOCKERS
1. مطلوب ملف PDF واحد لكتاب المنهج الرسمي الكامل (القرآن الكريم — أول ثانوي) يغطي الفصلين، من المصدر الرسمي.
2. بعد رفعه سيتم استئناف المهمة من البوابة 2 (TRACK RESOLUTION) دون أي تعديل آخر.

## الحكم

TAMKEEN_SUBJECT_TEXTBOOK_REAL_E2E_21B1 = BLOCKED_REAL_FULL_TEXTBOOK_FILE_REQUIRED
