# LESSON_EXTERNAL_PDF_DELIVERY_13F — Shared Apply Report

**Date:** 2026-08-14 (UTC)
**Verdict:** `LESSON_EXTERNAL_PDF_DELIVERY_13F_SHARED_APPLY = PASS`

## 1. Migration identity

| Item | Value |
| --- | --- |
| Pending filename | `supabase/migrations-pending/20260815010000_lesson_external_pdf_delivery_13f.sql` |
| SHA-256 before apply | `594c7ce753bbd9993c2e387d4468c1dca84d8015fd883385b94440dff11d7e1f` |
| Applied file (moved) | `supabase/migrations/20260815010000_lesson_external_pdf_delivery_13f.sql` |
| SHA-256 after apply (with the applied fix + status comment) | `61e631aafa6f0d8cbcdf8abd6ae5d61ebcc4f325b13c025e9a816de89a005b3a` |

**Single deviation from the pending SQL (required, first attempt failed closed):**
the shared database exposes `public.can_access_lesson(_lesson_id uuid)` (1 argument),
not `can_access_lesson(uuid, uuid)`. The first apply aborted with:

```
ERROR: 42883: function public.can_access_lesson(uuid, uuid) does not exist
```

Fix applied and re-run: `public.can_access_lesson(l.id)` inside
`get_lesson_primary_resource`. No other statement changed. The migration file on
disk now matches the SQL that ran.

## 2. Pre / post state (data integrity)

| Metric | Before | After |
| --- | --- | --- |
| subjects | 16 | 16 |
| units | 0 | 0 |
| lessons | 0 | 0 |
| lesson_resources | 0 | 0 |
| `lessons.delivery_mode` column | absent | present |
| `lesson_resources.is_primary` column | absent | present |

No curriculum data, demo lesson, or demo resource was created or modified. No
existing resource URL (including Youssef's links) was touched — the migration
contains no `INSERT`/data `UPDATE` against curriculum tables.

## 3. SCHEMA gates

- `lesson_resources.is_primary boolean NOT NULL DEFAULT false`.
- Partial unique index `lesson_resources_one_primary_per_lesson ON (lesson_id) WHERE is_primary`
  → hard cap of one primary resource per lesson (verified in `pg_indexes`).
- `lessons.delivery_mode` default `'in_app_content'`, CHECK limited to
  `in_app_content | external_resource`; derived automatically by
  `trg_sync_lesson_delivery_mode` — no manual duplicated value, no URL column on
  `lessons`.
- Legacy in-app lessons keep `in_app_content` (column default + derivation from
  the absence of a primary resource). Book-content path untouched.
- 2 triggers installed: `trg_lesson_resource_project_primary_flag`,
  `trg_sync_lesson_delivery_mode`.

## 4. IMPORT TEMPLATE 06 gates

- `is_primary` present in the central contract (`src/lib/import/import-contract.ts`)
  as an optional `metadata` allowlist field, and in the official template
  `public/content-import-templates/06_lesson_resources_template.xlsx` (regenerated).
- Field is optional — empty leaves `is_primary = false`, so non-primary resources
  behave exactly as before.
- Only one resource per lesson can end up primary: the boundary trigger demotes
  the previous primary, and the partial unique index fails closed on any attempt
  to persist two primaries for the same lesson.

## 5. STUDENT UX gates

- In-app lesson → normal `LessonDetail` page (unchanged).
- Lesson with a primary PDF/Drive resource → `ExternalLessonDelivery` launcher is
  rendered at the top of the lesson (Drive preview iframe + open button).
- External lesson without a primary resource → explicit Arabic notice instead of an
  empty page (added in `src/routes/_authenticated/lessons.$lessonId.tsx`).
- 13E direct lessons without units and unit-based subjects unchanged — no
  route/query change affecting them.

## 6. GOOGLE DRIVE gates

- Valid Drive share links are normalised (`toDrivePreviewUrl` / `toExternalOpenUrl`).
- The system never assumes the file is public: the preview is an iframe; when Drive
  refuses, the user still has the explicit "open" button that lands on the Drive
  permission page.
- An unparsable/invalid URL renders a safe message — no crash.
- Web and Android WebView both use plain `<a target="_blank" rel="noopener noreferrer">`.

## 7. SECURITY gates

- No new `anon` privileges. Both new functions were `REVOKE`d from `PUBLIC, anon`
  and granted only to `authenticated, service_role` — verified via
  `has_function_privilege` (anon = false for both, authenticated = true).
- All new/changed functions run with `SET search_path = public, pg_temp`.
- `get_lesson_primary_resource` is `SECURITY DEFINER` but gated by
  `public.can_access_lesson(l.id)`; it returns no answers or PII.
- `admin_set_primary_lesson_resource` is gated by `public.is_content_staff(auth.uid())`.
- No RLS policy was weakened, dropped, or replaced.

## 8. REGRESSION

- `lovable-exec test`: 170 pass / 2 fail — the two failures are pre-existing and
  unrelated to 13F (`content-import-subject-names.test.ts` expects `pass` but gets
  `warn` from the informational `subjects.slug` notice).
- Import contract / template tests: PASS (the earlier 13F-related failure is gone
  now that the column exists).
- TCS-2 tests: PASS.
- 13E direct-lesson tests: PASS.
- `tsgo --noEmit`: PASS (exit 0).

## 9. Verdict

`LESSON_EXTERNAL_PDF_DELIVERY_13F_SHARED_APPLY = PASS`
