# Reviewed school directory

Original application: `studentamkeen.com`, repository `msorori-mh/tas-heel-8e64d405`, base `dd98d544f6a460d6ee52808e4daaccd0d5b7b652`. PR #230 is independent of the rejected staging/cards changes.

## Behavior

- Students and teachers select an approved school using governorate-scoped Arabic search. District narrows results; locality distinguishes identically named schools.
- An explicit “لم أجد مدرستي” proposal saves in the owner's profile. It does not create an approved directory record and does not require approval to finish registration.
- Existing unreviewed profiles remain editable without a guessed location backfill. Changing a school or governorate requires a new choice. Old clients' free-text edits remain pending and cannot add approved records.
- Full admins review one exact profile, verify the name and location, and either link an existing ID or approve a school. The database checks the review snapshot to reject concurrent changes.
- An active identity is unique by governorate + conservative normalized name + district + locality. Search also tolerates Arabic alef/ya variants. Numbers remain meaningful; no numeric suffix is removed or generated.
- Reviewed merges preserve source IDs as aliases, relink student/teacher profiles atomically, and store exact previous school associations in `school_private.school_audit`. Similar names alone never trigger a merge.
- Student filters use approved IDs, clearly label student counts, and group unreviewed entries under “مدارس قيد المراجعة”.

## Data and access

`public.schools` contains approved school metadata only. Authenticated users can read active schools. RLS and revoked writes prevent user-created directory entries. Proposals retain the existing profile RLS; no public lookup reads profile data. New privileged bodies live in the unexposed `school_private` schema, check the authenticated database admin role, and have no anonymous execute access. Exposed API wrappers are invokers. Teacher saves retain the existing Google-identity and active-subject checks.

There is no automatic production backfill, name cleanup, or profile deletion. Administration must verify each existing proposal's location before linking it. Concurrent identical approvals serialize and reuse the same unique identity. Merge row locks and fresh snapshots prevent stale decisions; a concurrent transaction may receive a retryable database conflict instead of silently overwriting associations.

## Verification

- `tests/schools/directory.sql`: 52 database checks, including RLS/privacy, grants, normalization, legacy preservation, both roles, invalid location, stale review, rollback, alias resolution and audit.
- `tests/schools/concurrency.sh`: two simultaneous approvals, observed lock contention, one school identity and two correct profile links (54 total PostgreSQL checks).
- `tests/schools/*.test.*`: 20 unit/runtime checks including the actual student completion, edit-profile dialog and admin approval/merge components.
- Existing teacher authentication contract: 9 checks.
- Isolated Playwright fixtures: student selection, teacher proposal, governorate reset, admin approval and merge preview at 320/390/768/1280; 44px picker controls, no horizontal overflow, 16 screenshots. These fixtures do not prove real Google login.

## Original production preflight and rollout

The original project was verified through Lovable project `0e731d8e-4edd-4b70-80ca-41ff8733cacc`, latest commit `dd98d544`, whose public configuration points to Supabase `zbdhxyuulyovihjgeqbn`. The Supabase connector itself lacks access; Lovable's direct database connector is available. Read-only preflight on 2026-09-11: PostgreSQL 17.6; 39 student profiles; 5 teacher profiles; 11 distinct student school texts; no missing governorate among named schools; no existing directory/private schema or migration `20260911171430`.

1. Require all CI checks on the release commit and visual review of stabilized screenshots.
2. Recheck the original project identity, original profile row counts/hashes, relevant privileges and migration absence.
3. Apply exactly `supabase/migrations/20260911171430_school_directory_review.sql` transactionally and record that exact migration in history. Do not use a broad pending-migration push: this CLI-generated timestamp precedes some pre-existing future-dated repository migrations. Its wrapper calls the existing teacher RPC; fresh-install tests replay it in timestamp order.
4. Verify that existing profile hashes/counts and policies are unchanged; catalog and audit start empty; FK/index/RLS/grant expectations hold. Check anonymous/ordinary-user denial and no unintended public privileged routines.
5. Deploy the matching application only after the schema succeeds. Verify the original student, teacher and full-admin pages. Existing live Google callback failure, documented separately in PR #229, is not fixed by this feature.

## Recovery

Before application deployment, a failed SQL transaction rolls back completely. After application deployment, roll back the web version if necessary and retain the additive schema and school text fields for compatibility. Do not drop the catalog/columns after real reviews. A mistaken merge requires an administrator to inspect its audit record and restore only the recorded affected associations after checking for subsequent edits; never bulk undo by name. No automatic cleanup of real user data is part of this rollout.
