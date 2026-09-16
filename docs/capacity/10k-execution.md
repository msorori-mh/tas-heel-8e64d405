# Authenticated capacity program — 16 September 2026

## Baseline and authority

Repository baseline: `9a566791c7cfd821b84b5a54c44cad614e8ac677` (main).
User approved the complete capacity implementation and execution. Measurements
must not modify real student data. Target: `qwfvlppsffcmmbjpznkw`, tamkeen-staging,
ap-south-1. Production load is hard-blocked by the runner.

Initial database: 198,937,747 bytes, 33 pre-existing Auth users, 60 maximum DB
connections, 12 observed connections. These are a staging snapshot, not a
production entitlement or a 60-student limit. HTTP clients share pooled DB access.

The old visitor benchmark proves only catalog requests. The new workload uses
independent TEST_ONLY Auth identities, authenticated RLS reads, Grade 12 scope,
real offline-write RPCs, replay checks, and ministerial create/answer/submit/readback.
The existing 33 users must remain unchanged. Load identities are tagged by exact
`capacity_run`, use reserved `.invalid` emails, and have no administrative roles.

## Stages and gates

1. CAP-01: functional authenticated smoke, identity isolation, replay correctness.
2. CAP-02: external baseline, then 25, 100 and 500 concurrent users. Stop on a
   failed endpoint latency/error/correctness gate. Never relabel a failure as PASS
   by increasing thresholds. Record generator event-loop lag and peak HTTP load.
3. CAP-03: inventory/close staging-production schema and resource parity, including
   Auth, hosting, storage bytes and curriculum publication state. Migration names
   alone are insufficient: restored staging has an older history but newer objects.
4. CAP-04: 1,000 → 2,500 → 5,000 → 10,000 using independent session pools and
   distributed generators with a shared start time; no duplicated identities.
5. CAP-05: two one-hour 10k runs plus separate download, synchronized exam-submit,
   reconnect, session-refresh and recovery scenarios. Verify stored data after load.
6. CAP-06: monitoring, measured monthly cost, rollback and gradual real rollout.

Proposed request gate: error rate <=0.5%, p95 <=2s for each critical API endpoint,
no incorrect ownership/readback/replay, at least one completed journey per VU,
and generator p99 event-loop lag <100ms. Report p99 and peak latency too.
A short protocol run is not proof of one-hour stability or real mobile UX.

The current workload deliberately repeats a full journey with 2-second randomized
think time; it is a stress profile, not a measured distribution of student behavior.
Content selection is one Grade 12 subject/model. Coverage must be broadened before
claiming 10k product capacity. Google OAuth, browser rendering, APK and CDN transfer
are explicitly excluded from this API report.

## Implemented safeguards and delivery

- Bounded latency histograms rather than unbounded per-request arrays.
- Aggregate-only reports: no access/refresh tokens, passwords, student answers or IDs.
- Reject wrong host, wrong issuer, non-TEST_ONLY claims, duplicate identities and
  sessions that will expire before a run ends. JWT claims are locally sanity-checked;
  the server performs actual signature verification on each request.
- Auth setup is outside measurement and paced to respect token rate limits.
- External runner receives an AES-GCM payload wrapped with its ephemeral RSA public
  key. The private key exists only in that runner, and is deleted in an always step.
  Payload is bound to workflow ID and expiry. Only ciphertext enters the branch;
  remove transfer files after the run. Do not publish plaintext test credentials.
- Offline retry delay uses bounded jitter; reconnect signals are coalesced and
  spread across 0.5–5 seconds, without changing mutation IDs or discarding queues.

## Monitoring and resource decisions

For each load stage capture before/after DB query calls, total time, lock waits,
active/total connections, transaction failures and storage transfer/cache headers.
CPU, memory, disk I/O and compute tier require provider metrics; SQL connection
counts alone cannot justify a resource upgrade. Alert at sustained 60% and 80%
resource usage, rising p95/5xx/429, oldest pending sync age and answer-save failures.

Do not infer production capacity from staging. The available connector exposes
staging only. Production compute, hosting quotas and storage/CDN telemetry still
need an authorized provider control-plane view before sizing or changing plans.

Lesson-file and textbook delivery routes currently authorize each request and
use private cache-control. Do not make them public-cacheable merely to improve
load figures. Assess versioned protected asset delivery separately while retaining
revocation, cross-user isolation and the offline contract.

Cost must be derived from measured RPS, session duty cycle and bytes. For example,
10,000 students downloading 100 MB each transfers about 1 TB before updates/retries;
this is an arithmetic example, not an estimate of current package size. Separate
compute, cached/uncached egress, storage, Auth users, observability and generators.

## Rollback and cleanup

Client jitter changes can be reverted independently; no production DB migration.
Freeze the generated Auth IDs before cleanup. Verify TEST_ONLY/run/email and revoke
only their sessions, then remove only those exact IDs using normal FK behavior.
Verify all 33 original users remain and test progress, attempts and replay ledger
are removed. Do not disable constraints/triggers or touch non-test records.

## Provider references checked 2026-09-16

- [Compute billing](https://supabase.com/docs/guides/platform/manage-your-usage/compute):
  indicative monthly compute alone: Medium ~$60, Large ~$111, XL ~$210, 2XL ~$410.
  These exclude plan fees, credits, storage, egress and hosting. No tier is selected
  or purchased without measured resource demand; a compute change can cause downtime.
- [Metrics API](https://supabase.com/docs/guides/observability/metrics): provider
  metrics can feed Prometheus/Grafana. An authenticated collector and alert recipient
  configuration are still required; SQL snapshot files are not a deployed alert service.
- [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits): default token
  rate is 150 requests / five minutes / IP with a burst of 30. Login preparation and
  refresh load must be accounted for separately. No forwarding-header spoofing or
  authentication bypass is used by this runner.
- [Storage CDN](https://supabase.com/docs/guides/storage/cdn/fundamentals): measure
  cache hits and uncached origin traffic, not just total download success.
