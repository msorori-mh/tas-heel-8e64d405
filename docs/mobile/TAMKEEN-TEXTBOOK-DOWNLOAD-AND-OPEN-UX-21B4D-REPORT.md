# TAMKEEN_TEXTBOOK_DOWNLOAD_AND_OPEN_UX_21B4D — Source/UX Report

## G0 — Source / Stack Lock

- BRANCH: `edit/edt-ad647555-6f71-4718-953d-ea96452363ae`
- START_HEAD: `bcd1053f` (Updated Android callback URI)
- END_HEAD: this batch (source-only; no deploy, no merge)
- git status at start: clean working tree
- `21B4B_IMPLEMENTATION_SHA` = offline shell + local registry landed at/before `bcd1053f`
- `21B4C_R1_IMPLEMENTATION_SHA` = `bcd1053f` (HTTPS App Link rebase)

21B4D is built on top of 21B4C-R1. No Offline/Auth contract was modified —
`reader-runtime.ts`, `local-textbook-registry.ts`, `native-oauth.ts`,
`TamkeenPdfViewerPlugin.java`, and `mobile/www/index.html` are untouched.

Status preserved (not closed):
- 21B4B = PASS_READY_FOR_PHYSICAL_ANDROID_RETEST
- 21B4C-R1 = PASS_SOURCE_READY_PENDING_HTTPS_APP_LINK_CONFIG

## Changed files

- `src/components/textbooks/SubjectTextbooksSheet.tsx` (rewritten UX layer)
- `tests/student/textbook-download-open-ux-21b4d.static.test.mjs` (new, 16 tests)
- `docs/mobile/TAMKEEN-TEXTBOOK-DOWNLOAD-AND-OPEN-UX-21B4D-REPORT.md` (this file)

No DB migration, no storage mutation, no OAuth config change, no assetlinks.

## Before / After UX

| Aspect | Before | After |
| --- | --- | --- |
| Download completion | ambiguous ("فتح" appeared with unclear status) | explicit status line per state |
| Offline readiness | text mixed with technical wording | "محفوظ للاستخدام دون إنترنت" with check icon |
| Open action | small "فتح" competing with 3 other buttons | single primary "فتح الكتاب" |
| Delete | prominent "حذف من الجهاز" next to open | secondary (…) menu → "إزالة التنزيل" + confirmation |
| Reader prep | unclear vs. file download | separate line: file saved vs. reader prep |
| Metadata | version hash + bytes shown | book type + coverage chips only |
| Errors | generic "تعذّر إكمال التنزيل" | 4 targeted Arabic messages with matching action |

## State machine (single contract)

```text
NOT_DOWNLOADED     → CTA "تنزيل" (+ ghost "قراءة الآن" online)
DOWNLOADING        → progress + "جارٍ التنزيل…" ; only CTA = "إيقاف التنزيل"
PREPARING_READER   → "تم حفظ الملف · جارٍ تجهيز القارئ…"
READER_NOT_READY   → "الملف محفوظ · يحتاج تجهيز القارئ" ; primary "تجهيز القارئ"
                     (never re-downloads the PDF)
OFFLINE_READY      → "محفوظ للاستخدام دون إنترنت" ; primary "فتح الكتاب"
```

`OFFLINE_READY = PDF_READY && READER_READY` — unchanged from 21B3.

## Delete semantics

- Hidden behind the (…) menu, labelled "إزالة التنزيل".
- AlertDialog confirmation: "سيتم حذف النسخة المحفوظة من هذا الجهاز فقط،
  ويمكنك تنزيلها مرة أخرى لاحقاً."
- Effect: `removeFile(textbookId)` + `unregisterLocalTextbook(textbookId)`
  → UI returns to NOT_DOWNLOADED. No DB delete, no `subject_textbooks` write.

## Offline integration

- On successful download the registry entry is written with
  `offlineReady = isReaderReady()`; `markLocalTextbookOfflineReady` keeps the
  flag in sync after a later reader prep. Only OFFLINE_READY books appear in
  "كتبك المحفوظة" in the offline shell.
- Native security boundary unchanged: `openTextbook({ textbookId })` only; no
  filesystem path crosses the bridge.

## Multiple books & semester isolation

Query rules unchanged (`listStudentTextbooks`): FULL_ACADEMIC_YEAR books show in
both semesters with the same textbook id (single cache/registry entry, no
duplicate download); SEMESTER_SPECIFIC books only in their own semester. Cards
now render book type + coverage chips so Quran (2× MAIN), Math (2× MAIN +
EXERCISE full year) and Chemistry (MAIN + EXERCISE full year) read clearly.

## Mobile & accessibility

- Touch targets `h-10`; icon menu `h-9 w-9` with an accessible name.
- Long titles wrap (`break-words`, no truncation, no horizontal overflow).
- Status lines use icon + text (not colour alone) and `aria-live="polite"`.
- Errors use `role="alert"`; sheet and dialog are `dir="rtl"`.

## Regressions

| Guard | Result |
| --- | --- |
| 21B3_OFFLINE_READINESS | PASS |
| 21B4B_OFFLINE_REGISTRY | PASS |
| 21B4B_NATIVE_SECURITY | PASS |
| 21B4C_AUTH_SOURCE | UNCHANGED |
| SUBJECT_TEXTBOOK_RLS | UNCHANGED |
| 7_REAL_BOOK_ROWS | UNCHANGED |
| LESSON_RESOURCES | UNCHANGED |
| NO_DB_SCHEMA_CHANGE | YES |

## Tests

- `tests/student/textbook-download-open-ux-21b4d.static.test.mjs` — 16/16 PASS
  (covers the 14 required cases: states 1-5, delete placement/semantics,
  full-year identity, semester isolation, native textbookId, missing local file,
  RTL/mobile markup, 21B3 and 21B4B regressions)
- `tests/student/textbook-first-offline-open-21b3.static.test.mjs` — PASS
- `tests/mobile/android-offline-shell-21b4b.static.test.mjs` — PASS
- `tests/mobile/android-google-oauth-return-21b4c.static.test.mjs` — PASS
- Typecheck + build: PASS
- Android build: not executed (no Android SDK in this environment) — not a failure.

## Physical Android pending items

- Field retest of download → offline open on a real device (21B4B).
- HTTPS App Link verification (`assetlinks.json`, SHA-256) still pending (21B4C-R1).

## FINAL VERDICT

PASS_SOURCE_READY_FOR_UI_REVIEW
