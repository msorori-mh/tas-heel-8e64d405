# TAMKEEN_ANDROID_APP_IDENTITY_AND_RELEASE_READINESS_21B4G

Source / release preparation only. No deploy, no merge, no APK/AAB, no Play upload,
no DB migration, no DB writes, no storage mutation, no OAuth production mutation,
no assetlinks publish, no keystore creation.

## G0 — SOURCE LOCK

- BRANCH: `edit/edt-3d025003-1bd8-4fb9-b79e-45af4f828f2c`
- START_HEAD: `50b22d7ef3727dced87a2a101405002a70445dce`
- END_HEAD: (this batch's commit — source only)
- `git status`: clean at start; changes in this batch limited to
  `android/app/src/main/res/values/strings.xml`, `capacitor.config.ts`,
  `docs/mobile/*`, `tests/mobile/android-app-identity-21b4g.static.test.mjs`.

Approved stack SHAs (chain leading to HEAD; the 21B4 series is stacked, so the
build base is the newest of them):

| Batch | SHA |
| --- | --- |
| 21B4B_SHA | in-chain ancestor of `50b22d7e` (offline shell) |
| 21B4C_R1_SHA | in-chain ancestor of `50b22d7e` (HTTPS App Link rebase) |
| 21B4D_SHA | `465e446f` |
| 21B4E_SHA | `854ba4b6` |
| 21B4F_SHA | `50b22d7e` (HEAD at start) |

Built on top of `50b22d7e` — the newest approved stack. No older base used.

## 1 — PACKAGE IDENTITY MATRIX

| Component | Current Value | Expected Final Value | Status |
| --- | --- | --- | --- |
| Capacitor `appId` | `app.studentamkeen.tamkeen` | same | PASS (unchanged) |
| Capacitor `appName` | `تمكين الطالب` | `تمكين الطالب` | UPDATED (label only) |
| Gradle `applicationId` | `app.studentamkeen.tamkeen` | same | PASS (unchanged) |
| Gradle `namespace` | `app.studentamkeen.tamkeen` | same | PASS |
| MainActivity package | `app.studentamkeen.tamkeen` | same | PASS |
| `strings.xml/package_name` | `app.studentamkeen.tamkeen` | same | PASS |
| `custom_url_scheme` | `app.studentamkeen.tamkeen` | same | PASS |
| Deep link host/path | `https://studentamkeen.com/auth/mobile-callback` | same | PASS |
| Bridge scheme | `app.studentamkeen.tamkeen://auth/callback` | same | PASS |
| FileProvider authority | `${applicationId}.fileprovider` | same | PASS (derived) |
| productFlavors | none | none | PASS |
| buildTypes | `release` only (debug default) | same | PASS |

No package ID, namespace, or URL was changed.

## 2 — FINAL PRODUCT NAME

Android-visible labels now resolve to **تمكين الطالب**:

- launcher name: `@string/app_name` = تمكين الطالب
- recent-apps / activity label: `@string/title_activity_main` = تمكين الطالب
- splash: theme-only (`@drawable/splash`), carries no text label
- notifications: no custom channel label defined; falls back to `app_name`
- accessibility/app title: `app_name`

Scan proves absence of `tas-heel`, `Lovable`, `dev.lovable.build` in
`strings.xml`, `AndroidManifest.xml`, `build.gradle`, `capacitor.config.ts`.

## 3 — DUPLICATE APP ROOT CAUSE

`rg 'dev\.lovable\.build' android/ capacitor.config.ts mobile/` → **0 matches**.
The Tamkeen Android project contains no reference to that package, no dependency
or plugin declaring it, and the shell only loads `https://studentamkeen.com`.

Classification: **A — a separate Lovable preview app installed earlier on the
device.**

- `FINAL_RELEASE_DUPLICATE_RISK=NO`
- No Tamkeen package change was made to "fix" a package we do not produce.
- Pending physical action (not executed now): on the test device, uninstall only
  the app whose package is `dev.lovable.build` (Settings → Apps → app info →
  verify package name → Uninstall). Do not touch `app.studentamkeen.tamkeen`.

## 4 — DEBUG / RELEASE IDENTITY

No `applicationIdSuffix` anywhere; debug and release both install as
`app.studentamkeen.tamkeen`. Therefore a production student sees exactly one app,
and a developer's debug install replaces the release install on the same device.

Recommendation only (NOT applied): if parallel debug/release installs become
useful, add `debug { applicationIdSuffix ".debug" }` — but this would require a
second assetlinks entry and a second OAuth-eligible package, so it is deliberately
deferred until after the App Link is verified.

## 5 — ICON / SPLASH / BRAND AUDIT

| Asset | State | Classification |
| --- | --- | --- |
| `mipmap-*/ic_launcher.png` (5 densities) | present | USED |
| `mipmap-*/ic_launcher_round.png` | present | USED |
| `mipmap-*/ic_launcher_foreground.png` | present | USED |
| `mipmap-anydpi-v26/ic_launcher(.round).xml` | adaptive icon → `@color/ic_launcher_background` + foreground | USED |
| `values/ic_launcher_background.xml` | `#FFFFFF` | USED — NEEDS_REPLACEMENT (brand background is not applied; white plate) |
| `drawable/ic_launcher_background.xml`, `drawable-v24/ic_launcher_foreground.xml` | legacy Android Studio defaults, not referenced by the adaptive icon | LEGACY_UNUSED |
| `drawable*/splash.png` (port/land, all densities) | present, referenced by `AppTheme.NoActionBarLaunch` | USED |
| Splash background color (`capacitor.config.ts`) | `#5B4BFF` (Tamkeen indigo) | USED |
| Theme / status & navigation bars | `Theme.AppCompat.Light.DarkActionBar` base + `NoActionBar` variants | USED |

No Lovable branding present in any icon/splash resource path. No redesign done.

## 6 — VERSIONING

- Source of truth: `android/app/build.gradle` → `defaultConfig`.
- `versionCode 1`, `versionName "1.0"` — technically valid, left untouched.

Strategy (documented, not applied):
- `versionName`: SemVer `MAJOR.MINOR.PATCH`, first Play release `1.0.0`.
- `versionCode`: monotonic integer, +1 per uploaded Play artifact, never reused.
- Bump both in `build.gradle` only, in the release-cut commit.

## 7 — SIGNING READINESS

- Release `signingConfig` exists and reads untracked `android/keystore.properties`.
- `android/keystore.properties` does not exist in the working tree.
- `android/keystore.properties.example` is a placeholder template with
  `CHANGE_ME` values (no real credential).

Results:
- `KEYSTORE_IN_REPO=NO`
- `KEYSTORE_PASSWORD_IN_REPO=NO`
- `KEY_ALIAS_PASSWORD_IN_REPO=NO`
- `RELEASE_SIGNING_PENDING_SECURE_KEYSTORE`

## 8 — APP LINK SIGNING HANDOFF

Extraction commands only (run on the build machine/device session):

```bash
# Debug fingerprint
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey \
        -storepass android -keypass android | grep SHA256
# or
cd android && ./gradlew signingReport
```

- `DEBUG_SIGNING_SHA256=UNKNOWN_UNTIL_BUILD_DEVICE`
- `RELEASE_SIGNING_SHA256=UNKNOWN_UNTIL_RELEASE_KEYSTORE`

No value assumed.

## 9 — ASSETLINKS TEMPLATE

`docs/mobile/assetlinks.template.json` — unpublished template, package
`app.studentamkeen.tamkeen`, fingerprint placeholder `<RELEASE_SHA256>`.
Not present under `public/.well-known/`. NOT PUBLISHED.

## 10 — ANDROID APP LINK CONTRACT

21B4C-R1 preserved verbatim: `https` / `studentamkeen.com` /
`/auth/mobile-callback`, plus the app-private bridge hop
`app.studentamkeen.tamkeen://auth/callback`. Both intent filters keep
`autoVerify="false"` until assetlinks is published. OAuth architecture untouched.

## 11 — RELEASE BUILD READINESS

- Source is `cap sync android`-ready: `capacitor.config.ts` valid, `webDir`
  (`mobile/www`) present with the offline entry page.
- `assembleDebug` requires no secrets — source-side blockers: none.
- `bundleRelease` is source-ready but unsigned without `keystore.properties`:
  `RELEASE_SIGNING_PENDING_SECURE_KEYSTORE` (not a failure).
- Android Gradle build was not executed (no Android SDK in this environment);
  validation was static.

## 12 — SECURITY / REPO SCAN

- `*.jks` / `*.keystore` tracked: none.
- `storePassword` / `keyPassword`: only in `keystore.properties.example`
  placeholders.
- `service_role` / `client_secret` / `private_key`: matches are limited to
  documentation and SQL policy text (role name usage), no credential material.
- No secret value printed here; no real secret finding.

## 13 — REGRESSION GUARDS

| Guard | Result |
| --- | --- |
| 21B4B_OFFLINE | PASS (12 tests) |
| 21B4C_AUTH_SOURCE | PASS (13 tests) |
| 21B4D_TEXTBOOK_UX | PASS (16 tests) |
| 21B4E_LESSON_V3 | PASS (13 tests) |
| 21B4F_HOME | PASS (14 tests) |
| WEB_APP | UNCHANGED |
| DB | UNCHANGED |
| RLS | UNCHANGED |
| SUBJECT_TEXTBOOKS | UNCHANGED |

## 14 — TESTS / BUILD

- New: `tests/mobile/android-app-identity-21b4g.static.test.mjs` — 10 checks
  (appId↔applicationId, package identity, visible name, no Lovable branding,
  deep-link contract, dev.lovable.build absence, no keystore, no signing secrets,
  assetlinks template match, versioning source of truth). All PASS.
- `tests/mobile/` suite: 35/35 PASS.
- 21B4D/E/F regression suites: 43/43 PASS.
- Typecheck (`tsgo --noEmit`): clean.

## PHYSICAL-DEVICE ACTIONS PENDING

1. Uninstall the standalone `dev.lovable.build` preview app (verify package first).
2. Run `./gradlew signingReport` → record `DEBUG_SIGNING_SHA256`.
3. Create the release keystore outside the repo → record `RELEASE_SIGNING_SHA256`.
4. Publish assetlinks with the real fingerprint, then flip `autoVerify="true"`.
5. Confirm the launcher shows a single app labelled **تمكين الطالب**.

## FINAL VERDICT

**PASS_SOURCE_READY_FOR_FINAL_PHYSICAL_ANDROID_SESSION**
