# Tamkeen administrator audit closure — 2026-10-15

Decision: HOLD for full audit closure. Server safety is applied and verified in production; UI release and remaining source-data/content work are tracked separately.

## Baseline and authority

- Repository: msorori-mh/tas-heel-8e64d405, main f7dd0a59af9b960b941e2cfde6e5211f6a7292c7.
- Production: studentamkeen.com, Supabase zbdhxyuulyovihjgeqbn.
- Hosting project identity was grounded in docs/reviews/release-and-teacher-directory-2026-09-30.md.
- User authorized executing the recommended repair sequence. Existing user records and curriculum are preserved.
- Existing Claude PR #340 at c38df54a is retained as the parent; its shared Arabic forms, paginated units, Arabic not-found page, HTTPS helper and school-directory browser expectation are preserved. The follow-up is a fast-forward rather than a replacement of those commits.
- Direct Supabase connector denied access to this production project. Its managed database SQL interface was used only for necessary production reads and narrowly bounded writes; no AI chat/Max Mode was used.

## Verified production changes

- Applied and recorded 20261015000325_admin_audit_retire_purge_and_review_coverage in one transaction.
- Preserved and applied/recorded PR #340's 20261015010000_disable_prelaunch_curriculum_purge separately; it was a verified no-op after retirement, and cannot reopen the retired endpoints.
- Before: purge enabled=true, not locked. This contradicts the supplied report's disabled-switch assumption.
- After: enabled=false, locked; purge and force-delete functions are SECURITY INVOKER stubs that always reject.
- PUBLIC/anon/authenticated/service_role cannot execute either destructive endpoint.
- Added admin_review_coverage_facts: full-admin predicate, SECURITY INVOKER, preserved underlying RLS, JSON facts without summary text.
- Verified under authenticated role with an existing admin's claim context: 1493 coverage lessons; both student-directory endpoints return 35.
- Standalone EXPLAIN ANALYZE of the facts RPC: 2257.507 ms on this production measurement. This is database time, not a claim about end-to-end mobile latency.
- Exact test live-session ID ba418023-f86d-48b7-8a7f-55aca3cce4e7 was removed through academy.admin_delete_live_session after matching its title and program version.
- Initial cleanup attempt with an admin lacking ACADEMY_CATALOG_MANAGE was correctly rejected; the authorized existing admin with that capability completed it. No capabilities were granted.
- Live sessions: 1 -> 0. Student lessons: 1493 -> 1493. Profiles: 44 -> 44. Teacher profiles: 6 -> 6. Contact submissions: 0 -> 0.
- The original test-session row was captured privately before deletion. It is not committed to this public repository.
- Rollback: UI can be reverted independently; the facts RPC is additive. Keep destructive endpoints retired during any UI rollback. Do not restore prelaunch purge implementations automatically.

## Finding-by-finding status

| Finding | Evidence / implementation                                                                                                                                                                                                              | Remaining gate                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| A1      | Production endpoints retired; production UI tools hidden in source                                                                                                                                                                     | UI release verification                                                                           |
| A2      | Curriculum lesson reads use stable, ranged pagination; safety-limit exhaustion now throws instead of returning a partial count                                                                                                         | Published UI count must be 1493 on this snapshot                                                  |
| A3      | Full-admin inbox, 25-row pages, unread filter, explicit mark-read, errors/retry; existing admin RLS retained                                                                                                                           | Published inbox test; production currently has 0 messages                                         |
| A4      | Live directory and filter options both return 35; 44 is all profiles. Home now uses the directory's count and shares its invalidation prefix                                                                                           | Published home/list comparison                                                                    |
| A5      | One facts RPC, summary fetched only on preview; source filters/coverage behavior retained                                                                                                                                              | Published browser performance measurement                                                         |
| A6      | Current summary coverage is 823/1493 (55.1%), not 787/1481. 670 lessons still lack summaries                                                                                                                                           | Editorial/source review and actual content entry remain OPEN                                      |
| A7      | 18 of 35 students have incomplete study data; potential school duplicates require identity confirmation. A submitted top-up from July remains                                                                                          | Do not invent profile fields, merge name-similar schools, or credit/reject funds without evidence |
| A8      | Old useAuth errors last seen 2026-09-29; React 418 last seen 2026-10-08. Missing LocalNotifications also occurred with web source f7dd0a59 on 2026-10-14. Added plugin-availability checks and caught listener initialization failures | Current APK/physical-device acceptance remains OPEN                                               |
| A9      | Analytics index redirects to mistakes; existing root not-found component is Arabic                                                                                                                                                     | Published deep-link verification                                                                  |
| A10     | Removed contradictory read-only wording from lesson management                                                                                                                                                                         | UI release                                                                                        |
| A11     | Applied Arabic count helpers to school/student and academy dashboard phrases                                                                                                                                                           | UI release                                                                                        |
| A12     | Removed MISSING/staff/RPC user-facing wording; retained actual import-column identifier with an Arabic explanation                                                                                                                     | UI release                                                                                        |
| A13     | Three HTTPS inputs now set Arabic custom validity and clear it when edited                                                                                                                                                             | Browser validation check                                                                          |
| A14     | No payment method/account setting changed; disabled payment flow must remain disabled                                                                                                                                                  | Owner's account/method verification before future activation                                      |
| A15     | Both program lists now use the same exact duration formatter; published introductory version is 45 estimated minutes vs 40 lesson minutes                                                                                              | Do not rewrite a published version merely to equate estimate with lesson sum                      |

## Content priorities based on current facts

- الصف الأول الثانوي: 253/515 summaries (49.1%).
- الصف الثالث الثانوي: 355/477 summaries (74.4%).
- الصف الثاني الثانوي: 215/501 summaries (42.9%).
- First: second-secondary Mathematics: 3/46 ready, 43 missing.
- Third-secondary Calculus and Algebra/Analytical Geometry are already 41/41 ready; do not duplicate them.
- Next: third-secondary Chemistry (35 missing), Biology (32 missing), Physics (27 missing), and Quran (18 missing).
- A single sample missing all six components does not establish that every lesson lacks every component. Summary coverage is not overall component completeness.
- Missing real school/profile fields and financial evidence cannot be inferred safely from counts.

## Verification

- 69 focused React/coverage/session/notification tests passed on the final product source.
- Four new notification runtime tests passed after waiting for dynamic imports; these cover an old binary with a missing plugin, initialization rejection, allowlisted routing/cleanup, and Arabic update instructions.
- 32 node closure/database tests passed (including an isolated PGlite exercise with 1481 lessons, 787 usable summaries, admin/anon/student gates, RLS filtering and irreversible endpoint retirement).
- Root TypeScript, academy TypeScript, web build, academy build and full lint passed on the repair source. The clean-build output was verified after deleting only the build output created by this task; a repeat build in the dirty output directory had correctly failed due to two old/new browser manifests. Exact combined-PR CI is the release authority.
- Web artifact verification found all 177 referenced scripts/styles/manifest/server resources.
- Local Chromium browser execution is BLOCKED by SIGTRAP in this runtime even after a successful download; production fixture build succeeds. CI browser verification is required, not claimed as passed.
- Production rollback-only contact test passed: anonymous submission accepted, non-admin read denied, admin read/mark-read accepted, non-admin coverage RPC rejected. Contact count returned to 0 after rollback.
- Shared quick-review helper suite: 18/18 passed, including rejection at the safety cap rather than silent truncation.
- Current cloud browser shows the administrator login form; authenticated UI acceptance requires secure sign-in.

## Security Review

- Migrations changed: two source versions in the combined PR (one original Claude version, one follow-up); both applied and recorded in production.
- Table RLS changed: no.
- RPCs changed: yes, two dangerous operations retired and one admin-only invoker read added.
- Authentication configuration changed: no.
- Authorization: destructive privileges reduced; contact access continues to rely on the existing full-admin policy.
- Sensitive data exposure: no new public data surface; no real identities, receipts, account numbers, session backup or credentials committed.
- Privilege escalation: no; role/capability refusal was preserved during test cleanup.
- Production risk: medium until UI acceptance; production safety endpoints already fail closed.
- Ready for merge/deploy: dependent on exact-source CI and authenticated UI verification. Full report closure remains HOLD while source-data, editorial work and Android acceptance remain open.
