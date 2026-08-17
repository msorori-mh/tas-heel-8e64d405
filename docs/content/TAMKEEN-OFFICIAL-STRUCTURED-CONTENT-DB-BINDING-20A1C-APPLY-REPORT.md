# TAMKEEN_OFFICIAL_STRUCTURED_CONTENT_DB_BINDING_20A1C_APPLY

Date: 2026-08-17 (UTC)
Scope: single authorized row only.

- LESSON_ID = 16c10040-7a7b-4647-add2-4aa4d3f70583
- LESSON_CODE = lesson-g10-001-001
- TARGET = lesson_book_contents.content, ROW_ID = 188ff951-95d3-453a-b350-8c0a65d748ea

## 1. Before-write snapshot (rollback source)

BEFORE_CONTENT_SHA256 = 6eed8632bbb1cf3f9d148d30b48a78080ecebdec611a5f7d4abbdbcc876e952f
BEFORE_UPDATED_AT = 2026-08-16T22:16:52.421311+00:00
BEFORE_CONTENT (verbatim, single line, 95 chars):

```
الفصل الأول - أولاً الحفظ والتفسير - الدرس الأول - سورة السجدة: مراجعة الآيات الكريمة والدلالات
```

## 2. Write

WRITE_PATH = Admin UI → لوحة الإدارة → الدروس → تفاصيل الدرس → "تحرير محتوى الكتاب" (LessonBookContentDialog → UPDATE content)
DIRECT_SQL = NO · MIGRATION = NO · RLS_RPC_CHANGE = NO · STORAGE_MUTATION = NO

Content written = previous text preserved verbatim + blank line + the exact marker the reader expects
(`resolveStructuredDocument` in `src/lib/content/official-textbook/structured-blocks.ts`):

```
TAMKEEN_STRUCTURED_PILOT:20A1B
```

No rewording, no truncation, no block reordering, no verse edits, no image change, no added content.

ROWS_CHANGED = 1
FIELDS_CHANGED = content only (pdf_url, lesson_id, id, created_at unchanged; updated_at is DB-managed)
OTHER_LESSONS_CHANGED = NO

UI enablement note (frontend only, no data effect): `src/routes/_authenticated/admin.lessons.tsx`
now renders `<Outlet />` when a child route matches, so `/admin/lessons/$lessonId` (the official
edit path) is reachable. No business logic changed.

## 3. Post-write data verification

ROW_EXISTS = YES
STRUCTURED_MARKER_PRESENT = YES
SOURCE_PDF_SHA256 = e4474b4c5f044bf256b8bf443f26d310f794f746b9b80782fbe0580ab2f7cd0d (approved manifest match)
STRUCTURED_BLOCKS = 31
FIGURES = 3
QURAN_REVIEW = APPROVED
PDF_REFERENCE_PRESERVED = YES (pdf_url unchanged)
LESSON_IDENTITY_UNCHANGED = YES
TRACK_MAPPING_UNCHANGED = YES
AFTER_CONTENT_SHA256 = b4c7ff28453e73973e0ea3c830d102f478cd946238bc5f605a5e75b7514b4683
AFTER_UPDATED_AT = 2026-08-17T02:21:41.153687+00:00

## 4. Authorized-student E2E (real lesson, not prototype)

Student: Grade 1 Secondary, Aden track (`omh692022@gmail.com`), route `/lessons/16c10040-...`.

- AUTHORIZED_ACCESS = PASS
- STRUCTURED_READER_RENDERED = YES
- BLOCKS_RENDERED = 31/31
- BLOCK_ORDER = PASS (rendered in approved order: header → objectives → بين يدي السورة → الآيات → معاني الآيات → من هدي الآيات → الشرح → figures → نشاط → التقويم)
- MISSING_TEXT = 0
- FIGURES_RENDERED = 3/3 (pilot-b025-01, pilot-b027-01, pilot-b027-02 served same-origin)
- QURAN_BLOCKS = PASS
- OFFICIAL_ACTIVITY = PASS
- OFFICIAL_ASSESSMENT = PASS
- RTL = PASS (`dir=rtl`)
- NO_HORIZONTAL_OVERFLOW = PASS (390px and 1440px)
- READABLE_LINE_LENGTH = PASS
- CONSOLE_ERRORS = ZERO
- DYNAMIC_CAPABILITIES_18B = PASS (only "اقرأ الدرس" surfaced)
- PDF_REFERENCE_PRESERVED = PASS
- OFFICIAL_CONTENT_LABEL = PASS ("محتوى الكتاب الرسمي — نص الكتاب الوزاري كما هو")

Screenshots: `/tmp/browser/20a1c/e2e_mobile390.png`, `/tmp/browser/20a1c/e2e_desktop1440.png`.

## 5. Rollback

ROLLBACK_REQUIRED = NO
ROLLBACK_PERFORMED = NO
Rollback procedure if ever needed: same admin dialog, restore BEFORE_CONTENT above; expected
CONTENT_SHA256_AFTER_ROLLBACK = 6eed8632bbb1cf3f9d148d30b48a78080ecebdec611a5f7d4abbdbcc876e952f

## 6. Scope

No other Quran lessons, no math/chemistry/other content bound. Pilot remains a single lesson.

## Verdict

TAMKEEN_OFFICIAL_STRUCTURED_CONTENT_DB_BINDING_20A1C = PASS_PRODUCTION_PILOT_BOUND
TAMKEEN_DESIGN_SYSTEM_V2_CONTROLLED_REAL_APP_ROLLOUT_19D = PASS_READY_FOR_PRODUCTION_BASELINE_CHECK
