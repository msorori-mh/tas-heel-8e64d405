# Student low-data reading — PERF-02

Baseline: original-app `main` at `5fc9ac280a745a3162300cbd1723c902136bd93c` (PR #235).
Branch: `feat/student-low-data-mode`.

## Behavior

- A previously saved lesson PDF or textbook opens after the existing local entitlement and integrity checks, with **zero HEAD/GET or session requests** on that cached-file path. Local storage reading and hash verification still take time; this is not a phone latency benchmark.
- A small reader control checks for a newer version separately. A five-second bound covers the authenticated metadata request, including stalled session retrieval. Downloading newer bytes always requires a student's explicit action. The open browser reader remains available on a network/hash failure; native opening is disabled while an explicitly requested replacement is downloading.
- Data Saver is **on by default**, including on Wi-Fi, and is saved on the device via Capacitor Preferences. It suppresses next-lesson prefetch and automatic file-version checks. Manually opening/downloading/updating content remains available. Preference initialization cannot overwrite a later user choice; rapid writes retain their order.
- With Data Saver off, eligible Wi-Fi prefetch covers only the next two lessons, excludes the current lesson, respects the existing free-space threshold, and starts after three seconds without foreground transfers. Book, explanation, summary, question/resource bodies and requested PDF transfers take priority. Optional requests abort on foreground work, leaving the lesson, or enabling Data Saver. Interrupted prefetch may resume after foreground work settles, skipping files already saved.
- A reader may check older saved-file metadata after opening when Data Saver is off. It never silently replaces an open native file; newly downloaded files are not immediately rechecked.

## Evidence

Local focused suite: **82/82**, including **39 new runtime tests**. Tests cover a permanently stalled network with usable cached bytes, denied/corrupt local copies, bad download hashes, cancellation during transfer/auth, overlapping foreground requests, preference races, Wi-Fi/storage gates, cancelled prefetch, reader updates and the actual native/browser React delivery components.

Full local suites before the final query-cancellation extension: `npm test` **308/308**, maintained Vitest **538/538**, remaining core-reliability checks **59/59**. Production client/server build, TypeScript and lint passed (React refresh warnings). The final commit also runs Web CI and the dedicated browser workflow; record their exact results in the PR. The path-filtered Android bundle workflow is not triggered by these web-source changes.

`tests/e2e/low-data` builds the actual data-saver setting, browser reader, secure-file client and IndexedDB cache against an isolated TEST_ONLY session/PDF. Its Chromium checks cover 320, 390, 768 and 1280 px, saved opening with no file API requests, reopening with the browser offline, a stalled metadata request, a failed explicit update, and preference persistence. It has no production database connection. Screenshots/results are CI artifacts, not screenshots from an installed Android device.

```sh
npx vitest run tests/low-data tests/performance
npm test
npm run test:core-reliability
npx tsc --noEmit
npm run build
npx vite build --config tests/e2e/low-data/vite.config.ts
node tests/e2e/low-data/verify.mjs
```

## Scope and release

No database/content changes, new staging instance, native-shell migration, image compression, unit-pack format change, or byte-range resume. Existing offline PDF entitlement/hash rules, account-scoped lesson caches, role-filtered question RPCs, and authenticated file routes remain in force. Previously completed pack files are reused; unfinished files may restart.

Implementation and CI evidence are separate from production activation. Release uses the original site's existing deployment path after the release decision; no new Play AAB is included. The actual installed closed-track build and device performance still need an on-device comparison. Rollback is a normal source revert/deploy, with no data restoration.
