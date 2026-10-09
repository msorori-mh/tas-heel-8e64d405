# Four-step student introduction

This request starts from main `adf4e1f5`, preserving both the home/exams work
merged in #329 and the native offline cold-start fixes merged in #328.
No schedule migration is duplicated, no production migration is applied,
and no teacher-academy, identity, signing or application-id file is changed.
The Android release remains 1.1.5 / code 10, already established by #329.

The attached four PNG references and the updated execution prompt define:

1. Brand: منهجك بين يديك
2. Offline: تعلّم حتى دون إنترنت
3. Practice: تدرّب واعرف أخطاءك
4. Deeper learning: افهم أعمق… وجرّب بنفسك

All illustrations are inline SVG. The approved brand geometry is embedded,
without changing the original brand assets or requiring any image request.
The device completion key stays `tamkeen.student-intro.v1`.

Skip is hidden only on the final first-run page. Replay keeps Close on every
page and ends with Finish tour. Swipe, keyboard, Android Back, focus trapping
and preference persistence are retained. Buttons and dot targets are >=44px.

The top spacing reads Capacitor's CSS safe inset as well as env(). An Android
15+ native bridge fallback supplies 32px only when the native layout has not
already consumed the status inset. The same value drives the wrapper height
so it does not add an unnecessary scroll strip. The real-device requirement
cannot be verified here; emulator evidence is tracked separately.

## Evidence

- `npm ci`: passed.
- `npx tsc --noEmit`: passed before main refresh; CI repeats on final head.
- `npm run build`: passed before main refresh; CI repeats on final head.
- `npm run lint`: zero errors, 44 existing warnings before main refresh.
- Intro unit/gate checks: 16 passing.
- Mobile release checks: 136 passing.
- Student/security/mobile/onboarding inventory: 386 Vitest checks + 64 node:test checks;
  files are all run by `scripts/testing/run-student-home-exams-v2.mjs`.
- The browser check blocks all network requests, verifies four pages, skip
  state, touch target sizes and completion at 320×568, 390×844, 800×1280,
  and 844×390. Images are `intro-<width>-page-<n>.png` in this directory.
- Local Chromium crashes before page creation; browser verification runs
  in GitHub Actions. Local Java cannot load libjli; APK builds run in CI.
- The bundled first-launch entry registers the Preferences bridge if the
  plugin has not already been exposed. Previously it could skip the tour
  when the plugin proxy was absent despite native Preferences being installed.
  A unit check covers both new and returning device preferences.
- The legacy errorPath serves the HTML locally but proxies sibling script URLs
  to the remote origin. The tour is therefore generated inline in that entry;
  build --check and the parity unit test verify both ESM and embedded output.
  The browser check also exercises that exact embedded entry with all requests
  blocked, rather than merely testing an independently bundled source.
- The native check asserts the intro title and Skip in the accessibility dump,
  installs the APK and opens its bundled intro in airplane
  mode, avoiding the previously deployed remote tour.

The existing exam-schedule migration needs the project owner's approval
before production application. No student countdown appears until the
migration is applied and an administrator adds and publishes dates.
No merge, production deployment or Google Play upload is part of this PR.
