# TAMKEEN_SUBJECT_TEXTBOOK_MULTI_BOOK_TYPES_21B_A3

تاريخ: 2026-08-18 · لا كتابة على الإنتاج · لا رفع ملفات · لا نشر.

## 1) AUDIT — النموذج الحالي (قبل A3)

```
CURRENT_BOOK_TYPE_FIELD=NONE          (لا يوجد أي عمود يميّز نوع الكتاب)
CURRENT_UNIQUE_CONSTRAINT=subject_textbooks_scope_path_uidx
  (subject_id, COALESCE(curriculum_track_id,'000…0'), storage_path, COALESCE(semester,0))
CURRENT_MULTI_BOOK_SUPPORT=PARTIAL
```

- تقنياً: يمكن إدراج صفّين لنفس subject + track + coverage لأن `storage_path` مختلف،
  إذاً «الكتاب الأساسي» و«كتاب التمارين» يتعايشان بدون conflict على مستوى الفهرس.
- دلالياً: **غير مدعوم** — لا حقل يميّز النوع، فالتمييز كان يعتمد على `title` فقط،
  ولا ترتيب ولا Badge للطالب. لذلك A3 مطلوبة.

## 2) العقد المستهدف

| البُعد | القيم |
|---|---|
| `book_type` | MAIN_TEXTBOOK / EXERCISE_BOOK / OTHER |
| `coverage_type` | FULL_ACADEMIC_YEAR (semester NULL) / SEMESTER_SPECIFIC (semester 1\|2) |

بُعدان مستقلان تماماً: نوع الكتاب لا يحدّد الفصل، والتغطية لا تحدّد نوع الكتاب.
لا يوجد أي hard-code لأسماء المواد في القاعدة أو الكود.

## 3) النتائج

```
BOOK_TYPE_MODEL=book_type text NOT NULL DEFAULT 'MAIN_TEXTBOOK' CHECK IN (MAIN_TEXTBOOK, EXERCISE_BOOK, OTHER)
COVERAGE_MODEL=coverage_type + semester (قيد 21B-A2 محفوظ كما هو)
MAIN_TEXTBOOK_SUPPORTED=YES
EXERCISE_BOOK_SUPPORTED=YES
OTHER_SUPPORTED=YES
MULTIPLE_BOOKS_SAME_SUBJECT_TRACK_COVERAGE=YES
UNIQUE_CONSTRAINT=(subject_id, COALESCE(track,'000…0'), book_type, coverage_type, COALESCE(semester,0), storage_path)
  — أقل قيد يمنع تكرار السجل نفسه (نفس النطاق + نفس البايتات). العنوان (title) ليس جزءاً من الهوية.
ADMIN_UX=/admin/textbooks: «نوع الكتاب» (أساسي/تمارين/ملحق) + «نطاق الكتاب» (عام كامل/فصل محدد) مع
  إظهار مُحدِّد الفصل شرطياً، وBadge للنوع في قائمة الكتب، والاستبدال يحافظ على النوع.
STUDENT_UX=زر [كتب المنهج] يعرض كل الكتب المخوّلة مرتبة MAIN → EXERCISE → OTHER مع Badge:
  الكتاب الأساسي / كتاب التمارين / ملحق، وفلترة الفصل كما في A2.
OFFLINE_CACHE_MODEL=مفتاح الكاش = textbook_id (كما في 18C)
  FULL_YEAR_MAIN_DOWNLOAD_ONCE=YES
  FULL_YEAR_EXERCISE_DOWNLOAD_ONCE=YES
  MAIN_AND_EXERCISE_CACHE_KEYS_DIFFER=YES  (صفّان مختلفان ⇒ معرّفان مختلفان)
  نفس TEXTBOOK_ID الظاهر في الفصلين ⇒ نفس الكاش (تنزيل واحد).
PRODUCTION_ROWS=0
MIGRATION_REQUIRED=YES (minimal follow-up)
MIGRATION_FILE=docs/migrations-pending/20260825010000_subject_textbook_multi_book_types_21b_a3.sql
PG17=PASS (upgrade / fresh / idempotent / verify)
RLS=UNCHANGED (سياستا القراءة كما هي؛ ACL: authenticated=r فقط، service_role=ALL)
ROLLBACK=PASS (موثّق داخل ملف الترحيل ومختبر محلياً)
PRODUCTION_WRITE=NO
```

## 4) نتائج اختبار PG17 (محلي فقط)

- `APPLY_OK` على schema الإنتاج الحالي (post A2) — `tests/migrations/subject-textbooks-21b-a3-baseline.sql`
- `REAPPLY_OK` (idempotent)
- `SIX_FIXTURES_COEXIST_OK`: MAIN+FULL, EXERCISE+FULL, MAIN+SEM1, MAIN+SEM2, EXERCISE+SEM1, EXERCISE+SEM2
- `OTHER_BOOK_TYPE_OK` · `DEFAULT_BOOK_TYPE=MAIN_TEXTBOOK` · `TRACK_REUSE_OK`
- رفض صحيح: نوع غير معروف، FULL_YEAR مع فصل، SEMESTER_SPECIFIC بدون فصل، تكرار السجل نفسه
- `SEM1_VISIBLE=5` و `SEM2_VISIBLE=5` · `RLS=true` · `BOOK_TYPE_NOT_NULL=true`
- `FRESH_OK` · `ROLLBACK_OK`

## 5) الكود

- `src/lib/textbooks/subject-textbook.server.ts` — نوع `TextbookBookType`، ترتيب موحّد، كتابة/قراءة
  `book_type` مع تراجع آمن إذا لم تُطبَّق الترحيلة بعد (يمنع كسر المعاينة قبل الاعتماد).
- `src/lib/api/subject-textbook.functions.ts` — `bookType` في عقد الربط.
- `src/lib/textbooks/subject-textbook-client.ts` — اكتشاف الطالب + ترتيب + تسميات Badge.
- `src/components/admin/SubjectTextbooksManager.tsx` و `src/components/textbooks/SubjectTextbooksSheet.tsx` — الواجهات.

## الحكم

`TAMKEEN_SUBJECT_TEXTBOOK_MULTI_BOOK_TYPES_21B_A3 = PASS_READY_FOR_MULTI_BOOK_GATE`

بانتظار: `APPROVED_PRODUCTION_21B_A3_MULTI_BOOK_TYPES_APPLY` قبل أي تطبيق على الإنتاج،
ولم تبدأ 21B1 ولا أي رفع ملفات.
