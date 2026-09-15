# Admin school edits and compact directory

Baseline production main 69831f552ab0bfec3a33a4dc48dcd03407e5a6ed (tree
8019adb6740a565b48a8ce296015990b7abca5be). Isolated worktree from the identical
local tree. Scope: edit active school identity labels and compact directory UI.

Desktop table and mobile compact list expose name, governorate, district,
optional locality, linked counts, edit and existing manual merge. Existing
server-side search/governorate filter and 25-row stable paging retained;
range/count/last page and direct page selection added. An out-of-range page
clamps after deletions/merges. No whole-catalog browser fetch.

Admin edit uses invoker public RPC/private definer with require_admin. Reuses
intake validation without writes, rejects duplicate identities, verifies an
optimistic identity snapshot, and shares the existing review/import/merge
advisory lock. The same school ID stays in place. Profile school_id refresh
invokes existing sync trigger to update only school labels. Governorate is
immutable while linked, preventing accidental changes to curriculum settings.
Unlinked schools can change governorate. No new direct table grants or policies.
Successful changes are audited; no-op saves do not create duplicate audit events.

Tests: PG17 fixture covers admin/nonadmin/anonymous, inline errors, duplicates,
stale writes, locality removal, both linked profile types and unrelated fields,
audit and 3000-school last-page/search/governorate queries. E2E uses isolated
fixture API at 320/390/768/1280, edit validation/save, compact layout, navigation
through 3000 rows and filtering. Existing review/merge/intake flows retained.
Supabase CLI generated migration filename in CI; temporary workflow removed.

Deploy migration before UI. DDL adds two functions only; compare school/profile
hashes and counts before/after and validate grants/definer mode. Do not insert
production test schools. Recovery: revert UI and revoke new RPC grants; retain
intentional admin changes and audit records. A completed edit is reversed through
a reviewed new edit, not blanket restoration of old profile data.
