# Legacy text approval compatibility

Baseline: ace20ef2b7538a1c41e542a263ac5c0a859de7f1 (after the incomplete-answer repair).

Live Chemistry advanced past OFFLINE_ASSESSMENT_ANSWER_MISSING and exposed OFFLINE_SOURCE_READY_HASH_MISMATCH. Read-only inspection found five affected text sources: one official book body and two explanation/quick-review pairs. All five stored V3 snapshots validate against the database's v3_capability_snapshot_hash, and all five equal the current v3_capability_snapshot. This is an approval-format mismatch, not evidence of changed content.

The prior downloader compared the SHA of raw HTML with ready_hash even for v3.snapshot.1 approvals, where ready_hash covers the whole canonical snapshot. A shared verifier now accepts the original exact-body approval or a V3 snapshot only when its canonical hash matches ready_hash, its lesson/capability match, and the exact body occurs in the approved payload. Unsupported number representations fail closed. Manifest and artifact delivery use the same verifier. Integrity checks, RLS/lifecycle gates and manifest schema are retained.

Evidence: PostgreSQL-generated Arabic/emoji hash vector passes; modified bodies, altered snapshots and wrong lesson/capability reject. A read-only local test against the five actual production snapshots accepts all five original bodies and rejects all five altered bodies. The production fixture remains outside Git and is not published. No DB data, approval hashes or snapshots were rewritten.

Release gate: CI and real Chemistry download after publication. Rollback: revert source and redeploy; no database rollback needed. Native airplane-mode acceptance remains separate.
