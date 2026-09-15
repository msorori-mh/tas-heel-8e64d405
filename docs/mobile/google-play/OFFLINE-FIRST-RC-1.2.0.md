# Offline-first candidate 1.2.0 (code 6)

The source candidate increments the main-branch 1.1.0/code-5 baseline without
changing `app.studentamkeen.tamkeen`. Signing still uses the existing gated
`Android CI and Play bundle` workflow and its four configured upload-key
secrets; PR builds do not sign or distribute a release.

This candidate bundles student lessons, downloads, local answers/grading,
replay, profile completion, encrypted native state/content and verified legacy
migration. Connected exams/results, settings and teacher/admin services open
the existing website and require Internet. PhET remote wrappers require
Internet. This is not a claim that every website feature works offline.

Release decision: HOLD. Confirm that code 6 is unused in the target Play app,
run the existing signed workflow on the reviewed branch, upload the AAB to the
authorized testing track, and exercise an actual Play-signed upgrade from the
installed code-5 version. An upload-key-signed standalone APK or debug APK is
not evidence of compatibility with the Play App Signing certificate.

Required acceptance: preserve the installed session, private downloads and
pending answers during upgrade; force-stop and cold-start in airplane mode;
read lessons/PDFs and save answers; reboot; reconnect after a multi-day offline
period without duplicate submissions; switch accounts; verify interrupted
updates and low-storage recovery. Record device/Android/WebView versions and
exact candidate SHA. Do not clear app data or uninstall to make the upgrade
test pass, since either would erase the data and Keystore material under test.

No signed candidate, Play upload, physical-device acceptance, merge or
production deployment has been executed by this preparation. Existing dated
release records remain historical evidence and are not rewritten.
