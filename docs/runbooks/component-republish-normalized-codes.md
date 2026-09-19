# Re-uploading a published lesson component

The local batch's Remove button drops the selected file, not its published
materialization. A new upload therefore needs to update the existing canonical row.
The V2 publisher used uppercase explanation and mindmap keys, while the database's
BEFORE triggers store lowercase canonical keys. It missed existing rows and then
violated their unique indexes during INSERT. The verified upload remained intact.

`20260919010000_component_republish_normalized_codes.sql` changes only the two key
assignments in the existing publisher. It uses the same normalizers as the triggers,
preserves the complete remaining function, owner and ACL, and rejects unexpected
assignment drift. Applying it twice is safe. It does not rewrite or remove rows,
alter unique indexes, weaken RLS, change publication receipts or change lab handling.

## Verification and application

The Content Factory PG17 rehearsal installs the production explanation trigger
that the previous fixture omitted. It reproduces both original unique violations,
applies the repair twice, then verifies new-intake replacement, zero-write replay,
stable row identity, changed-file replacement, A-B-A replacement, actual component
withdrawal followed by re-upload, five preserved publication receipts, visibility,
and refusal of an unauthenticated publisher call.

Before application, retain `pg_get_functiondef` and the owner/ACL and compare the
live function body with the source inspected for the change. Run the migration in
one transaction and record version `20260919010000` in the migration ledger. Verify
the exact definition delta, owner/ACL, content counts and hashes before/after.
This is a database-function repair; it takes effect without an APK or web rebuild.

Rollback: restore the captured definition only if the current definition is still
the exact patched version. Preserve any newer independent change. Restoring the
old definition reintroduces the retry defect but does not roll back content data.
