# OFFLINE-IRON-01 — published interactive resources

Baseline: main c6f8a2e. Scope: server manifest + exact-byte artifact delivery.

On 2026-09-22, the published chemistry lesson `2ba2f988-7da0-451a-ae08-ba804d36312a`
("الدرس 4: خواص الحديد ومركباته") displayed its map and lab online. Its
resource rows use `html_resource_type=mindmap/experiment` and
`metadata.cf11_render_mode=INTERACTIVE`. Both offline endpoints previously required
`html_resource_type=INTERACTIVE`, silently dropping these valid publications.

The shared predicate supports the existing INTERACTIVE representation and exact
kind-shaped rows with explicit INTERACTIVE publication metadata. It rejects
mismatched types, missing publication mode and external resource URLs. Existing
access checks, READY gates, body-hash verification, remote-reference rejection,
answer checks and runtime sandbox/CSP are unchanged. No database write is needed.

Regression evidence: 33 focused tests passed, including legacy reads, compact
metadata and prepared-descriptor manifests; GET/HEAD; denied access, not-ready,
bad hashes and remote references; exact published map/lab bodies; reconstruction
from saved bytes after repository recreation and account isolation. TypeScript
and production build passed locally. Actual Android airplane-mode retest after
server deployment remains required; repository recreation is not device E2E.

Only server files change. The current Android review package can receive the
missing resources through "تنزيل التحديثات" after deployment; do not delete
existing downloads, progress or answer queues. An already saved old manifest
cannot acquire the omitted resources until refreshed.

Independent content finding: the fourth lesson's stored lab is titled
"مختبر البصريات الهندسي التفاعلي". Delivery compatibility does not certify its
academic relevance. This change preserves the exact published file, not an
invented chemistry replacement. Exact-content verification fixtures remain local. Committed regression tests use
synthetic HTML with the measured production metadata shape; no teaching content
or student/publisher identity is exported with this change.

Release gate: local PASS; production HOLD until deployed and refreshed-pack
verification succeeds. Rollback: revert this server change; existing downloaded
files and student records are not modified by deployment or rollback.
