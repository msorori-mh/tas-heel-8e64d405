# TAMKEEN_20C_MIGRATION_RECONCILIATION_AND_SECURITY_CLOSURE_20C_A1

READ-ONLY on production. No data write, no publish, no deploy, no workspace enablement.

## 1. Reconcile successful migration source

`supabase/migrations-pending/20260822010000_lesson_capability_lifecycle_20c.sql`
was still carrying the pre-apply (failed) mind map backfill. It has been
reconciled to the version that actually succeeded on production:

- Removed every reference to `lesson_resources.lifecycle_status` (the column
  does not exist in production; confirmed against `information_schema`).
- Mind map backfill is now: any existing mind map resource (`resource_type` or
  `html_resource_type` = `mindmap`) => `READY`, exactly as applied.
- Added `DROP POLICY IF EXISTS` before each policy so the file is replayable.
- No other rule, constraint, grant, RLS predicate or RPC logic was changed.

MIGRATION_SOURCE_MATCHES_SUCCESSFUL_PRODUCTION_APPLY=YES

## 2. Security grant drift → follow-up migration (PREPARED, NOT APPLIED)

`supabase/migrations-pending/20260822020000_lesson_capability_lifecycle_20c_grants_hardening.sql`

Idempotent and behaviour-neutral; it only records the manual post-apply
hardening in migration history:

- `REVOKE ALL ... FROM anon, PUBLIC` on `public.lesson_capability_lifecycle`
- `REVOKE INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER FROM authenticated`
- `GRANT SELECT` to `authenticated`, `GRANT ALL` to `service_role`
- `REVOKE ALL FROM PUBLIC, anon` on `lesson_capability_transition(...)`;
  `GRANT EXECUTE` to `authenticated` + `service_role`
- `REVOKE ALL FROM PUBLIC, anon, authenticated` on
  `touch_lesson_capability_lifecycle()` (trigger helper — production still has
  the default `PUBLIC`/`anon` EXECUTE; this is the only real grant drift found)
- Defensive `SET search_path = public` on both functions

No privilege is widened anywhere.

## 3. SECURITY DEFINER audit — `lesson_capability_transition`

| Check | Result |
| --- | --- |
| PUBLIC_EXECUTE | NO |
| ANON_EXECUTE | NO |
| AUTHENTICATED_EXECUTE | YES (required: sole write path, guarded internally) |
| SEARCH_PATH_PINNED | YES (`search_path=public`) |
| ROLE_GUARD_FAIL_CLOSED | YES (`auth.uid()` NULL or non-staff => `42501 NOT_AUTHORIZED`; READY/reject require full admin) |

`touch_lesson_capability_lifecycle()` is `SECURITY INVOKER`, trigger-only,
`search_path` pinned; execute privileges revoked by the follow-up migration.

## 4. Fresh PG17 replay (clean baseline, unprivileged cluster)

Script: `/tmp/pg20c/run-pg17-20c-a1-replay.sh` (production-faithful stub:
`lesson_resources` WITHOUT `lifecycle_status`).

```
FRESH_APPLY=PASS
FOLLOWUP_APPLY=PASS
IDEMPOTENT_REPLAY=PASS   (both files applied twice, no error)
BACKFILL=PASS            (all rows READY; both mind maps READY)
RLS=PASS                 (enabled; exactly 2 SELECT policies; 0 write policies)
GRANTS=PASS              (anon no table read, no RPC execute; authenticated SELECT-only + RPC execute)
ROLE_GUARD_FAIL_CLOSED=YES
```

MANUAL_POST_MIGRATION_SQL_REQUIRED=NO

## 5. Production drift check

| Item | Result |
| --- | --- |
| TABLE_STRUCTURE_MATCH | YES (14 columns, identical order/types, both indexes) |
| RLS_MATCH | YES (`relrowsecurity=t`, same 2 SELECT policies, same predicates) |
| FUNCTION_MATCH | YES (SECURITY DEFINER, `search_path=public`, same signature) |
| GRANTS_MATCH | YES for table + RPC; NO for `touch_lesson_capability_lifecycle()` (production keeps default PUBLIC/anon EXECUTE) — closed by the follow-up migration |
| DATA_VISIBILITY_UNCHANGED | YES (103 rows, all READY; no production write performed) |

Production row profile (unchanged): officialBookContent 21, tamkeenExplanation 40,
originalBookPdf 40, checkUnderstanding 1, lessonAssessment 1 = 103.

## 6. Gate

Follow-up security migration is PREPARED ONLY. Waiting on
`APPROVED_PRODUCTION_20C_SECURITY_RECONCILIATION_APPLY`.

## Summary fields

```
ORIGINAL_42703_CAUSE=backfill referenced non-existent column lesson_resources.lifecycle_status
CANONICAL_MIGRATION_FIXED=YES
MANUAL_PRODUCTION_GRANT_FIXES=revoke anon on 20C table/RPC; authenticated SELECT-only + RPC EXECUTE
FOLLOWUP_MIGRATION=supabase/migrations-pending/20260822020000_lesson_capability_lifecycle_20c_grants_hardening.sql
ANON_TABLE_ACCESS=NONE
ANON_RPC_EXECUTE=NO
AUTHENTICATED_PRIVILEGES=SELECT on lesson_capability_lifecycle + EXECUTE on lesson_capability_transition only
FRESH_PG17_REPLAY=PASS
PRODUCTION_SCHEMA_MATCH=YES
PRODUCTION_GRANTS_MATCH=YES (table/RPC); trigger-helper EXECUTE drift pending follow-up
MANUAL_SQL_REQUIRED_AFTER_REPLAY=NO
PRODUCTION_WRITE_PERFORMED=NO
WORKSPACE_ENABLED=NO
WORKSPACE_BUTTONS_PRODUCTION_ENABLED=NO
READY_FOR_20C_SECURITY_RECONCILIATION_GATE=YES
```

**الحكم: TAMKEEN_20C_MIGRATION_RECONCILIATION_AND_SECURITY_CLOSURE_20C_A1 = PASS_READY_FOR_SECURITY_RECONCILIATION_GATE**
