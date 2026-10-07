# Android local-first pages — 1.2.0 (9)

Baseline: main `81c1a4e33cf35fb0de370326bf5889e3736df8e3`.
Branch: `feat/android-local-first-pages`.

## Scope and invariants

The APK starts at its bundled home even with no prior network connection. Home,
subjects, saved lesson content, saved assessments, progress, account summary,
download inventory and reading settings render from local assets/native state.
Online enrollment, downloads, account editing and sign-in remain explicit online
services. Content must have been downloaded; external experiments remain online.
Package identity, production origin, native storage paths, encryption, published
resource bytes, database policies and API contracts are unchanged.

## Architecture

- Capacitor starts at `/index.html` under the existing HTTPS origin, preserving
  cookies and storage. The registered native plugin installs an exact asset
  allowlist before the first WebView request and explicitly injects Capacitor
  into trusted bundled HTML, including older WebViews. Missing APK assets fail
  closed instead of falling back to the hosted site.
- No route caching of remote HTML. Other paths still use the existing hosted app.
  A return button links online services back to local pages. Deep links are
  forwarded to the existing hosted PKCE handler, not exchanged by a second client.
- The optional bundled sync runtime uses the existing encrypted session adapter
  and public backend configuration. The CSP permits only that backend and the
  same origin. A config mismatch fails the local build.
- Native queue reads require the authenticated session ID to match the journal's
  active owner. Acknowledgements re-read and merge under the same native lock as
  answer saves, compare operation ID/hash/owner, and retain failed activity.
  Server idempotency keys survive retries; requests do not interrupt local lessons.
- Lesson iframes retain their own network-free CSP and sandbox without origin
  privileges. Native file hash/size/owner checks remain mandatory.

## Verification gates

`npm run mobile:build` type-checks and bundles the optional synchronization code.
`npm run test:mobile-release` exercises existing mobile contracts plus local UI
navigation, no-network rendering, reconnect behavior, account mismatch, failed
sync and acknowledgement loss.

Android CI compiles the app and runs Java route-policy unit tests plus a real
Android WebView instrumentation test on an API 35 emulator with Wi-Fi and cellular
data disabled. It verifies cold start, plugin access, packaged logo, navigation,
saved lesson opening, activity recreation and owner isolation using TEST_ONLY
files in the emulator only. Tests do not access production student data.

A physical-device check of Google sign-in, real material downloading, airplane
mode, answer synchronization and updating an existing install remains a separate
release gate. No production publication is implied by a passing simulated test.

## Recovery

Revert this branch to restore the prior remote-first entry. No journal migration
or content deletion is performed. Do not uninstall an existing app merely to
resolve debug-vs-Play signing differences: that would remove saved downloads.
