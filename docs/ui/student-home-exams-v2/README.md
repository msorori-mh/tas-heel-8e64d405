# Student home and exams v2

Baseline: `c48f3feae5ddf682f8745755442f9190557a6d9e`. Branch: `ui/student-home-exams-v2`.

Home now prioritizes one lesson action, followed by compact progress, the daily target, and a review list. The exam hub reuses the semester-subject query and shared history query, previews three attempts, and handles loading/errors separately from empty history. Account actions moved out of the mobile header; the desktop sidebar and lesson reader are retained.

The single new migration creates `exam_schedule` with published-only student reads and admin-only writes. No dates are seeded. The full-admin page provides CRUD, overlap warnings, and a preview using the student's pure date-selection function. Countdown dates use Asia/Aden and are hidden offline. The migration has NOT been applied to production. Owner approval is required before applying it; no student countdown appears until an administrator publishes a date.

Android is version 1.1.5 / code 10 (owner confirmed highest Play code was 9). StatusBar and Capacitor 8 SystemBars both use LIGHT (dark icons). Android 16 retains CSS edge-to-edge insets; older non-overlay layouts suppress a duplicate top inset. Application ID, signing, logos, and the teacher academy are unchanged.

## Verification

- `npm ci`: PASS.
- TypeScript: PASS.
- `npm run lint`: PASS (0 errors; 44 warnings).
- Recursive student/security/mobile and student-audit verification: PASS, 57 Vitest files / 370 tests plus 64 Node assertions; no exclusions. Run `node scripts/testing/run-student-home-exams-v2.mjs`.
- Production build: PASS locally.
- `npm run test:mobile-release`: PASS, 22 files / 136 tests.
- Real RLS test using disposable PGlite: PASS; student/content-manager reads hide drafts, writes are rejected; scoped admin operations succeed; anonymous reads are denied.
- `npx cap sync android`: PASS.
- `./gradlew assembleDebug`: PASS in GitHub Actions. APK installed and launched successfully on the Android 16 / API 36 emulator. The local sandbox cannot download Gradle; CI supplies the build evidence.
- Playwright: PASS in GitHub Actions, before/after at 390×844, desktop 1280×900, and 360/412 width checks. Actual React components with deterministic test-only data; external API requests blocked (only the app font CDN is allowed). No missing images, horizontal overflow, or page errors; three history and subject links verified; review description remains one line. The local Chromium launcher fails before creating a page, so CI supplies the browser evidence.
- Native status bar: PASS on Android 16 emulator; the native screenshot was visually reviewed and shows dark time/network/battery icons on a light background. It displays the existing remote onboarding page, not the unpublished home changes. Physical-device testing remains unperformed.

The mixed student/security/mobile inventory includes both Vitest and Node test files. The exact broad Vitest command runs Node assertions but reports “No test suite found” for 12 Node-only files. Verification runs each file under its declared runner; no assertions were removed. Existing direct-lesson numbering guard was updated to include the already-present duplicate-title protection and multiline formatting; the subject page itself was not changed. The vitality guard now checks the requested horizontal goal bar instead of the superseded ring.

## Screenshots

The committed screenshots below come from the successful verification run [37978134803](https://github.com/msorori-mh/tas-heel-8e64d405/actions/runs/37978134803), implementation commit `0dd2b5d5b54f01eb5e73f34f3ebaf1ddd8ceada0`. Both browser and Android jobs passed. `home-new`, `home-returning`, `exams`, and `desktop` have before/after screenshots here, plus `narrow` and `wide-phone` width checks. Fixtures use test-only dates and data, never production data. Baseline images render the exact baseline sources, not reconstructed mockups.

Implementation and emulator/browser verification: **PASS**. Release state: **HOLD** for production migration, merging, publishing, and Play upload. Physical-device visual verification is not claimed. This change does not authorize any of those operations.

| Case | Before | After |
| --- | --- | --- |
| New student, 390×844 | [Before](home-new-before.png) | [After](home-new-after.png) |
| Returning student, 390×844 | [Before](home-returning-before.png) | [After](home-returning-after.png) |
| Exams, 390×844 | [Before](exams-before.png) | [After](exams-after.png) |
| Desktop, 1280×900 | [Before](desktop-before.png) | [After](desktop-after.png) |

[Returning student's review list](home-returning-review-after.png) · [Android 16 native status bar](android-16-status-bar.png)
