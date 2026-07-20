# SECONDARY-FREE-ACCESS-ACCOUNTS-AND-CONTENT-GATES-REVIEW-01

## Decision

**HOLD — NEEDS_USER_APPROVAL_FOR_SECURITY_MIGRATION**

Reviewed commit: `ca011ed44d59a5a99420a4050c707bb16055428f` on
`codex/secondary-free-access-review-01`.

This is a repository-only review. No Supabase/Lovable production migration state
was assumed or verified. No migration or SQL was created or applied, no real
student data was touched, and no deploy/publish or production write occurred.

## Findings

| Severity | Area | Finding | Required action |
| --- | --- | --- | --- |
| MEDIUM | anon / helper RPC | The latest local `can_access_lesson` replacement omits the explicit `auth.uid() IS NOT NULL` guard. Earlier SQL revokes EXECUTE from `anon` but does not revoke the default function privilege from `PUBLIC`; membership in `PUBLIC` can therefore keep the helper executable. `user_can_access_subject_curriculum` can return true for a subject with a null curriculum track even when there is no profile. Repository evidence supports a boolean access-oracle/hardening gap, not direct anonymous content disclosure: content-table RLS policies are scoped to `authenticated`. | User-approved hardening migration plus verification against the deployed DB grants. Explicitly revoke from `PUBLIC` and `anon`, grant only to `authenticated`, and retain an in-function auth guard. |
| HIGH | grade boundary | `can_access_lesson` checks curriculum only. It does not compare the student's `grade_uuid`/legacy `grade_id` with `subjects.grade_id`, so a registered student may access another grade when the curriculum matches. | User-approved hardening migration that adds the same grade compatibility rule used by `start_exam_session` and `grade_unit_practice`. |
| HIGH | subject-only questions / free-access blocker | `can_access_subject` remains subscription-gated in the baseline migration and is not replaced by the free-access migration. Questions with `lesson_id IS NULL` therefore do not follow the free-access pivot for registered students without subscriptions. This blocks the required free-access behavior; no access bypass is established by this finding. | User-approved migration replacing `can_access_subject` with authenticated + grade + curriculum checks and no subscription requirement. |
| MEDIUM | staff route separation | The authenticated layout exempts `content_manager` from profile completion but does not redirect it away from student routes (`/app`, lessons, exams, wallet, subscription, payments). Admin-section helpers correctly deny full-admin financial paths. No data-access exploit was demonstrated; this is a role/UX boundary gap because direct student-route entry remains possible. | A separate code PR should add a centralized staff/student route boundary. Coordinate ownership of `src/routes/_authenticated/route.tsx`; do not solve this only with hidden navigation. |
| PASS (repository evidence) | registered free exam/practice | Local `start_exam_session` and `grade_unit_practice` contain auth, grade, and curriculum checks and no `has_active_subscription`/`subscription_required` gate. | Verify the exact definitions in the deployed DB before release. |
| PASS (repository evidence) | cross-student isolation | Profiles, progress, unit attempts, exam sessions, and exam answers have owner-based RLS in local migrations, with admin exceptions where intended. | Add live local-Supabase integration tests when a disposable test DB is available. |
| PASS (UI) | financial freeze | `/wallet`, `/subscription`, `/payments`, and `/payments/new` render free-access notices/returns while `STUDENT_FREE_ACCESS` is true. Financial/admin code remains present. | Keep the flag enabled; later strengthen route-level staff separation. |
| PASS | admin finance separation | `admin-route-access.ts` denies content managers access to students, users, payment methods, payment requests, and wallet top-ups while retaining content sections. | No code change required in this file. |

Security review count: **CRITICAL=0 / HIGH=2 / MEDIUM=2**. The required acceptance
threshold (`0/0/0`) is not met.

## Direct scenarios

| Scenario | Repository result |
| --- | --- |
| Registered student without subscription opens formerly paid lesson/resources | Free-access intent exists, but HOLD because lesson grade and anon hardening are incomplete and deployed migration state is unknown. |
| Registered student starts practice/exam without `subscription_required` | PASS in local SQL definitions; deployed DB verification required. |
| Wrong grade/curriculum student denied | PASS for exam/practice; FAIL for lesson grade boundary. |
| anon denied | Explicit in-function denial exists for exam/practice. Lesson/subject helper invocation needs PUBLIC/anon hardening; repository evidence does not show anonymous content-table access because those RLS policies require `authenticated`. |
| content_manager denied student/payment routes | FAIL for direct student routes; PASS for full-admin finance routes. |
| Student cannot read another student's data | PASS by static RLS evidence; no live DB test was run. |
| Student payment pages do not request payment | PASS while the free-access flag is enabled. |

## Proposed hardening migration scope (proposal only)

Approval is required before creating or applying SQL. The future migration should:

1. Replace `can_access_lesson` and `can_access_subject` so both require a non-null
   authenticated caller, match grade (UUID plus legacy compatibility), match
   curriculum, permit the admin bypass, and never require a subscription.
2. Revoke EXECUTE from both `PUBLIC` and `anon` for these functions and related
   subject/curriculum helper functions, then grant EXECUTE only to `authenticated`.
3. Reassert the existing restricted grants for `start_exam_session` and
   `grade_unit_practice`.
4. Test with disposable identities: anon, matching student, wrong grade, wrong
   curriculum, content manager, and admin. Verify actual `information_schema`/
   `pg_proc` grants in the target environment before declaring PASS.

No SQL text is included here intentionally.

## Tests and limitations

Added `tests/security/free-access-content-gates.static.test.mjs`, runnable with:

```text
node --test tests/security/free-access-content-gates.static.test.mjs
```

The static suite is an **audit characterization** of the reviewed baseline. Its
known-gap assertions intentionally detect conditions that must be remediated; they
must not be interpreted as a secure regression contract to preserve. It covers the
current free-access RPC behavior, detects the database gaps above, checks financial UI freezing, admin-finance separation,
cross-student owner RLS evidence, and the missing centralized content-manager
redirect. It does not prove deployed database state and does not replace disposable
Supabase integration tests.

Build and lint require installed workspace dependencies. In this isolated worktree,
`npm run build` could not locate `vite` and `npm run lint` could not locate `eslint`;
no dependency installation or lockfile change was performed because package/lock
ownership belongs to the exam worker. These checks must be rerun in the integration
workspace or CI.

## Required user decisions

1. Approve creation (not production application) of the proposed security
   hardening migration in a subsequent isolated PR.
2. Approve/assign the centralized content-manager redirect change in
   `src/routes/_authenticated/route.tsx` after checking Wave-1 file ownership.
3. Provide explicit evidence of the Lovable/Supabase migration state or authorize
   read-only deployed-schema/grant verification. Until then, production status is
   `NEEDS_USER_INPUT`.
