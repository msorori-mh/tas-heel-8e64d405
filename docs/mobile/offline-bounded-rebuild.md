# Bounded offline preparation and isolated library downloads

## Decision and baselines

Stage 1 implementation: **PASS** for the local acceptance tests below. Production/physical-phone acceptance: **HOLD**.

- Review baseline: `55e55fd20bad9ed8f821dbcb18d85a24a3a191db`, `test/review-september15-complete` (PR #276).
- Review implementation branch: `fix/offline-bounded-content-rebuild`.
- Production has a different source tree (`82475542af198b3110e5ac30cd96a4a148c0b059`). The bounded manifest server fix is separately prepared on `fix/offline-bounded-server`; this review branch must not be merged wholesale into main.
- The review APK forwards API calls to the existing production backend. Packaging the new UI does **not** deploy the server changes.

## Reproduced evidence

Read-only inspection of the original project's production database confirmed that all four `offline_metadata_v1` columns and the `lesson_student_content_gates(uuid[])` RPC are absent; the existing single-lesson gate is present. These missing dependencies would break deployment of the original review server against this database. They do not by themselves prove the cause of the earlier error on the production raw-body route.

The same inspection found 888 book bodies totaling 1,057,539,387 bytes (largest 4,430,209 bytes), 291 explanations totaling 7,469,065 bytes, 238 summaries totaling 2,290,143 bytes, and 18 mindmap/experiment resources totaling 88,070 bytes. Fetching a whole subject's bodies in four concurrent unbounded requests creates avoidable load. No production row was modified.

## Behavior

- Read content categories sequentially, eight lesson IDs per batch, with deterministic pagination. Metadata pages contain at most 64 rows; legacy body pages at most eight.
- Fall back to bodies only when the database specifically reports the metadata column missing; fingerprint each small page before retaining the descriptors. The existing checksum, readiness, answer-secrecy and remote-dependency gates still run.
- Fall back to the existing authenticated single-lesson RPC only when the optional batch RPC is specifically absent. Missing gate evidence, permissions and other failures remain failures.
- Return a bounded source/error code (for example `content_books_57014_lookup_failed`), never arbitrary database messages. A failed page never returns a successful partial subject manifest.
- Keep manifest timeout/429 and per-subject reasons visible. If every manifest fails, show preparation failure, not an empty curriculum.
- Continue to later subjects after isolated HTTP/transport transfer failures. Accumulate only verified bytes from failed subjects and never report them as completed. Keep a diagnostic for each failed subject.
- Stop on cancellation, identity/authentication changes, storage failure and integrity errors. Do not misclassify application/callback TypeErrors as network errors.
- Retain the existing durable artifact and progress formats. Completed files are verified/reused on resume; an interrupted file restarts. This is file-level resume, not byte-range or background downloading.

## Local evidence

- `npx vitest run tests/offline tests/load/offline-manifest-route.test.ts tests/load/offline-capacity.test.ts`: **167/167 PASS**.
- `npx tsc --noEmit`: **PASS**.
- Targeted ESLint and `git diff --check`: **PASS**.
- `npm run build`: **PASS** for client and server, with existing bundler warnings.
- The synthetic interrupted-download journey uses the real downloader, state repository, checksum verification and lesson reconstruction with mocked HTTP/storage/session. It retains the first file, recreates the repository, downloads only the unfinished file, reads lessons with zero network calls and denies a different owner.
- Route tests compare complete artifact lists between migrated and unmigrated schemas, page through 70 records for one lesson, reject access changes, and expose isolated source errors without partial manifests.

## Remaining release gates

1. Deploy and verify the separate server fix against the existing backend; do not apply the capacity migration as a workaround.
2. Build the review APK from the exact tested source and verify its CI artifacts and Android instrumentation.
3. On the physical phone, download a real subject, interrupt/resume, cold-start in airplane mode, answer supported offline assessments, then reconnect and verify synchronization without lost/duplicate progress.
4. No Google Play publication until field acceptance. Do not delete existing phone data to install a differently signed review build.
