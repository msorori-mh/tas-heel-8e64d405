# Student loading performance — original application

## Scope and baseline

Stage PERF-01 fixes redundant loading in the original production application.
Baseline: `6ea6eb76f0a5f5d8b810cde1ef285505e7f0a4b0` (`main`, PR #234).
Branch: `fix/student-loading-performance`.

The source Android shell loads `https://studentamkeen.com`. This investigation
does **not** establish which version is currently installed from the closed Play
track. No AAB upload, database write, production deployment, or staging change
is part of the implementation evidence below.

## Observations and changes

| Path | Baseline observation | Corrected behavior |
| --- | --- | --- |
| Auth bootstrap | `getSession` and `INITIAL_SESSION` trigger two profile reads and four role RPCs. Roles wait for the profile request. | Three requests start together. Bootstrap and overlapping notifications share work. Token refresh updates the session without repeating those reads. |
| Session races | A delayed profile or session snapshot can arrive after sign-out/account switch. | Generation checks discard old-account results. An explicit refresh after editing supersedes pre-save reads. Role errors never grant staff access. |
| PWA registration | A React effect that runs after `window.load` adds a listener for an event that has already fired. | Register immediately after load, otherwise once on load; deduplicate route remounts. |
| Warm JS/CSS | `/assets/` always waits for the network, even with the same content-hashed file cached. | Same-origin JS/CSS with an eight-character build fingerprint use the cache first. Unversioned assets retain network-first behavior. Storage failures cannot discard successful downloads. |
| Lesson explanations | Full bodies load as soon as the lesson is accessible, even before the explanation tab is opened. | Discover nonempty explanations by ID only. Fetch bodies when the tab is visited. Primary-content loading cannot auto-select an explanation early; a student's explicit selection still works. |
| Repeat lesson visits | The large book body is stale immediately and downloaded again on remount. | Reuse it for 60 seconds, scoped to account and lesson. Cancel unfinished book/explanation requests when leaving. |

Read-only aggregate queries through the original connected database found:

- Largest stored book body: **4,430,209 bytes**.
- Largest stored explanation: **1,859,148 bytes**; its lesson's book body is
  byte-identical, so the original page fetched the same content twice.
- That explanation's ID-only JSON object is **47 bytes** (excluding array and
  HTTP overhead). Body loading is deferred, not removed or quality-reduced.
- There are 34 explanation rows, none empty; the new index also excludes
  null/whitespace-only bodies. These are stored UTF-8 sizes, not compressed
  network transfer sizes or an Android speed benchmark.

## Evidence

The same regression tests ran against an isolated checkout of the baseline and
the corrected branch. Seven selected checks fail on the baseline: six bootstrap
requests instead of three, an unsolicited explanation-body request, three warm
hashed resources blocked by a stalled network, an explicit no-store/auth request
being intercepted, and missed late PWA registration. They pass on the fix.

The full focused suite passes 94 tests, including 43 new performance runtime
checks plus lesson capability/lifecycle, school-profile, and question-image
regressions. The seven existing PWA policy checks, TypeScript, lint (no errors),
and production client/server build pass locally.

```sh
node node_modules/vitest/vitest.mjs run --config vitest.config.ts --maxWorkers=1 tests/performance
node --test tests/pwa/service-worker-policy.static.test.mjs
npx tsc --noEmit
npm run build
```

Auth and lesson tests mount the real React provider/page with delayed SDK
responses. Worker tests execute `public/sw.js` in a controlled VM with stalled
network and failed storage. No real student account or content was modified.

## Invariants and release verification

Database RLS, route `getUser` verification, exam secrecy, existing questions,
school records, content HTML sanitization, and offline ownership checks are
unchanged. Navigation HTML, auth/API/exam routes, private/no-store responses,
and cross-origin requests are not added to the service-worker cache. Worker
activation remains an explicit user action, preserving open lessons/exams.

After an approved original-site release, compare the same closed-test device,
account, network, and lesson before/after: cold launch, a warm return to the
lesson, opening its explanation tab, leaving during a download, and a saved
offline lesson. Record the Play version, Android/device model, and actual
timings. Local network probes included roughly ten seconds of environment TLS
setup; they must not be presented as phone latency or server processing time.

Rollback is a revert of this source-only change and a normal original-site
deployment. No database rollback or content restoration is needed.
