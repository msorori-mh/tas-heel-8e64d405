# MOBILE-ORIGINAL-01 — original workspaces with offline support

Decision: **HOLD**. The second full browser run passed both logins and offline session restoration, then found a teacher offline-notice overlap and an incomplete student logout test interaction. Those corrections await the full runtime rerun. Physical Google sign-in acceptance remains open. Do not ship another APK or label login fixed on the phone yet.

## Baseline and scope

- Repository: `msorori-mh/tas-heel-8e64d405`.
- Production baseline: `e2613cbe68971cf39349771d11bfc7f89f1859cf`.
- Prior offline PR #223 head: `d0db2ea9949232cc01a354a7288ae57479bcff86`.
- Corrective local branch: `fix/mobile-original-experience`.
- First corrective commit: `bca1b12bd50ee8b393dff4e6ba415c4a44e9611d`; subsequent local commit adds callback-recreation receipts/tests and final verification notes.
- User acceptance: restore the original Play UI and ordering, keep teacher and student spaces inside the installed application, add offline support without replacing either workspace, test both role journeys.

## Correction

The prior APK shipped `apps/student-mobile`, a separate minimal client. Its teacher link explicitly called `Browser.open` on the academy website. Recreating the original hero did not restore the actual application.

`student:build` now builds the original TanStack Start route tree in SPA mode and packages only `dist/client` as `dist-mobile`. The original student `/app` dashboard, StudentShell and home components are unchanged from the prior source baseline (verified with `git diff --exit-code`). The original public landing page receives only one offline-support note. The only later teacher stylesheet correction moves its offline notice into document flow, preventing it from covering the mobile menu logout button. Cairo font files and license are bundled for offline rendering.

Capacitor serves this full UI locally at the existing `https://studentamkeen.com` origin. Android delegates only that exact origin's `/api/` and `/_serverFn/` paths to WebView's ordinary HTTPS stack. UI paths including `/academy` stay bundled. No proxy rewrites security headers, bypasses TLS or disables CSRF. Old app-owned web service workers are retired on native startup, and native UI suppresses web-install prompts.

Both portals now share one Supabase Auth instance, with academy PostgREST methods scoped to `academy`. The student web callback no longer repeats the SDK's one-use PKCE exchange (the old call also passed an entire URL as a code). Native teacher return navigates internally without reloading the auth handler. Hash-only receipts prevent a completed launch callback replay after activity recreation. A successfully committed Preferences session is retained even if its optional WebView mirror is full. Login buttons recover after canceling the provider view.

Profile loads are bounded, prevent stale account responses, and hold the loading state until the selected account is resolved. Previously saved student/teacher display snapshots use the encrypted, owner-bound native journal; offline views never supply admin capabilities. Local logout clears session persistence and active owner. Cached teacher content covers previously viewed profile, catalog, learning lessons and certificates; enrollment, assessments and other server mutations remain online operations. This is not a claim that every teacher feature now works offline.

## Completed local evidence

- Focused mobile/offline/native-auth suite: **170 passed, 0 failed** (28 files).
- Teacher academy suite: **93 passed, 0 failed**.
- Required core reliability suite: **465 Vitest tests + 41 Node contract tests + 18 Node review tests passed**, zero failures. These overlap the focused suite; do not sum all counts as distinct tests.
- TypeScript: PASS.
- ESLint: PASS.
- Full application SPA production build: PASS; local client output is about 16 MB.
- Capacitor Android sync: PASS; assets copied from `dist-mobile`, eight native plugins registered.
- `git diff --check`: PASS.
- Live public production landing and teacher entry inspected through the supported browser; no authenticated account test was performed there.

## Runtime gates

`tests/mobile/full-app-e2e.mjs` exercises the actual bundled route tree for both roles: original entry, internal portal, Google-provider boundary with real SDK PKCE exchange, exactly-once callback, original workspace, reload/session restoration, saved offline workspace, logout isolation. Its provider responses are explicitly TEST_ONLY fixtures, with all other remote access blocked. Its reports distinguish simulated provider coverage from real Google and physical-device acceptance.

Android instrumentation retains actual UI -> Capacitor -> encrypted-state account persistence and activity recreation, changes the expected screen to the original landing, and adds internal teacher-navigation/install-prompt checks and backend-route allowlist checks. It runs only with `tamkeenDisposableEmulator=true` and disconnected emulator networking. It does not simulate a successful real Google login.

The workflow `.github/workflows/student-offline-ci.yml` now runs the full-app role suite. It still runs the underlying offline unit/integration tests and Android instrumentation. The obsolete `tests/offline/student-browser-runtime.mjs` targets the retired minimal UI and is not release evidence for this correction.

## Publication and runtime findings

The user explicitly approved pushing this exact branch and opening its PR. [Draft PR #224](https://github.com/msorori-mh/tas-heel-8e64d405/pull/224) was opened at `34c632738509ff00ffed25975f3e1b936b3e7875`. Git CLI had no push credential, so the authenticated GitHub connector published the source. Its full tree matched the local tree exactly (`bdc06954592935abee4a2df57465d35e2a21e81a`). The earlier approval blocker is resolved.

[First runtime run](https://github.com/msorori-mh/tas-heel-8e64d405/actions/runs/34540592603) failed both role journeys: the authorize request occurred, but neither callback exchanged its code. The installed Auth SDK treats a function-valued `detectSessionInUrl` as its implicit-flow classifier. The previous predicate returned true for ordinary and PKCE pages, misclassifying them as implicit OAuth. The client now passes a page-specific boolean, retaining the SDK's PKCE detection and disabling URL exchange only on the HTTPS native compatibility callback.

Four focused tests execute the real SDK with synthetic HTTP responses: student callback, teacher callback, existing-session restoration, and refusing to exchange the native compatibility callback in the browser. All pass. The full browser E2E remains the acceptance gate, with its first failure preserved in Actions artifacts.

The separate academy TypeScript gate also found a root-only import alias in the shared auth client. A relative import fixes that build boundary; academy typecheck and standalone build passed locally after the correction.

[Second runtime run](https://github.com/msorori-mh/tas-heel-8e64d405/actions/runs/34541074442), source `814087e522c52e350ffb0e4b1ed7df88642b04ff`, reached both original workspaces, exchanged each PKCE code once, and restored both sessions online and offline. It failed at logout: the student test omitted opening the existing security accordion, while the teacher offline toast physically covered the menu logout button. The test now opens the accordion and the teacher connectivity indication stays in document flow. Screenshots disable finite CSS animations so they show the settled menu state.

The second source passed Web CI, Golden Lesson PG17 and Android bundle gates, plus all 20 disposable-emulator tests. The browser gate is still HOLD until the full logout journeys pass.

Next: resolve the browser/emulator gates, verify real Google student and teacher sessions using the supported secure authentication flow, and build a new phone candidate only after those gates. Do not merge or publish while runtime/phone acceptance is incomplete.

The test package and existing Play package currently share `app.studentamkeen.tamkeen://auth/callback`; coexistence can still cause Android to select the wrong application. This has not been eliminated or proven to be the physical login error. Do not claim the new code alone proves S24 login. A distinct test callback would require a matching permitted Auth redirect configuration, or testing through an appropriate Play-signed test track. No Auth configuration was changed.

No production database, migration, Auth configuration, Play upload, merge or deployment was changed by this correction. The previously supplied test2 APK is superseded by this feedback and is not acceptance evidence for the new source.
