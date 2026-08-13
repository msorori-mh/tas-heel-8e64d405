# SEC-PURGE-GUARD-11B — Report

**Verdict: PASS.** `qb_e2e_purge_questions` is hardened, proven, and then
permanently removed from the shared production database.

## 1. Why

The function could `DISABLE TRIGGER USER` on `questions`, `question_revisions`
and `question_targets` — i.e. bypass the G-1 immutability guards. Stage 11A also
proved that Supabase's default-grant event trigger can re-grant `EXECUTE` to
`anon` on any recreated function. A tool with that power must not live on a
database that is about to hold real content.

## 2. Hardening (transitional migration)

Added, before the destructive part of the function runs:

- prefix must start with `e2e-`, be at least 4 chars, and contain no `%` or `_`
  wildcards (an `e2e-%` prefix would otherwise widen the `LIKE` pattern);
- scope pre-check: any row in the target set whose `code` is not `e2e-*` aborts
  with `E2E_PURGE_SCOPE_VIOLATION`;
- `audit_logs` rows written on every call (`.begin` and `.end`, with prefix,
  row count, actor, timestamp);
- `REVOKE ALL` from `PUBLIC`, `anon`, `authenticated`; `EXECUTE` for
  `service_role` only.

## 3. Guard proof on the shared database — 9/9 PASS

| # | Check | Result |
| --- | --- | --- |
| G1 | `anon` call | `permission denied for function qb_e2e_purge_questions` |
| G2 | authenticated student (real minted JWT) | `permission denied for function qb_e2e_purge_questions` |
| G3 | `service_role` with `prod-` prefix | `E2E_PREFIX_REQUIRED` |
| G4a–d | prefixes `e2e-%`, `e2e-_`, `e2e`, `%` | all `E2E_PREFIX_REQUIRED` |
| G5 | `service_role` + `e2e-` on a clean DB | returned 0, `questions` 14 → 14 |
| G6 | `audit_logs` | `.begin` + `.end` rows present |

## 4. Permanent removal

`DROP FUNCTION public.qb_e2e_purge_questions(text)` applied.

Verification: `pg_proc` matches = **0**. Post-state: `questions` 14,
`question_revisions` 0, `question_targets` 0, `e2e-%` questions 0, audit rows
from the guard test retained (2).

```text
PURGE_FUNCTION_ABSENT   = YES
ANON EXECUTE            = DENIED
AUTHENTICATED EXECUTE   = DENIED
AUDIT                   = PRESENT (guard test evidence)
```

## 5. Teardown policy change (per governance correction)

`tests/e2e/content-import/qb-e2e-teardown.ts` no longer falls back to a broad
privileged delete. It now:

- lists only `e2e-%` questions and aborts on any non-`e2e-` row in the set
  (`E2E_TEARDOWN_SCOPE_VIOLATION`);
- **fails closed** with `E2E_TEARDOWN_BLOCKED_PUBLISHED` when the set contains a
  `PUBLISHED` or `SUPERSEDED` revision, instead of forcing history away;
- otherwise deletes through ordinary guard-respecting paths, in FK order.

Standing rule: `qb_e2e_purge_questions` is **permanently absent** and must not
be recreated on the shared database, not even temporarily. Destructive tests
against published question trees run on an isolated PostgreSQL 17 cluster.

Operational consequence, recorded deliberately: the publishing branch of
`run-question-import-e2e-08.ts` can no longer clean itself up on the shared
database, so that suite is now a PG17-only suite. Non-publishing paths
(unified E2E 09, which never publishes) remain runnable on the shared database
— it scored 40/40 in 11A and its teardown touches only DRAFT rows.
