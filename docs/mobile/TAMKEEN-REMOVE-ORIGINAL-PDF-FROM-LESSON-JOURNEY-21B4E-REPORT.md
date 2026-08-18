# TAMKEEN — REMOVE ORIGINAL PDF FROM LESSON JOURNEY (21B4E)

Source / Contract Alignment only. No deploy, no merge, no migration, no DB or storage writes.

## G0 — Source lock

- BRANCH: `edit/edt-68bdbe64-a72c-42eb-a5c6-6726e75dc34a`
- START_HEAD: `b3a7c69f`
- END_HEAD: `b3a7c69f` + working tree changes listed below
- 21B4B_SHA = `64a87ae0` (offline shell / local textbook registry baseline)
- 21B4C_R1_SHA = `bcd1053f` (HTTPS App Link OAuth callback)
- 21B4D_SHA = `465e446f` (textbook download & open UX)

No unrelated changes present. 21B4E is built on top of the 21B4D stack.

## Audit — every original-PDF reference and its classification

| Reference | Location | Class |
|---|---|---|
| `originalBookPdf` capability key + label/status | `src/lib/lessons/lesson-content-contract.ts` | B — ADMIN/LEGACY (kept, moved to legacy layer) |
| `originalBookPdf` inside `STUDENT_CAPABILITY_ORDER` | `src/lib/lessons/lesson-content-contract.ts` | A — removed |
| `originalBookPdf` in readiness levels | `src/lib/lessons/lesson-content-contract.ts` | A — removed (Readiness V3) |
| `showOriginalBookPdf` / `originalPdfGateOpen` / "نسخة الكتاب الأصلية" section | `src/routes/_authenticated/lessons.$lessonId.tsx` | A — removed |
| PDF branch of `PRIMARY_CONTENT` | `src/lib/lessons/lesson-capabilities.ts` | A — fails closed (`LEGACY_ORIGINAL_PDF_ONLY`) |
| `lesson_resources` reads (pdf rows) | contract + capabilities + admin dialogs | B — read-only, preserved |
| Admin `LessonResourcesDialog` / lesson PDF upload | `src/components/admin/*` | B — unchanged, now under a "مرجع قديم (Legacy)" section |
| `subject_textbooks`, `SubjectTextbooksSheet`, local registry, native viewer | 21B / 21B4D surfaces | C — untouched |
| `supportingResources` (video + extra resources) | contract + lesson page | D — kept as a legitimate supporting capability |

## Changed files

1. `src/lib/lessons/lesson-content-contract.ts`
   - `LEGACY_REFERENCE_CAPABILITIES = ["originalBookPdf"]`, `FINAL_LESSON_CAPABILITIES` (7 content capabilities).
   - `STUDENT_CAPABILITY_ORDER` no longer contains `originalBookPdf`.
   - Readiness V3: `bookReady`, `learningReady`, `assessmentReady`, `fullyReady`.
2. `src/lib/lessons/lesson-capabilities.ts`
   - New readiness issue `LEGACY_ORIGINAL_PDF_ONLY`; a PDF-only primary resource is no longer served as a student step (fail-closed, not silently re-introduced).
3. `src/routes/_authenticated/lessons.$lessonId.tsx`
   - "نسخة الكتاب الأصلية" section, its gate state and PDF viewer entry removed from the journey.
4. `src/components/admin/LessonContentWorkspace.tsx`
   - New "مرجع قديم (Legacy)" block outside the final capability list, stating that official textbooks are now Subject-level; data still visible/openable for admins.
5. Tests: new `tests/student/lesson-journey-no-original-pdf-21b4e.test.ts`; realigned `lesson-capability-lifecycle-20c.test.ts`, `lesson-dynamic-capabilities-18b.test.ts`, `quran-primary-pdf-mapping-18c1.test.ts`.

## Student journey — before / after

Before: official content → explanation → mind map → simulation → supporting resources → quick review → check understanding → assessment → performance → **original book PDF**.

After (Content V3): official content → explanation → mind map → lab/simulation → supporting resources → quick review → official questions → self test → performance. No original-PDF card, button or link anywhere in the lesson page. Curriculum books are reached from Subjects → subject → "كتب المنهج".

## Progress — before / after

Before: an available PDF capability added 1 to both numerator and denominator. After: the PDF never appears in `visibleLessonCapabilities`, so the denominator is identical with or without a PDF row, and its absence cannot mark a lesson incomplete or drive "أكمل التالي".

## Readiness — before / after

Before: `learningReady`/`fullyReady` could be influenced by the PDF capability. After (V3):
- `BOOK_READY` = officialBookContent READY
- `LEARNING_READY` = BOOK_READY + explanation + summary + mind map (lab experiment OPTIONAL)
- `ASSESSMENT_READY` = official questions + self test
- `FULLY_READY` = LEARNING_READY + ASSESSMENT_READY

GAP (for a later Content V3 batch, no migration here): there is no per-capability REQUIRED / OPTIONAL / N-A flag in the schema yet, so `labExperimentHtml` is treated as OPTIONAL for every lesson.

## Data preservation proof

No migration, no DB write, no storage mutation, no deletion of `lesson_resources` rows, PDF files or legacy metadata. All changes are read-path/UI/contract only; the admin surface still lists and opens the legacy files.

## Regressions

21B4B offline shell, 21B4C auth, 21B4D textbook UX, subject textbooks + the 7 real books, lesson_resources data, Quran structured blocks, 18B dynamic capability UX and 20C lifecycle: all covered by tests and unchanged.

## Tests

- `bunx vitest run tests/student tests/mobile` → **115/115 passing** (13 new 21B4E assertions).
- `tests/student/direct-lesson-without-unit-13e.static.test.mjs` is a `node:test` file (pre-existing, unrelated to 21B4E); `node --test` → 8/8 pass.
- `tsgo --noEmit` clean; production build succeeds.

## FINAL VERDICT

**PASS_CONTENT_V3_LESSON_JOURNEY_ALIGNED**
