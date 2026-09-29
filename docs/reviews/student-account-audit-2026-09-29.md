# Student-account audit follow-up — 29 September 2026

Baseline: `main` at `8606c893a73a8367545f2885e0091a42e8cee41a`. The supplied report used `03926ce` (#310). This branch also includes the already reviewed compact cards from #313 (`33d22aa`). No production content, database records, RLS, permissions or scoring rules were changed.

Authority: implement code and verification, followed by explicit user approval to upload on 30 September 2026 (Asia/Riyadh). Repairs are uploaded as draft [PR #314](https://github.com/msorori-mh/tas-heel-8e64d405/pull/314), stacked on #313. Production deployment and physical-device acceptance remain separate gates. The report's live observations are supplied evidence; they have not all been independently reproduced.

## Stages and acceptance

1. Routes and scores: result/history/grade child pages replace their parents; direct URLs and navigation work; self-review/manual marks remain ungraded and are excluded from averages. Ministerial history links use ministerial results.
2. Authentication: offline/transient outages retain the local student identity; definite online rejection permits login; stale bootstrap cannot resurrect a revoked identity. Account changes clear in-memory query data. New Android builds migrate auth storage into AES-GCM with a device-bound Android Keystore key before deleting plaintext copies. Older APKs retain their existing compatible storage until upgraded.
3. Mobile and usability: respect native/CSS safe insets once; preserve sticky header and last content; prevent accidental live-exam departure; prevent a web SW from replacing the native offline entry; move bounded PDF rasterisation off the main thread, preserve back/page position, and exclude private storage from Android backup/device transfer. Correct the report's actionable UI issues.
4. Evidence: focused runtime tests, maintained Vitest suite, Node tests, lint/typecheck/build, browser fixture verification; Android build is explicitly deferred at the user’s request pending the teacher audit. Browser fixture data and simulated insets are explicitly not a production or physical-device walkthrough.

## Full report disposition

`Implemented` means code is present; it does not imply deployed or physically verified. `Partial` identifies exactly what remains. `Existing` records an already present implementation, not a new repair.

| ID | Report finding | Disposition and evidence / remaining requirement |
|---|---|---|
| C1 | Ministerial result cannot open | Implemented: RouteIndexContent renders Outlet and never mounts the session page on the result URL. Runtime router test covers direct and navigated URLs. |
| C2 | History details cannot open; same issue in grades | Implemented for both parents, with runtime router tests. Ministerial rows link to their own result route. |
| H1 | Android bars overlap content | Implemented CSS safe-area contract, sticky header, bottom-content clearance; PDF uses system/cutout insets. Browser geometry fixture prepared; native build deferred by user; final acceptance needs installed APK on the reported Samsung device, portrait/landscape and keyboard. |
| H2 | Revoked session traps the student | Implemented with terminal-vs-transient classification, route guard correction, online revalidation and generation-safe identity revocation. Offline, reconnect and delayed-bootstrap tests included. |
| H3 | Unsigned offline packages / XSS threat model | HOLD: no exploited vulnerability is established by the report. Server package signing, native trust-anchor verification and an enforceable site-wide CSP require a coordinated server/APK key rollout and a compatibility policy for existing downloads. Hashes still establish integrity, not independent origin authenticity. Do not remove Filesystem until its consumers are migrated. |
| H4 | Biology figures and drawing question | Partial: XLSX/ZIP parser now rejects explicit attached-figure references without QUESTION media; drawing prompts explain paper-based self-review. Model `fd693977-2f7b-4949-999d-b8f000b5a2ce`, questions 2/3/9, requires its original exam/images and content review. No figures were invented; 13 versus 47 questions alone does not prove truncation. Digital drawing submission is not implemented. |
| M1 | Practice does not increase completion/points | Partial: self-test UI explains its independent practice contract. No points or whole-lesson completion are fabricated from one correct answer. A product-level completion/points policy and its server implementation remain to be specified. |
| M2 | Self-review counted as 0% | Implemented: nullable marks, explicit self-review/pending labels, graded-only statistics, correct ministerial count from result summary. Genuine graded zero remains zero. |
| M3 | Accidental exam exit | Implemented for ministerial/training/strict sessions: router and before-unload guards; sign-out is confirmed before authentication is changed. Cancellation/confirmation tests included. |
| M4 | Books action on subjects without books | Implemented: one scoped textbook metadata request for the visible subjects; hide only a confirmed empty state, retain the action when availability is unknown/offline. |
| M5 | Subject exams absent | Partial: hub label now truthfully describes browsing materials/training. No production test exam was created; published unit/timed exams are required for live acceptance. |
| M6 | Floating lesson action covers content | Implemented extra content clearance and hides the return control while editing on mobile. |
| M7 | React hydration error 418 | HOLD reproduction: requires affected URL, deployed build and full console stack. Browser fixture captures runtime errors; that does not establish production hydration repair. |
| M8 | Slow quick review / 321 cards | Implemented: independent summary/unit/completion pipelines run concurrently with existing scoped pagination; render 24 cards at a time. Production network latency remains to be measured. |
| M9 | SW bypasses native offline screen | Implemented: native builds stop registering `/sw.js` and retire older root workers without reloading active exams; academy workers and browser PWA remain intact. Real airplane-mode cold/warm starts are still required. |
| M10 | Plaintext auth / device transfer | Implemented for upgraded APKs: Android Keystore AES-GCM storage, durable migration before plaintext deletion, no plaintext fallback on Keystore failure; cloud/D2D exclusions. JS must still obtain auth values to use Supabase, so this does not claim protection from arbitrary code executing in the trusted origin. Physical cold-start/migration test pending. |
| M11 | Local data remains after logout | Partial: explicit logout revokes active offline ownership and identity; account changes/revocation clear memory queries. Existing owner isolation is retained. Unsynced answers/downloads were not silently deleted. A physical two-account test and an explicit local-retention/erase policy remain; retention alone does not prove another account can read the data. |
| M12 | Native PDF insets/back/memory | Implemented: consistent edge-to-edge insets, OnBackPressedDispatcher, saved page, single worker, stale-render rejection and 12 MiB maximum per bitmap. At most current/new bitmap during replacement. Physical pinch/back/rotation and memory acceptance pending. |
| M13 | English option letters | Implemented Arabic display labels in official/self-test questions without changing stored option IDs or grading. |
| L1 | Mixed digit systems | Implemented Latin digits consistently in touched account/card/history numeric formatting. Imported question text is not rewritten; content normalization remains a content task. |
| L2 | Model count grammar / empty track clickable | Implemented count grammar, empty copy and disabled empty tracks. |
| L3 | Raw filename model labels | Implemented display cleanup of separators/extensions and the reported biology spelling; stored identifiers/content unchanged. |
| L4 | Same subject appears twice offline | Existing: settings groups subjects by semester. Requires device reproduction if ambiguity persists on the deployed APK. |
| L5 | Hardcoded 1.0.0 | Implemented native App.getInfo version/build with a web release identifier fallback. |
| L6 | Fake FAQ link / clipped support labels | Implemented actual FAQ section at `/contact#faq`, correct link, wrapping labels and touch targets. |
| L7 | English contact validation / no prefill | Implemented Arabic validation and signed-in name/email defaults. No message was submitted to staff. |
| L8 | Repeated/clipped unit heading | Implemented wrapping and omits the generated prefix when the source title already begins with “الوحدة”. |
| L9 | Bare duration number | Implemented minutes label for numeric durations. |
| L10 | Quick-review typo / missing biology summaries | HOLD content: needs precise lesson/summary IDs and approved source content. No global replacement or invented summaries. |
| L11 | Biology math keyboard / clipped exam title | Implemented biology keyboard only for relevant mathematical/genetics prompts; exam title wraps. Drawing limitation is tracked under H4. |
| L12 | Empty performance CTA / nav highlight | Implemented ministerial start link and ministerial/learning-insights navigation matching. |
| L13 | History breadcrumb/filter | Implemented consistent separator, correct subjects destination, stronger selected state and 44px targets. |
| L14 | Offline integrity inspection delay | HOLD performance profiling: do not skip byte verification to label corrupt files ready. Need device timings and file counts before choosing an integrity-preserving optimisation. |
| L15 | Bottom bar above keyboard | Implemented VisualViewport/focus detection hides mobile navigation during keyboard use; physical IME acceptance pending. |
| L16 | Book text too small / no zoom | Partial: PDF rendering now matches viewport and preserves pinch scaling with bounded memory. The exact reported lesson reader needs a device reproduction; no claim that every content type was retested. |
| L17 | Install prompt inside APK / truncated public card | Existing native guard already suppresses the PWA hint. Need screenshot/build/URL for the remaining public-card truncation and any native detection failure. |
| L18 | Small public footer targets | Implemented minimum 44px link height. |
| L19 | Public prototype routes | Implemented production not-found guards for 19A (including children), 19C and the structured-textbook preview; development previews remain usable. |
| L20 | Missing assetlinks.json | BLOCKED on verified Google Play App Signing SHA-256 certificate. Upload/debug certificate is not a substitute. Existing custom-scheme OAuth return stays intact; autoVerify is not enabled with an invented certificate. |

## Security and rollout constraints

- No direct production SQL, new RLS policy, permission expansion, content deletion or account deletion.
- Keystore improves at-rest protection only. It does not authenticate content packages and does not neutralize XSS running in the trusted origin.
- The import figure rule applies to the app's XLSX/ZIP parser, not arbitrary direct database writes. Server publication enforcement belongs in the coordinated content gate.
- Native changes need a new APK. Web changes need deployment. An old installed APK cannot gain the new native plugin through a web update.
- Rollback: revert this branch's commits, preserving #313 if desired. No database rollback is needed. Once a new APK has migrated tokens into Keystore, reverting only the web bundle to a pre-Keystore version would lose access to that stored session; ship compatible storage code during rollback or explicitly require re-login. Never restore a plaintext mirror to make rollback transparent.

## Verification ledger

- Maintained Vitest suite: **111 files / 904 tests passed**, including actual-router nesting, cancelled exam departure, terminal/transient session errors, delayed revocation/account switching, stale roles during identity persistence, encrypted auth migration, native service-worker behavior, media requirements and keyboard visibility.
- Node suite: **312 passed**, including the actual XLSX/ZIP parser. Additional core-reliability checks: **42 static + 18 quick-review tests passed**.
- TypeScript: **PASS**. ESLint: **0 errors / 29 warnings** (27 inherited and 2 browser-fixture Fast Refresh warnings). Generated verification artifacts are excluded from lint, consistent with other build output. `git diff --check`: **PASS**.
- Production web build and browser fixture: **PASS**. [CI run 36639215579](https://github.com/msorori-mh/tas-heel-8e64d405/actions/runs/36639215579) passed both web and browser jobs. The browser checks cover 320/390/768px, simulated system insets, sticky header, content clearance, exam leave/sign-out cancellation and no runtime errors. They use fixture data and do not certify native behavior.
- Android compilation and APK/AAB packaging: **DEFERRED by the user until the teacher-account audit is supplied**. No Android build workflow was triggered by this work.
- GitHub upload/PR: **PASS**, after the user explicitly approved the previously blocked upload. Shell Git had no credential, so the authorized GitHub connector uploaded the exact verified tree `185ac83f9b9a7c39f52849576ad2f34aaa483925` as commit `27bb1b0` (local source `708438a`). PR #314 targets `feat/compact-subject-cards`; no Android workflow, merge or deployment was performed. The local source history is preserved under `archive/student-audit-local-708438a`.

Physical acceptance remains HOLD: reported Samsung, new APK, safe areas, keyboard, app cold restart, credential migration, revoked login, airplane mode, two-account isolation, PDF pinch/back/rotation. Contact send, deletion, payment and published unit/timed exam acceptance were not performed.
