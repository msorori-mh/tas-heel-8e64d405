# SECONDARY STUDENTS APP — IMPLEMENTATION QUEUE 01

## P0

1. `NEEDS_USER_INPUT`: authorize preparation (not application) of a hardening migration for grade/curriculum lesson access, free authenticated `can_access_subject`, and explicit RPC grants.
2. Add DB integration tests for registered/no-subscription lesson and resources access, wrong grade/curriculum denial, anon denial, owner isolation, subject-only questions, exam start, result submission, and answer secrecy.
3. Resolve the `content_manager` route policy decision, then implement and test the chosen boundary.
4. Keep PR #16 unmerged while HIGH findings remain; retain PRs #17/#18 for merge only after the wave-wide security and operational gates are green.
5. Establish Web CI for test, typecheck, build, scoped/full lint policy, and independent review evidence.
6. `NEEDS_USER_INPUT`: decide whether line-ending normalization may be handled in a dedicated non-feature PR.

## P1

1. Merge eligible WAVE-1 PRs only after the security gate is 0/0/0, in the required order, refreshing `origin/main` and rebuilding after each merge.
2. Expand student learning smoke/integration coverage for subjects, units, lessons, resources, progress, search, phone layout, and empty states.
3. Complete exam strengths/weaknesses analysis, attempts, retakes, and performance accuracy tests.
4. Start `SECONDARY-PWA-MOBILE-READINESS-FOUNDATION-01` only after WAVE-1 stability: manifest, secure service worker, offline fallback, install prompt, safe areas, Android installability, iOS notes, and explicit sensitive-cache exclusions. Exams remain online-required.

## P2

1. Start `SECONDARY-ADMIN-REPORTING-AND-NOTIFICATIONS-FOUNDATION-01` after PWA: student/progress/exam/usage/data-quality reporting, educational notifications, and application errors.
2. Address bundle-size/code-splitting warnings.
3. Evaluate Flutter only after PWA stability and complete tests.

## Explicitly out of scope

- Deploy, publish, or production writes.
- Applying migrations/SQL without separate explicit approval.
- New subscription features or deletion of financial infrastructure.
- Editing real student data.

Current decision: `HOLD_SECONDARY_STUDENTS_APP_MULTI_AGENT_CYCLE`.
