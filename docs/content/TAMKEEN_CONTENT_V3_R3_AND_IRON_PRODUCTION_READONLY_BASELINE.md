# TAMKEEN_CONTENT_V3_R3_AND_IRON_PRODUCTION_READONLY_BASELINE

MODE: STRICT READ-ONLY · No INSERT/UPDATE/DELETE/DDL/RPC mutation executed · No migration · No deploy · No publish.

LOCKED CONTEXT
- CONTENT_V3_R3_SHA = f42c22b9f013834b78347bf125d0742363dc27e0
- CONTENT_V3_R3_MIGRATION_SHA256 = 6378CAACEB941066C6CF360EAEFFC6F63581BED53FF59908F4454AB2F53CDF0D
- IRON_GOLDEN_PACKAGE_SHA = 8801074d805710bbddfb02718a89700ced983b9d

---

## A1 — PRODUCTION SCHEMA TRUTH

| Assertion | Result |
| --- | --- |
| `practice_attempts.lesson_id` | **ABSENT** (0 columns) — matches R3 expectation |
| `practice_attempts.lesson_assessment_id` | **PRESENT** (FK → `lesson_assessments(id)` ON DELETE RESTRICT) |
| `lesson_assessments.lesson_id` | PRESENT (FK → `lessons(id)` ON DELETE CASCADE) |

Actual relationship (confirmed):
`practice_attempts → lesson_assessments → lessons`
`practice_attempt_questions → practice_attempts` + `→ questions` + `→ question_revisions` (RESTRICT, revision pinning intact)
`assessment_questions → lesson_assessments` + `→ questions`
`lesson_capability_lifecycle → lessons`
`subject_textbooks → subjects` + `→ curriculum_tracks`

**CONTENT_V3_SCHEMA_MATCH = PASS** (no STOP_SCHEMA_MISMATCH)

---

## A2 — 20C PRODUCTION STATE (read-only preflight)

| Check | Value |
| --- | --- |
| lifecycle rows total | 104 |
| duplicate (lesson_id, capability) | 0 |
| orphan rows (missing lesson) | 0 |
| invalid capability names | 0 |
| invalid statuses | 0 |
| READY anomalies (READY with no ready_at and no snapshot) | 0 |
| legacy `originalBookPdf` rows at READY | 40 |
| `lesson_capability_transition` overloads | 1 (single signature) |
| other RPC overload conflicts (`get_lesson_full_content`, `get_lesson_safe_extras`, `create_practice_attempt_with_snapshot`, `grade_lesson_quiz`) | 1 each — none |
| schema drift vs R3 expectations | none detected |

Status distribution: every existing row is `READY` —
officialBookContent 21 · tamkeenExplanation 40 · originalBookPdf 40 · checkUnderstanding 1 · lessonAssessment 1 · quickReview 1.

**PRODUCTION_20C_STATE = PASS_COMPATIBLE**

---

## A3 — VISIBILITY BASELINE

- CURRENT_STUDENT_VISIBLE_LESSONS = **40** lessons carry ≥1 READY lifecycle row (lessons total = 40; lifecycle-managed = 40)
- CURRENT_READY_CAPABILITIES = officialBookContent 21 · tamkeenExplanation 40 · quickReview 1 · checkUnderstanding 1 · lessonAssessment 1 · originalBookPdf 40 (legacy, excluded from V3 journey)
- LEGACY_VISIBLE_CONTENT = 40 `originalBookPdf` READY rows + 40 `lesson_resources` rows; V3 source already excludes `originalBookPdf` from the student journey (21B4E), so these are admin/legacy reference only
- POTENTIAL_SECURITY_FIX_LOSS = **NONE** — no capability currently relies on a policy the R3 migration would relax; all lifecycle rows are valid and READY
- POTENTIAL_UNEXPECTED_LOSS = **LOW/NONE** — lessons whose only READY capability is `originalBookPdf` = **0**, so no lesson goes dark when the legacy PDF stops counting
- POTENTIAL_UNEXPECTED_GAIN = **NONE** — no DRAFT/REVIEW rows exist, so no unpublished content can become visible

Supporting content inventory: lesson_book_contents 21 · lesson_explanations 40 · lesson_summaries 1 · lesson_resources 40 · subject_textbooks 7.

---

## A4 — GOLDEN QURAN PRESERVATION BASELINE

- LESSON_ID = `16c10040-7a7b-4647-add2-4aa4d3f70583`
- lesson slug / code = `lesson-g10-001-001` · title = «مكانة القرآن الكريم وكمال قدرة الله»
- subject_id = `1234e882-b0b2-499a-bd66-f91f480e1081` (القرآن الكريم، الصف الأول الثانوي) · semester = 1 · sort_order = 1 · unit_id = NULL
- lifecycle: officialBookContent READY · tamkeenExplanation READY · quickReview READY · checkUnderstanding READY · lessonAssessment READY · originalBookPdf READY (legacy)
- student visibility = VISIBLE (managed lesson, 5 non-legacy READY capabilities)
- DB rows: lesson_book_contents 1 · lesson_summaries 1 · lesson_resources 1
- Approved structured package (repo, `src/content/official-textbook/pilot-20a1b/approved.json`): **31 blocks**, block-type breakdown paragraph 11 · heading 9 · quran_verses 2 · verse_meaning 2 · figure 2 · list 1 · lesson_header 1 · objectives 1 · official_activity 1 · official_textbook_assessment 1; **3 approved figure assets** (`pilot-b025-01`, `pilot-b027-01`, `pilot-b027-02`) carried by 2 figure blocks.
- OBSERVATION (no action taken): the production `lesson_book_contents.content` row for this lesson is **127 characters of plain text**, i.e. the 31-block structured package is NOT yet materialised in the production DB — it lives only in the repo pilot package. Recorded as a **CONTENT/BINDING GAP**, not a schema gap.
- Nothing changed.

---

## B1 — GRADE 12 CHEMISTRY RESOLUTION

| Field | Value |
| --- | --- |
| GRADE_ID | `03780461-126a-4c63-bd1b-493098582dd9` |
| GRADE_CODE | `grade-12` (الصف الثالث الثانوي, sort_order 3) |
| SUBJECT_ID | **NOT FOUND** — grade 12 has **0 subjects** in production (grade 10 = 16 subjects, grade 11 = 0) |
| SUBJECT_CODE | N/A |
| SANAA_TRACK_ID | `cbbe62a4-1e49-4805-9640-c23347b15619` |
| SANAA_TRACK_CODE | `sanaa` |
| ADEN_TRACK_ID | `7751f472-ef61-4b50-b940-0521eac2baef` |
| ADEN_TRACK_CODE | `aden` |
| (other) | `ff9ab852-b5f0-4ece-aacf-2ad626069916` / `other` |

The only chemistry subject in production is grade 10: `4fa04dd5-b4dd-41fd-bcd4-ff086d4e046a` (الكيمياء، الصف الأول الثانوي). Nothing created.

## B2 — IRON LESSON

- LESSON_EXISTS = **NO** (no lesson matching «حديد» / `iron` / `Fe`; and no grade-12 chemistry subject to hold one)
- LESSON_CREATION_REQUIRED = **YES** (recorded only; not created)
- Prerequisite also missing: grade-12 chemistry SUBJECT_CREATION_REQUIRED = YES, plus its unit.

## B3 — EXISTING TEXTBOOKS (grade 12 chemistry)

| Book | EXISTS | ID | BOOK_TYPE | COVERAGE_TYPE | TRACK | STORAGE_OBJECT | HASH |
| --- | --- | --- | --- | --- | --- | --- | --- |
| كتاب الكيمياء — صنعاء | NO | — | — | — | — | — | — |
| كتاب الكيمياء — عدن | NO | — | — | — | — | — | — |
| كتاب الأنشطة والتجارب | NO | — | — | — | — | — | — |

`subject_textbooks` holds 7 rows, all grade 10 (القرآن ×2, الرياضيات ×3 incl. EXERCISE_BOOK, الكيمياء ×2 incl. EXERCISE_BOOK), all with `curriculum_track_id = NULL`. No files uploaded.

## B4 — IRON EXISTING CONTENT

Not applicable — lesson does not exist. Baseline counts = 0 for lesson_book_contents, lesson_summaries, lesson_resources, questions, lesson_assessments, question_targets, question_revisions, lifecycle rows.

Global reference counts: questions 6 · question_revisions 6 · lesson_assessments 1 · assessment_questions 6 · question_targets 6 · practice_attempts 0.

## B5 — EXACT BINDING PLAN (prepared, NOT executed)

Ordered, each step gated behind `APPROVED_PRODUCTION_APPLY`:

1. Create grade-12 chemistry subject under `03780461-…` (+ unit for the iron chapter).
2. Upload 3 PDFs to `lesson-pdfs` under `subject-textbooks/<subject_id>/…`, record sha256.
3. Insert `subject_textbooks`: MAIN_TEXTBOOK + `curriculum_track_id = sanaa`; MAIN_TEXTBOOK + `aden`; EXERCISE_BOOK `FULL_ACADEMIC_YEAR` shared (track NULL) for الأنشطة والتجارب.
4. Create iron lesson identity (title/slug/semester/sort_order/unit) + track binding via subject/track mapping.
5. `officialBookContent` → structured blocks into `lesson_book_contents` (official text verbatim, no AI rewrite).
6. `tamkeenExplanationHtml` → HTML package, STATIC profile, managed assets.
7. `lessonSummaryHtml` → `lesson_summaries` + HTML package (STATIC).
8. `mindMapHtml` → HTML package (STATIC).
9. `labExperimentHtml` → HTML package (INTERACTIVE profile, existing sandbox) — applicability OPTIONAL unless declared REQUIRED.
10. `officialBookQuestions` → questions + revisions + `question_targets` + companion answer layer (model answers never in initial client payload).
11. `selfTest` → `lesson_assessments` + `assessment_questions` with pinned revisions and per-option rationale.
12. Lifecycle per capability: DRAFT → preview → REVIEW → READY.
13. Student E2E verification against V3 order and dynamic progress.

---

## FINAL REPORT SUMMARY

```
CONTENT_V3_SCHEMA_MATCH        = PASS
PRODUCTION_20C_STATE           = PASS_COMPATIBLE
VISIBILITY_BASELINE            = 40 visible lessons; 0 lessons legacy-PDF-only; loss/gain risk = NONE
GOLDEN_QURAN                   = PRESERVED_VISIBLE (5 non-legacy READY caps; structured 31-block package repo-only)
GRADE12_ID                     = 03780461-126a-4c63-bd1b-493098582dd9
CHEMISTRY_SUBJECT_ID           = NOT_FOUND (grade 12 has 0 subjects)
SANAA_TRACK_ID                 = cbbe62a4-1e49-4805-9640-c23347b15619
ADEN_TRACK_ID                  = 7751f472-ef61-4b50-b940-0521eac2baef
IRON_LESSON_EXISTS             = NO
IRON_LESSON_ID                 = N/A
IRON_LESSON_CODE               = N/A
SANAA_TEXTBOOK_EXISTS          = NO
ADEN_TEXTBOOK_EXISTS           = NO
SHARED_ACTIVITY_BOOK_EXISTS    = NO
IRON_EXISTING_CONTENT_COUNTS   = all zero (lesson absent)
PRODUCTION_APPLY_BLOCKERS      = none technical for Content V3 R3 migration; awaiting APPROVED_PRODUCTION_APPLY only
IRON_BINDING_BLOCKERS          = grade-12 chemistry subject missing; iron lesson missing; 3 textbooks missing (files not uploaded); curriculum-track binding on subject_textbooks currently NULL everywhere
```

**FINAL VERDICT: BLOCKED_IRON_IDENTITY**

Track A (Content V3 / 21H R3) is production-read-only clean and ready for an apply decision; Track B cannot proceed because the grade-12 chemistry identity chain (subject → unit → iron lesson → textbooks) does not exist in production. No migration, content write, deploy, or publish performed.
