# Independent target security reconciliation — 15 October 2026

Target: `yjpirilbpqxtmnayruht` (Tamkeen-Migration).
Source: `zbdhxyuulyovihjgeqbn`. Application baseline: `f7dd0a59af9b960b941e2cfde6e5211f6a7292c7`.

## Applied and verified

The target's application definitions mostly matched the source, but it retained
additional grants on 251 functions and 49 tables. It also retained two destructive
prelaunch functions that the source had retired, and lacked `admin_review_coverage_facts`.
The migration in `scripts/independent/target-security-20261015.sql` was applied
through the Supabase migration API to the target only. It removes the measured
extra grants, installs the two fail-closed retired definitions, and installs the
missing invoker function with the source's grants. It does not copy Lovable's
`sandbox_exec` role or grants.

Live post-verification compared all 550 application function/table ACL objects:
zero differences from the source's intended grants. Both retired functions were
invoked inside a read-only transaction and rejected execution with their expected
`RETIRED` errors. All three changed functions are security invokers. Anonymous
execution is denied for all three; authenticated execution is allowed only for
the admin coverage function, which checks the caller's admin role.

## Rehearsal and data boundary

The validated October 13 source archive contains 162,665 rows in the 123 comparison
tables. An isolated PGlite PostgreSQL 18.3 rehearsal restored 69,672 unchanged
target rows and the 188 target-specific/different rows, then successfully installed
the source's constraints and triggers. The security migration passed against that
copy, including checks of all 550 ACL objects and anonymous/non-admin denial.
The actual managed target is PostgreSQL 17; its live post-verification is recorded
above. The rehearsal is not a managed-provider backup-restore test.

No application records or Storage object bytes were transferred by this migration.
The measured historical content gap was 92,948 rows, with 143 target-only rows and
45 differing shared rows requiring preservation/reconciliation. The source has
continued changing since that snapshot. A current delta, content merge rehearsal,
Storage verification, role-based E2E acceptance, hosting access and controlled final
write freeze remain required before production cutover. Production DNS and the
Lovable-hosted application have not been switched by this work.

The target rollback reference is the provider's physical backup at
2026-10-14 05:01:14 UTC, shown by the user, who confirmed no later target data writes.
That assertion is not independent proof and the database backup does not contain
Storage bytes. A captured exact ACL/function rollback script is retained privately;
it would restore old dangerous capabilities, so it is an emergency action only.
