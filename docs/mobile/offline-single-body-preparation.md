# Single-body offline preparation repair

Baseline: production `main@3cafde4d1690596aba49da06face4eedc5ce5a25`.
Branch: `fix/offline-content-timeout`.

## Report and diagnosis

The physical-device screenshots show settings failing before download with
`OFFLINE_MANIFEST_FETCH_500 / content_books_57014_lookup_failed` while preparing
Quran. This is a content-read cancellation, separate from the previous capacity
queue failure. PostgreSQL defines 57014 as `query_canceled`:
https://www.postgresql.org/docs/current/errcodes-appendix.html.

Read-only checks on the original production database found:

- `lesson_book_contents.offline_metadata_v1` remains absent, so the compatible
  server path must fingerprint the published bodies it reads.
- The authenticated and PostgREST authenticator roles have an 8-second statement
  timeout. This repair does not change it.
- The first eight Quran book bodies contain 16,125,330 bytes before JSON framing;
  individual bodies range from 1,296,407 to 3,255,728 bytes in that batch.
- The existing lesson-ID unique index is present. An aggregate query reproducing
  the eight-body JSON response used that index and took 3,408 ms, including body
  materialization/serialization; a separate single-body sample took 32 ms.
  These samples ran through the database inspection role, at different cache/load
  conditions. They are not authenticated endpoint benchmarks or a speedup claim.
- A manual authenticated web update check succeeded before this repair. The
  failure is intermittent; the user's cancelled request is not available as a
  full server trace. The oversized legacy response is a measured weakness,
  rather than a proven explanation for every possible 57014.

No student profile, content body or answer was exported in the diagnostic output.
Inspection returned schema, indexes, role timeouts, content sizes and query plans.

## Change

Legacy content pages now contain one body rather than eight. Each body is
fingerprinted and released before the next request. Lightweight metadata pages
remain at 64 rows; the eight-lesson query scope and stable ID ordering remain.
An isolated 57014 on a legacy page retries that exact page once, under the existing
request cancellation and 120-second deadline. Successful pages are not fetched
again. A second failure rejects the entire manifest and exposes the bounded
diagnostic; partial content is never presented as a complete subject.

Only a specifically missing optional metadata column permits legacy reads.
Permissions, RLS, content attestation, answer secrecy, hashes, client contracts,
saved-file formats, native application identity and publishing of laboratories
or mindmaps remain unchanged. This server repair works with existing review APKs.
No migration, database mutation, timeout increase or Play upload is included.

## Validation and release gate

- Focused offline, manifest and capacity suite: 146/146 PASS, 17 files.
- Reader/route regression subset: 33/33 PASS. It covers complete artifact parity
  when multi-body responses are cancelled, one-row pagination across lessons,
  multiple records per lesson, a transient failure after earlier pages, persistent
  errors, permission refusal, and cancellation before retry.
- TypeScript, targeted lint and diff check: PASS.
- Exact-head CI, synchronized production deployment and authenticated live checks
  are required. Final results will be recorded on the pull request.
- Actual native airplane-mode cold start and answer synchronization remain a
  physical-phone acceptance gate; a browser manifest check does not prove them.

Rollback: revert this server reader change and redeploy. No database rollback or
deletion of previously downloaded content is necessary.
