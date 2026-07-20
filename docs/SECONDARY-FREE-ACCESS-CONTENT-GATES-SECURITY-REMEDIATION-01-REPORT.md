# SECONDARY-FREE-ACCESS-CONTENT-GATES-SECURITY-REMEDIATION-01

## Decision

`PASS_READY_FOR_REVIEW`

This change prepares one unapplied security migration. It does not connect to or modify Supabase production.

## Baseline

- Verified base: `origin/main` at `ca011ed44d59a5a99420a4050c707bb16055428f`.
- PR #15 opened the free-access content gates, but the latest `can_access_lesson` definition delegated only to the curriculum helper and did not enforce the student's grade.
- The inherited `can_access_subject` definition still required a subscription, which blocked subject-only questions during the free-access phase.

## Gaps closed

### `can_access_subject(uuid)`

- Preserves the existing signature, `SECURITY DEFINER`, stability, and `SET search_path TO 'public'`.
- Requires a non-null authenticated user.
- Preserves the admin bypass.
- For students, requires a matching profile and matching subject grade. Both normalized `grade_uuid` and legacy `grade_id` are supported.
- A track-specific subject requires the student's non-null `curriculum_track_id` to match. A subject with no track remains common only within its grade.
- Contains no subscription check, so a correctly scoped registered student can reach subject-only questions without `subscription_required`.

### `can_access_lesson(uuid)`

- Preserves the existing signature, `SECURITY DEFINER`, stability, and search path.
- Requires a non-null authenticated user and an existing lesson.
- Delegates the lesson's subject boundary to the hardened `can_access_subject`, preventing cross-grade and wrong-track access.
- Preserves admin access through the subject gate.
- Does not use `is_free`, subscriptions, or public access.

### Grants

- Revokes inherited/default execution from `PUBLIC` for both functions.
- Explicitly revokes `anon` execution.
- Grants execution only to `authenticated`.
- Existing RLS policies scoped to authenticated users can continue calling both signatures.

## Verification coverage

The static security harness asserts:

- correct-grade registered student contract;
- cross-grade denial contract;
- wrong-track denial contract;
- explicit anonymous denial and no new anon grants;
- preserved admin bypass;
- free subject-only access without subscriptions;
- unchanged question policies and no answer/explanation handling;
- unchanged storage and financial systems;
- absence of `DROP TABLE`, `DELETE FROM`, and `TRUNCATE`.

## Safety

- Payment/wallet/subscription flows modified: **no**.
- Storage policies modified: **no**.
- Question or answer-returning functions modified: **no**.
- Tables or production data modified by this PR: **no**.
- Migration applied to Supabase: **no**.
- Deploy/Publish: **no**.

## Validation results

- Static security tests: PASS, 8/8 (`node --test tests/security/free-access-content-gates-hardening.static.test.mjs`).
- Typecheck: PASS (`tsc --noEmit`).
- Scoped lint: PASS for the new static test.
- Client + SSR build: PASS (`npm run build`); existing non-fatal bundler and chunk-size warnings remain.
- `git diff --check`: PASS.
- Forbidden-change scan: PASS; no destructive DML/DDL, new anon grants, storage changes, or financial changes.
- Full repository lint was intentionally not used as a gate for this SQL-only change because the documented baseline has unrelated CRLF/Prettier failures; no lint/CRLF cleanup is included.
