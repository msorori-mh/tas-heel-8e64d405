# Academy pilot offline port — 2026-10-11

Baseline: main `63df942a8813f65935dd04c0daa0b69a13395030`. Ports the Academy-only behavior of old #245 to a fresh branch; preserves current Google/shared-session auth, teacher dashboard, five mobile destinations, profile races, assessment guards, native Back and explicit logout.

## Implemented

- Account-partitioned IndexedDB stores programs, text, allowed PDF/images, hashes, notes and pending completion operations. Download requires a verified ACTIVE teacher and enrolled program. Videos/unavailable resources are explicitly marked online-only; files are limited to 25 MiB.
- Download cancel/resume reuses verified saved files. Deleting downloads preserves notes and pending operations. Storage/ownership failures remain visible.
- Offline cold-start uses a generated code-only Academy shell. Service-worker navigation is limited to exact `/academy` or its descendants; private API/account responses are not cached. Android continues to use its bundled React shell and does not register the PWA worker.
- Replay binds a verified account token, checks owner/session during asynchronous work, acknowledges only confirmed successes, and preserves immutable note operation IDs on retry. Missing notes RPC retains notes while allowing lesson completion to proceed.
- Logout, account switch and cross-tab revocation hide cached content. Admin and public verification routes cannot fall back to a teacher library.
- Independent builds generate the offline shell against the same independent project configuration; they must pass target-verification before release.

## Evidence and deployment limit

Local validation: root and Academy typechecks; 99 Academy Node tests; 15 dedicated offline service/owner tests; 1041 maintained Vitest tests; production web and standalone Academy builds. Browser and PostgreSQL 17 contracts run in the added isolated CI workflow. Record the final CI SHA/results on the PR; these local counts do not substitute for browser/database acceptance.

`20260915021143_academy_offline_notes.sql` is included for review and disposable database rehearsal only. It has **not** been applied to production or the independent database. Real notes sync remains HOLD until the additive migration is reviewed against the effective remote schema and applied through its normal release process. Completion uses the existing server-authorized RPC; certified assessment/certificate issuance remains online-only.

This is user-authorized maintenance of the existing pilot, not closure of `ACADEMY_FULL_PROGRAMMING_GATE=CLOSED`, target commercial entitlement/RBAC decisions, or permission to deploy. Android #322 is now merged; the integration refresh below records its reconciliation with this branch.

## Integration refresh — 2026-10-12 (Asia/Riyadh)

Reconciled with main `5b1d0759676b3c8c8cd81760e6de1a130f1a0cdc`, including Android 1.2.0 (11). The sole merge conflict was `.gitignore`; both the generated Academy shell rules and the native local-runtime rule are retained. Package scripts preserve production/independent Academy shell generation and the current native SPA build.

Root TypeScript and 40 focused offline/teacher/student-note tests passed after reconciliation. The current native SPA builds and packages successfully. Fresh CI must prove the combined branch's browser, PostgreSQL and Android behavior; record those checks on #336. No live migration, production data change or Google Play publication is implied.
