# S2 — Supabase advisor hardening

Status: **four bounded batches PASS on staging**

The restored staging baseline was changed only through the five migrations in
this branch. Production remains unchanged.

## Verified results

- Mutable function search paths: 5 → 0; security notices 244 → 239.
- Duplicate indexes: 1 → 0 while retaining the unique refund invariant.
- Thirteen high-growth question/exam foreign-key indexes created; unindexed
  foreign keys 103 → 90.
- Seven core student RLS policies optimized; `auth_rls_initplan` 154 → 147.
- Performance notices 419 → 411 after the RLS batches.

Fresh indexes appear as unused in staging because it has no representative
workload. Do not delete them, or any of the 99 pre-existing unused indexes,
before load tests. Security-definer grants and remaining policies require
caller-by-caller review rather than mass changes.
