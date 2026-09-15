# Student offline download recovery — 2026-09-15

Decision: **HOLD** for the reported physical-device issue and release. Focused client fixes are locally verified; the production student journey remains unverified.

## Baseline and scope

- Review APK source: `7072b0abede5072e550959f38ffd04b80a616f5d`, PR #241, `test/unified-offline-capacity`.
- Isolated fix branch: `fix/student-offline-download-journey`.
- The APK sends authenticated API requests to the existing production backend. This branch does not activate its capacity migration or deploy server changes.
- The user's approved broader download UX improvements remain in scope for follow-up. This patch concentrates on the reported download error, session lifetime, request recovery, and accurate failure messages. Home-card and teacher-academy improvements have not been implemented here.

## Reproduced defects and fixes

1. A subject download captured one access token before all files. An SDK session renewal during a long download did not update subsequent file requests. The new regression fails on the exact APK source with `OFFLINE_ARTIFACT_DOWNLOAD_401` and passes after resolving the current session for each file.
2. The downloader did not recheck the owner before the next file request. A test changing accounts after the first saved file incorrectly completed on the APK source. It now stops with `OFFLINE_OWNER_CHANGED` before the next request.
3. Server JSON error codes were discarded. They are now retained only as bounded code strings, with distinct Arabic guidance for server setup, busy/unavailable service, expired sessions, stale/corrupt content, storage and metadata timeout. Arbitrary response bodies are not presented.
4. Fetch connection failures before response headers previously failed immediately. GET/HEAD TypeErrors now use the same bounded backoff as transient HTTP errors, at most three attempts in total. Abort and non-transient HTTP statuses are not retried.
5. The existing progress bar now includes an explicit numeric percentage.

These are demonstrated client defects, **not a confirmed root cause of the user's observed phone error**. The live error response for a signed-in student has not been captured.

## Evidence

- `npx vitest run tests/offline tests/load/offline-capacity.test.ts tests/mobile/android-offline-02.static.test.mjs tests/mobile/android-offline-03-ui.static.test.mjs`: **105/105 PASS**.
- `npx tsc --noEmit`: PASS.
- ESLint on all changed implementation/test files: PASS.
- `npm run build`: PASS for client and server; existing dynamic-import/browser-externalization warnings remain.
- `git diff --check`: PASS.
- New client regressions on the exact APK source: **3 FAIL / 7 PASS**; the same file after the fix: **10/10 PASS**.
- Synthetic grade-12 journey uses the actual downloader, manifest validation, checksum verification, state repository and offline lesson reconstruction, with mocked sessions/HTTP and in-memory artifact storage. It saves the first lesson, cuts the second response body, retains the first lesson, recreates the state repository and resumes only the second file. Both lessons open with zero fetch calls; another owner cannot read the saved lesson. This journey already passed on the baseline; it proves preservation, not a newly repaired byte-resume implementation.
- Read-only live unauthenticated API probe returned HTTP 401 and `unauthorized`. This proves only that the route is reachable and requires authentication. It does not exercise a real subject or prove the answer-layer configuration.

## Remaining acceptance work

1. Sign in through Google to an authorized existing third-secondary student account and capture the actual manifest/artifact failure through the application. The current browser starts signed out.
2. Verify real subject scope across both semesters, actual content sizes and completeness, then repeat interrupted download, reopening and offline navigation with the real content.
3. Build and install the corrected review APK; verify native storage and cold starts on Android. No corrected APK has been produced by this patch yet.
4. Finish the approved broader UX improvements and teacher offline scope after the download failure is understood.

No production write, database mutation, deployment, Google Play upload, account creation or merge was performed. Only staging is exposed by the connected Supabase project listing; it is not a substitute for the production backend used by the APK.
