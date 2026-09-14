# Offline capacity improvement — original application

Baseline: `571a25baf770197a4627f88c3820f643bd65205f`, production inspected 2026-09-14.
The Settings feature (#237) and disposable Android review APK (#238) remain separate.
No JSX, CSS, page arrangement, authentication flow, or native application ID changes here.

## Findings and changes

Production had about 1.1 GiB in PostgreSQL, mostly inline HTML and retained intake payloads.
A cumulative lesson catalog query averaged 2.43 s, and one bulk book-content query averaged
1.94 s (maximum 7.92 s). Those statistics began 2026-09-07 and are not a new load test.
The configured 60 database connections are not a 60-student capacity limit.

- Compute UTF-8 size, exact SHA-256 and offline eligibility in stored generated columns
  when HTML is written/published. Existing rows are populated by the migration. The
  manifest reads descriptors, not full HTML/image bodies. The original body reader and
  delivery-time hash, lifecycle, access and answer-leak checks remain in place.
- Replace one lifecycle RPC per lesson with an RLS-preserving invoker RPC (200 IDs max).
  Missing rows after a permission change abort the manifest. No permissive fallback.
- Evaluate subject access as a non-correlated set for the lesson SELECT policy and cache
  invariant staff checks once per SQL statement. Keep all staff/student/grade/track rules.
- Limit concurrent manifest preparation to 2 and artifact preparation to 8 **per server
  instance**. Return 503 plus Retry-After under contention. These limits do not establish
  a distributed/global traffic quota or a simultaneous-user capacity guarantee.
- Retry only transient read responses (429/502/503/504), at most twice, with bounded
  Retry-After and jitter. Preserve cancellation; never retry a write, 401/403, or 409.
- Reuse home/lesson query data for 30 seconds and avoid focus-driven duplicate reads for
  those queries. Existing account cleanup and keys remain in place.

## Verification

- Manifest equivalence between original bytes and stored descriptors; malformed, unsafe,
  empty, oversized, or stale content rejected/omitted consistently.
- Real route test: 40 lessons -> 1 gate RPC; 201 lessons -> batches of 200 and 1.
- Five-role SQL equivalence, grade/track/draft/legacy isolation, anonymous denial,
  unforgeable generated columns, unchanged content checksums/timestamps and automatic
  descriptor refresh. SQL and JavaScript use the same 72 edge-case vectors.
- PostgreSQL 17 fixture: 1,458 lessons, 44 subjects, 478 synthetic 1 MiB bodies. Compare
  before/after at 1/5/25/50 database clients on an isolated 2-CPU/1-GiB CI container.
  Two catalog requests/client is a short component comparison, not a sustained test of
  full student sessions. Synthetic compressibility, hardware and network differ from
  production. No production load generator is run.

## Rollout and recovery

1. Verify current production columns/policy definitions and capture record counts plus
   content digests/timestamps. Confirm an available database backup/recovery point.
2. Apply `20260914004320_offline_capacity_metadata_and_access.sql` before the web build.
   Adding stored generated columns rewrites the four source tables; it needs a quiet
   maintenance window. `lock_timeout=5s`, `statement_timeout=120s`, and a transaction
   make contention or timeout fail atomically. Never remove these guards to force apply.
3. Compare content/counts/access and sample descriptors, then deploy the matching web SHA.
   Older web/APK clients remain compatible with the unchanged manifest/artifact contract.
4. If the web change needs rollback, deploy the baseline web build while keeping the
   additive columns and RPC. Do not drop columns during an incident. Restore the four
   old policies from the captured baseline only if an access regression is demonstrated.

## Remaining limits

HTML/images still occupy the original tables; this change reduces manifest transfer and
recomputation, not database storage size or the first actual content download. Assessment
bundles are still assembled at request time (existing concurrency 6). The limiter bounds
preparation in each worker; it does not bound every platform buffer during slow delivery.
Moving immutable content/assessment artifacts to private storage with cache-aware delivery
and managing intake retention require a separately verified data migration. End-to-end
capacity needs real authenticated student flows, sustained/spike loads, production-sized
resources and CPU/RAM/egress metrics. The review APK's embedded UI is not a benchmark of
the published remote-shell app. Keep Google Play publication and #237 field approval held.
