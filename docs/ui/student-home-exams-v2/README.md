# Student home and exams v2

Baseline: `c48f3feae5ddf682f8745755442f9190557a6d9e`. Branch: `ui/student-home-exams-v2`.

Home now prioritizes one lesson action, followed by compact progress, the daily target, and a review list. The exam hub reuses the semester-subject query and shared history query, previews three attempts, and handles loading/errors separately from empty history. Account actions moved out of the mobile header; the desktop sidebar and lesson reader are retained.

The single new migration creates `exam_schedule` with published-only student reads and admin-only writes. No dates are seeded. The full-admin page provides CRUD, overlap warnings, and a preview using the student's pure date-selection function. Countdown dates use Asia/Aden and are hidden offline. The migration has NOT been applied to production. Owner approval is required before applying it; no student countdown appears until an administrator publishes a date.

Android is version 1.1.5 / code 10 (owner confirmed highest Play code was 9). StatusBar and Capacitor 8 SystemBars both use LIGHT (dark icons). Android 16 retains CSS edge-to-edge insets; older non-overlay layouts suppress a duplicate top inset. Application ID, signing, logos, and the teacher academy are unchanged.

## Verification

- `npm ci`: PASS.
- TypeScript: PASS before final verification.
- Production build: PASS locally.
- `npm run test:mobile-release`: PASS, 22 files / 136 tests.
- Real RLS test using disposable PGlite: PASS; student/content-manager reads hide drafts, writes are rejected; scoped admin operations succeed; anonymous reads are denied.
- `npx cap sync android`: PASS.
- Local Android assembly: HOLD; the sandbox cannot download the Gradle distribution. The dedicated branch-push workflow performs the Android build on GitHub.
- Local Playwright: HOLD; installed Chromium exits with SIGSEGV before creating a page. The branch-push workflow renders the actual React components with deterministic test-only data, blocks external requests, checks overflow/links, and captures before/after images at 390×844 and desktop 1280 (also 360/412).
- Physical Android status-bar appearance: HOLD; no device/emulator is connected. Do not claim visual verification from a web screenshot.

The mixed student/security/mobile inventory includes both Vitest and Node test files. The exact broad Vitest command runs Node assertions but reports “No test suite found” for 12 Node-only files. Verification runs each file under its declared runner; no assertions were removed. Existing direct-lesson numbering guard was updated to include the already-present duplicate-title protection and multiline formatting; the subject page itself was not changed. The vitality guard now checks the requested horizontal goal bar instead of the superseded ring.

## Screenshots

The verification workflow produces `home-new`, `home-returning`, `exams`, and `desktop` before/after screenshots here, plus `narrow` and `wide-phone` width checks. Fixtures use test-only dates and data, never production data. Baseline images render the exact baseline sources, not reconstructed mockups.

Release state: **HOLD** for production migration, physical-device visual verification, merging, publishing, and Play upload. This change does not authorize any of those operations.
