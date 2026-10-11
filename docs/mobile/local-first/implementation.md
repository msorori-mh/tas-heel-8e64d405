# Android local-first — current student UI, 1.2.0 (11)

Baseline: main `63df942a8813f65935dd04c0daa0b69a13395030`.
PR: #322, branch `feat/android-local-first-pages`.

## Scope and invariants

Package the current React student screens, including subject search, exam UI,
onboarding and student/teacher OAuth repairs. Launch the installed entry online
and offline before a network request. Preserve origin, application ID, session
adapter, journal, saved file paths, resource hashes and policies. No database
migration or domain cutover.

## Architecture

- `vite.native.config.ts` compiles the current SPA and local Cairo fonts.
  `mobile:build` packages public assets into `mobile/native-www`. A manifest pins
  the origin, Android ID and backend project.
- `TamkeenLocalPagesPlugin.load` installs `PackagedShellWebViewClient` before
  `Bridge.loadWebView`. Capacitor starts at `/index.html` under the original HTTPS
  origin; the existing RootShell bootstrap selects `/app`.
- Only exact manifest assets are served. Missing installed chunks fail locally.
  API responses and authenticated remote HTML are not cached.
- React's existing native OAuth handler and successful-code ledger remain the
  sole callback exchange owner. The legacy callback router stays inactive when
  the packaged React shell is present.
- The independent build retains its own backend, origin and application ID.
  Shared packaging validates those values; it does not reroute production.
- Narrow native snapshot/acknowledgement APIs from original #322 remain for legacy
  local pages. React retains its existing store/sync; no second worker is injected.
- Original local HTML remains a legacy fixture. The APK opens the current React UI.
- Code 11 exceeds main's code 10; check the highest uploaded Play code before publishing.

## Evidence and gates

Local TypeScript and native SPA build/package passed (252 assets). Mobile:
153 tests; maintained Vitest: 1,036; Node: 312; independence: 22+4. Separate
suite counts may overlap. Focused lint and diff checks passed.

Chromium could not run locally (SIGTRAP before any page) in this restricted
executor, so local browser E2E is not asserted. Android CI runs the compiled
zero-network UI test and two API35 WebView cases with a real force-stop between
runs. Use the new SHA/results/screenshots/APK, not the older PR322 artifacts.

Physical Google sign-in, real subject downloads, offline answer replay and
existing-install upgrade without losing content remain release gates. A debug
APK cannot update a Play-signed installation. Preserve that app's saved data.

## Recovery

Revert the local-first change for remote-first entry. No journal/content
migration or deletion occurs. CI success alone does not imply merge, Play
upload, domain cutover or production publication.
