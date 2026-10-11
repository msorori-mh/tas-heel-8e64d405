# Stage 21E — Gate Closure Decision Register

Status: **DESIGN / NON-PRODUCTION ONLY**

This stage converts the Academy gate evidence ledger into a deterministic closure register. It does not authorize runtime work.

## Current gate verdict

| Gate | Verdict | Closure evidence required |
|---|---|---|
| Question Bank stability | CLOSED | QB-03/cutover package approved; runtime cutover evidence; zero critical reconciliation/correct-answer mismatches; rollback evidence |
| Import contract | CLOSED | V2 contract leaves Draft/HOLD; CF10/CF11 updated for V2; PostgreSQL + E2E evidence; explicit approval |
| Curriculum / roles / subscriptions | PARTIAL / CLOSED FOR FULL PROGRAMMING | Scoped RBAC and entitlement lifecycle approved; organization/program boundaries tested; legacy self-enroll contained or replaced |
| Critical security blockers | NOT FORMALLY CLOSED | Final-schema negative authorization suite; Academy admin RPC denial tests; Student/Teacher/Dual-Persona isolation evidence; security sign-off |

**ACADEMY_FULL_PROGRAMMING_GATE=CLOSED**

## Safe work allowed while gate is closed

Only vision/scope, training-program design, role/scope contracts, UX, subscription/entitlement contracts, organization-seat policy, certificate lifecycle, appeals/support policy, acceptance plans, and non-production contract/test design.

Forbidden until the relevant gate is explicitly PASS:
- production DB writes
- applying migrations
- deployment
- Question Bank cutover
- payment activation
- production entitlement migration
- Student-app changes made for Academy concerns

## Persona boundary freeze

Student and Teacher are separate personas even when one account owns both.

Never inherit across personas:
- roles/capabilities
- subscriptions/entitlements
- enrollment/progress
- assessment attempts
- certificates
- organization visibility

A Dual Persona account must select/enter an explicit workspace. Authorization is evaluated against the active persona and scope, never inferred from possession of the other persona.

## Gate closure evidence packet

Every gate closure must include:
1. exact source commit/schema baseline;
2. positive and negative tests;
3. scope-isolation tests;
4. Student/Teacher/Dual-Persona tests where applicable;
5. rollback/containment criteria;
6. unresolved-risk list with zero critical blockers;
7. explicit approval record.

Any later schema/RLS/RPC change touching the gate invalidates the prior security evidence until rerun.

## Decisions that require owner approval before runtime

1. Question Bank production batch/cutover/retention window.
2. Import V2 final publication/materialization semantics after CF10/CF11.
3. Academy entitlement expiry behavior during an active program.
4. Organization seat release/reuse after learning starts.
5. Certificate revocation authority and second-level review.
6. Appeal window (working proposal: 14 days).
7. Organization-visible teacher progress granularity.
8. Support/audit/appeal retention periods.

## Recommended sequencing after gates close

1. Security negative-test evidence on final schema.
2. Scoped RBAC contract/runtime in an isolated non-production path.
3. Entitlement + organization-seat lifecycle in non-production.
4. Teacher workspace integration against those contracts.
5. Certificate/appeal lifecycle.
6. Full acceptance matrix.
7. Separate, explicit production-readiness approval.

No step authorizes changes to the Student application merely to support Academy behavior.
