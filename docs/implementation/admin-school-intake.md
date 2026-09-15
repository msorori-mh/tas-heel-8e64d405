# Admin school creation and Excel intake

Baseline: ca45a164624f05be2ca046b0c1c94f10ad379045. Scope: approved school
catalog only; no profile creation, edits, bulk relinking or automatic approvals
of pending profiles.

Two actions in the directory: direct creation (governorate, district, school,
optional locality), and Excel intake. Field errors come from the authoritative
RPC. Existing identities are returned, not duplicated.

Excel accepts the four template columns, up to 500 nonempty rows, 5 MiB input,
20 MiB declared expanded ZIP size and 200 ZIP entries. Plain text cells only;
formulas, cached formula results, links and unsupported cell types are rejected.
The Schools sheet is preferred, otherwise the first sheet. Empty rows are skipped
while retaining original row numbers. The generated template contains the current
governorate names and dropdown list, not invented school data.

Preview is read-only. Each row is new/existing/duplicate-in-file/invalid. The
admin explicitly confirms committing valid new rows while skipping others.
Commit repeats validation and deduplication under the existing school-review
advisory lock and unique index; concurrent imports/retries cannot duplicate an
active identity. Known locality remains distinct from an unknown locality.
Result export includes source row, inputs, status and error reason as text.
No uploaded workbook is stored on the server; only bounded normalized inputs
are sent to the RPC. New school identities and the actor are audited.

The public RPC is an invoker wrapper over a private definer that repeats the
existing require_admin check. Anonymous and non-admin access is denied; no new
direct INSERT grant or RLS policy is added.

Verification: focused Vitest/parser and mounted form regression; school PG17
fixture/permissions/preview/commit/replay/profile hashes/concurrent import;
Chromium template download, upload, preview, confirm and result workbook at
320/390/768/1280 widths; full Web CI. Browser tests use isolated fixture data,
not real admin authentication. Local Supabase CLI failed; the filename was
created with the CLI in an isolated CI job and that temporary workflow removed.

Deploy migration before UI, record its version, compare production catalog and
profile hashes before/after DDL. Production verification does not create actual
schools. Rollback UI and revoke the two new function grants if necessary; retain
any schools already intentionally imported and their audit records.
