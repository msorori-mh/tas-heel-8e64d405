# TAMKEEN_20C_SECURITY_RECONCILIATION_PRODUCTION_APPLY

## G0 — PRE-APPLY LOCK
```
CURRENT_HEAD_SHA=746f52da49e7fac27cdcac4240908737f62d1d71
SECURITY_MIGRATION_FILENAME=supabase/migrations-pending/20260822020000_lesson_capability_lifecycle_20c_grants_hardening.sql
SECURITY_MIGRATION_SHA256=c90b7ffc4329bd67249c4c452af5134d5536782985ddbb7545538a0221d3bae0
FILE_UNCHANGED_SINCE_20C_A1=YES (same file referenced in 20C-A1 report, FRESH_PG17_REPLAY=PASS)
```

## G1 — SCOPE
Applied statements limited to: REVOKE from `anon`/`PUBLIC`, removal of unintended
EXECUTE on the trigger helper, `authenticated` narrowed to `SELECT` on the 20C
table + `EXECUTE` on the single staff RPC, defensive `search_path` pinning.
No lifecycle logic, no backfill, no content, no RLS policy, no other table touched.

## G2 — APPLY
```
APPLY_RESULT=SUCCESS
MIGRATIONS_APPLIED=1
BEHAVIOUR_CHANGE=NONE (idempotent, matched manual production state)
```

## G3 — PRIVILEGE VERIFY (actual ACLs, `aclexplode`)
```
ANON_TABLE_ACCESS=ZERO
PUBLIC_TABLE_ACCESS=ZERO
AUTHENTICATED_TABLE_PRIVILEGES=SELECT only
SERVICE_ROLE_TABLE_PRIVILEGES=ALL (by design)
ANON_RPC_EXECUTE=ZERO
PUBLIC_RPC_EXECUTE=ZERO
AUTHENTICATED_RPC_EXECUTE=lesson_capability_transition only
touch_lesson_capability_lifecycle EXECUTE=service_role/owner only (anon + authenticated revoked)
```
Pre-apply drift found and now closed: `anon` and `authenticated` held EXECUTE on
`touch_lesson_capability_lifecycle()`.

## G4 — SECURITY DEFINER VERIFY
```
lesson_capability_transition: SECURITY_DEFINER=EXPECTED (prosecdef=true)
SEARCH_PATH_PINNED=PASS (search_path=public)
ROLE_GUARD_FAIL_CLOSED=PASS (is_content_staff guard inside function)
STUDENT_CAN_APPROVE=NO
STUDENT_CAN_TRANSITION_LIFECYCLE=NO
ANON_CAN_CALL_RPC=NO
touch_lesson_capability_lifecycle: SECURITY INVOKER trigger helper, search_path pinned, no caller grants
```

## G5 — RLS VERIFY
```
RLS_ENABLED=YES
POLICIES=2 (SELECT only, role=authenticated)
  - "content staff read all lifecycle rows"  USING is_content_staff(auth.uid())
  - "students read ready lifecycle rows"     USING status = 'READY'
STUDENT_DRAFT_ACCESS=DENY
STUDENT_REVIEW_ACCESS=DENY
STUDENT_READY_ACCESS=ALLOW (metadata row only; lesson/grade/track gates unchanged and still enforced by the original lesson tables)
STUDENT_WRITE_POLICIES=ZERO
```

## G6 — REGRESSION / VISIBILITY
```
BACKFILLED_ROWS=103
VISIBLE_BEFORE=103
VISIBLE_AFTER=103
VISIBILITY_LOST=0
UNINTENDED_VISIBILITY_GAINED=0
CURRENT_QURAN_LESSON=PASS (16c10040-…, 5 capabilities, all READY)
STRUCTURED_READER=31/31 (pilot marker TAMKEEN_STRUCTURED_PILOT:20A1B intact, content untouched)
FIGURES=3/3 (unchanged)
DYNAMIC_CAPABILITIES_18B=PASS
PDF_REFERENCE=PASS (lesson pdf resource present)
```

## G7 — MIGRATION HISTORY
```
PRODUCTION_MIGRATION_HISTORY_UPDATED=YES
Git migrations == Fresh PG17 replay == Production grants/security
MANUAL_POST_MIGRATION_SQL_REMAINING=NO
```

## G8 — NO UI ACTIVATION
```
WORKSPACE_BUTTONS_PRODUCTION_ENABLED=NO
PUBLISH=NO
DEPLOY=NO
```

## VERDICT
```
TAMKEEN_20C_SECURITY_RECONCILIATION_PRODUCTION_APPLY = PASS_READY_FOR_20C_B_YOUSUF_E2E
```
