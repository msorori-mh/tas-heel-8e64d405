# Normal application offline — v2

Baseline: review `ed6a57c85f17a603c8ede4a120043704a4a082d4`; production audited at `c6f8a2e0ef6b115fe05f715aec22cecb8c9c9268`.

## Diagnosis

Production `capacitor.config.ts` still uses the remote website and its `mobile/www/index.html` error page. A web deployment alone cannot replace that installed native entry. The user screenshots match that page's flat subject/lesson library. The review package also retained it as an error fallback. The earlier identity recovery tests seeded a new profile cache and did not cover downloads created before that cache existed.

## Changes

- Native build mode embeds the same normal React routes as the website. Android API/server-function requests keep their existing HTTPS/auth path; UI assets resolve locally. MainActivity and the review variant now share the same native client.
- Release CI explicitly builds native SPA assets before Capacitor synchronization; it no longer packages only the emergency HTML. Web builds remain SSR.
- Recovery and old `/review-offline.html` URLs return to the normal app. An automatic retry is bounded; there is no alternate lesson browser in the bundled package.
- Existing native app service workers are unregistered without clearing account data, files, IndexedDB, or caches. Native builds do not register new website workers.
- Verified downloaded packs can recover a local student identity when an older install lacks the presentation profile cache. No server session/role/governorate is fabricated. Profile completion remains enforced online, not as a prerequisite for reading existing offline downloads.
- Native connectivity, account-generation and auth-event ordering prevent a stale browser online flag or SDK snapshot from losing the offline owner.
- Review uses `app.studentamkeen.tamkeen.review.offlineui`, visible label `تمكين — أوفلاين`, versionCode 26092001. It installs alongside earlier review/Play apps. The previous review's signing-cache path did not exist; both its logs and certificate comparison prove a different ephemeral signer. Consequently this build cannot update that package. Do not uninstall it: its files remain there, and content must be downloaded separately in the new review. The new review uses an explicit generated, ignored signing path shared by Gradle and its workflow cache; no release key is used or distributed.

## Invariants and boundaries

No content publication, lab/mind-map rendering contract, RLS, endpoint auth, production database, or student data migration is changed. Existing app-private download paths, state schema, progress/outbox, and WebView origin remain intact. Downloads in a different installed package (including Play vs review) cannot be imported by this APK because Android isolates app data.

Content encryption pilot remains isolated on `test/content-protection-pilot`; this package does not claim new content DRM. Real Google sign-in and a physical-device field test remain acceptance checks distinct from fixture-based emulator evidence.

## Evidence

Focused unit tests, TypeScript, native SPA build, and Android instrumentation are recorded in the PR/CI for this exact head. Instrumentation checks legacy downloads without cached profile, offline normal home and bottom navigation, separate Biology/Chemistry, lesson tabs, sandboxed lab script execution, local answer grading, friendly online-only gate and Settings. A separate test invocation after force-stop and `adb install -r` checks download/answer persistence without reseeding.

Application tests on fcd78f52 passed on Android in run 35481766723 attempt 2, including the offline journey and same-signature package replacement. The final installable package uses a new identity due to the proven historical signer mismatch and must pass its own instrumentation before delivery. Physical-device acceptance and production publication remain HOLD. No Google Play publication is performed by the review workflow.
