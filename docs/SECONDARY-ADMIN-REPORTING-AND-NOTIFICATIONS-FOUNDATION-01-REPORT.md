# SECONDARY-ADMIN-REPORTING-AND-NOTIFICATIONS-FOUNDATION-01

## Decision

`HOLD_ADMIN_REPORTING_NOTIFICATIONS_FOUNDATION`

## Baseline

- Latest starting `origin/main`: `24c1655c6959e39cc3179ee0ce9ad16b3e8ee35f`.
- Branch: `feature/admin-reporting-notifications-foundation-01`.
- GATE-0 passed before implementation: `npm ci`, typecheck, 8/8 unit tests, 7/7 PWA policy tests, and client/SSR build.

## Implemented

- Added `/admin/reports` as a full-admin-only, Arabic RTL, mobile-first reporting page.
- Added its navigation entry to `AdminLayout`; the existing role filter hides it from `content_manager`.
- Added aggregate cards for registered students, subjects, lessons, questions, exam sessions, completed lessons, average submitted-exam percentage, and latest anonymous learning activity time.
- Added most-active-subject and recent-exam summaries. They contain no student name, user ID, email, phone, answers, or result JSON.
- Added loading, RLS/error, and empty states plus manual refresh.
- Added an educational-notification planning section for new lessons, new exams, progress encouragement, and study tips.
- Added pure aggregation helpers and unit tests for percentage and subject activity calculations.

## Tables used through the normal authenticated Supabase client

- `profiles`: exact count only.
- `subjects`: exact count and safe subject names through exam-template relations.
- `lessons`: exact count only.
- `questions`: exact count only; answer columns are never selected.
- `exam_sessions`: exact count plus at most 250 submitted sessions using only ID, score totals, timestamps, and template/subject labels.
- `exam_templates`: title and subject relation only.
- `user_progress`: completed-row count and latest aggregate activity timestamp only.

No payment, wallet, subscription, storage, or authentication table is queried or modified.

## RLS and access boundaries

- The route calls `useRequireAdminSection("full")`; queries remain disabled until a full admin is confirmed.
- `/admin/reports` is explicitly excluded from content-manager route and sidebar access.
- Existing RLS allows full admins to read the required aggregate source rows. No RLS bypass is attempted.
- If a deployment has narrower policies than the repository, the page shows a safe generic error and does not retry with elevated credentials.
- No `service_role`, `supabaseAdmin`, privileged client, student identity, email, phone, answer payload, or result JSON is used.

## Deferred

- No notification delivery, Edge Function, Cron, push notification, or scheduling system.
- No per-student report or personally identifiable drill-down.
- No new charts library or advanced analytics.
- Average and subject activity are intentionally based on the latest 250 submitted sessions to keep the client query bounded. Server-side durable aggregates require a separately reviewed future design.

## Final validation

- `npm ci`: **PASS** from a clean, worktree-local dependency installation.
- `npx tsc --noEmit`: **PASS**.
- `npm test`: **PASS**, 14/14 tests, including full-admin/content-manager route-policy coverage.
- `node tests/pwa/service-worker-policy.static.test.mjs`: **PASS**, 7/7 tests.
- Scoped ESLint for all changed TypeScript/TSX files: **PASS**. Full repository lint remains outside this phase because of the established CRLF/Prettier baseline.
- `npm run build`: **PASS** for client and SSR bundles with existing non-fatal bundler/chunk warnings.
- GitHub Web CI run `29969632448`: **BLOCKED BEFORE START**. GitHub created no runner and executed no steps. Its check annotation states that recent account payments failed or the spending limit must be increased. This is an external repository/account billing blocker, not a code/test failure.

Owner action required: resolve GitHub Billing & plans/spending-limit status, then re-run the failed `Web CI` check on PR #26. The phase remains HOLD until that published run passes.

## Changed files

- `src/routes/_authenticated/admin.reports.tsx`
- `src/components/admin/AdminLayout.tsx`
- `src/lib/admin-route-access.ts`
- `src/lib/admin-route-policy.ts`
- `src/lib/admin-route-access.test.ts`
- `src/lib/admin-reporting.ts`
- `src/lib/admin-reporting.test.ts`
- `src/routeTree.gen.ts` (generated route registration only)
- `docs/SECONDARY-ADMIN-REPORTING-AND-NOTIFICATIONS-FOUNDATION-01-REPORT.md`

## Safety

- Migration required: **no**.
- SQL or production write: **no**.
- Deploy/Publish: **no**.
- Authentication or Storage change: **no**.
- Functional payment/wallet/subscription change: **no**.
- Notification sent: **no**.
