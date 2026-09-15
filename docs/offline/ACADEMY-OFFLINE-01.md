# Academy offline learning — stage 1

Implementation branch: feat/academy-offline-learning, based on the unified mobile review branch. No production deployment or database change is included in a repository write.

## Included

- Compact student home card below the greeting, linking to the expanded offline settings section. Counts only the current account's ready packs; incomplete packs offer resume. It does not claim that every subject or latest revision is present without a manifest comparison.
- Teacher Downloads navigation and catalog notice without restructuring existing academy pages.
- Explicit download of enrolled program text and direct PDF/raster-image files. Files are bounded to 25 MiB each, fetched without credentials, hashed, persisted in IndexedDB and verified before opening/reuse. External sites, embedded viewers and video are reported as unavailable offline. Interrupted file downloads restart the partial file; completed verified files can be reused. A separate refresh action fetches updated bytes at the same URL.
- Account-scoped packs, files, progress outbox and personal note entries. Sign-out/account changes revoke the local entry pointer; retained per-account bytes are inaccessible through the other account's UI. This is device-local offline access, not encryption against someone who controls the device or instant offline revocation.
- Completion replay uses the existing authenticated, idempotent complete_lesson RPC. Notes use immutable UUID operations: concurrent notes from separate devices remain separate entries rather than overwriting one another.
- Replay is bound to a verified access token, serialized per account, retains failed operations and rechecks the active owner before acknowledgment. Online events and foreground retries replay work; no operating-system background-sync guarantee when the app is closed.
- Public, account-free academy shell is built before normal builds. Its service worker precaches the shell and all emitted chunks, never authenticated API responses. Cold offline navigation opens the local library. Returning online does not discard an unsaved note draft.

## Backend gate

Migration `20260915021143_academy_offline_notes.sql` is additive: one RLS-protected academy table and a SECURITY INVOKER RPC. No progress/certificate logic is modified. Until this migration is applied in the intended backend, local notes remain pending and the UI explains the failed sync. Production is Lovable-managed; do not claim cloud note sync is activated merely because the client was built.

Rollback before production activation: revert the client release. Retain the additive note table if it contains user notes; do not drop data as a routine rollback. Staging migration and production backup/review gates remain separate.

## Verification

- Existing academy contracts and root/academy TypeScript checks.
- Focused replay tests: immutable token binding, owner mismatch, failure retention, repeat operation IDs, no network offline and concurrent replay coalescing.
- Chromium fixture: program/file download, reuse, service-worker cold offline reload, other-owner isolation, durable progress/notes, reconnection replay and a failed note retry using the same operation ID. This is a synthetic authenticated fixture, not production Google login.
- Disposable PostgreSQL 17: existing academy contracts followed by replay/collision, owner/enrollment/suspension, anonymous denial and immutable notes checks.

Remaining release review: teacher-device offline cold start, file opening on the target Android WebView, Google session refresh, representative real programs, and the additive note migration on a matching test backend. Certified tests, video download, assignments, and live meetings are outside this first stage.
