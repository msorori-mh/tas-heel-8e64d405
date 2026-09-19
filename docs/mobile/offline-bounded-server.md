# Bounded offline manifest server repair — 2026-09-19

## Decision

**PASS** for local implementation; **HOLD** for production deployment and phone acceptance.

Baseline: `82475542af198b3110e5ac30cd96a4a148c0b059` on production `main`.
Implementation: `fix/offline-bounded-server`. Companion review-client branch: `fix/offline-bounded-content-rebuild`, commit `4f7a7c6f30d336c4c4498466a928867723fcbaf9`.

This branch ports only the bounded manifest preparation and its required fingerprint/attestation helpers onto the actual production baseline. It does not merge the separate review APK tree, replace the production UI, or apply a database migration.

## Evidence and scope

Read-only inspection of the original production project confirmed all four optional `offline_metadata_v1` columns and `lesson_student_content_gates(uuid[])` are absent. The existing `lesson_student_content_gate(uuid)` is present. The optional RPC is declared as a narrow wire contract locally rather than changing generated database types to suggest a migration was deployed.

Observed content aggregates (no content bodies or student data retrieved):

| Source | Rows | Body bytes | Largest body bytes |
| --- | ---: | ---: | ---: |
| Books | 888 | 1,057,539,387 | 4,430,209 |
| Explanations | 291 | 7,469,065 | 1,859,148 |
| Summaries | 238 | 2,290,143 | 28,117 |
| Mindmaps/experiments | 18 | 88,070 | 19,189 |

These facts establish missing optional dependencies and substantial raw-body volume. They do not establish the exact failed production SQL statement from the user's earlier generic error; no signed-in live failing request or SQL error trace was captured.

## Changes

- Four content categories are read sequentially in eight-lesson batches with stable ID ordering and pagination.
- Metadata pages contain at most 64 rows; if the specific column is missing, legacy text pages contain at most eight rows. Each legacy page is fingerprinted before its bodies are released.
- Existing answer-secrecy, remote-resource, readiness, snapshot and exact-content checks remain enforced. The snapshot path can compare a body fingerprint to the exact text inside an independently verified publication snapshot.
- Missing optional batch RPC falls back to the existing authenticated single-lesson RPC for IDs originating from the RLS-protected lesson query. Missing gate evidence fails closed. Other RPC errors never trigger fallback.
- Errors expose only the content source and bounded database error code. A later failed page cannot produce a successful partial subject manifest.
- At most two manifest builders run per server process, with a bounded queue and Retry-After response. This is not a distributed capacity guarantee.
- All database work remains read-only under the current caller. No stored rows, RLS policies, grants, file formats, answer operations or offline progress identities change.

## Validation

- Focused offline/manifest/capacity suite: **127/127 PASS**, 16 files.
- Final route integration check after the optional RPC type adapter: **12/12 PASS**.
- `npx tsc --noEmit`, targeted ESLint, and `git diff --check`: **PASS**.
- Client/server production bundle: **PASS**, using the available dependency installation, with existing bundler warnings. A fresh-install CI build remains pending.
- Tests cover migrated/unmigrated parity, 70 records for one lesson, per-source errors, pagination, cancellation, missing access evidence, malformed metadata and content attestation.

## Apply and recovery plan

1. Push this branch and open a PR targeting `main`. The companion review branch targets `test/review-september15-complete`.
2. Require clean CI on the exact commits. Confirm the publishing source/commit before deployment; do not deploy unrelated unpublished changes.
3. Publish the server fix, then verify a real authorized student's manifest and artifact requests and safe refusal for unauthorized access. Compare the content aggregate invariants above.
4. Build and test the companion review APK. Verify actual download, interruption, resume, airplane-mode cold start and reconnect synchronization on the physical device.
5. Roll back by reverting the server code commit and republishing the prior source. There is no data migration to reverse or device data to delete.

## Current blocker

Automatic approval review rejected the Git push because it required explicit consent to transmit source and documentation to the connected GitHub repository. No alternative upload or remote write was attempted. Both changes are prepared locally; no new PR, remote CI run, APK, merge, production deployment or Google Play upload exists for this patch yet.
