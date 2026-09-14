# TEACHER ACADEMY — Stage 20A Non-Production Acceptance Freeze

Date: 2026-09-02
Base main: `4d491cd12ad3afb0647c701ba0c81d6cec3a1e6d`
Status: `PASS_DESIGN_CONTINUATION_ONLY`

## Purpose

Freeze the next safe acceptance contract for Teacher Academy while the full programming gate remains closed. This stage is design/documentation only. It performs no database write, migration apply, production deployment, QB cutover, or student-data mutation.

## Reconciled gate snapshot

| Gate | Current evidence | Stage 20A decision |
|---|---|---|
| Question bank | PR #58 remains open/draft and explicitly keeps runtime default `LEGACY`. | `HOLD_FINAL_RUNTIME_CUTOVER` |
| Import contract | PR #96 remains open/draft and explicitly `HOLD`; CF10/CF11 and full PostgreSQL/E2E closure are still required. | `HOLD_FORMAL_CONTRACT` |
| Curriculum security | Current main still contains the full-admin prelaunch force-delete path, including authenticated execute grant and a transaction that can remove progress/attempt/question/publication history and temporarily disable immutable-publication triggers. | `HOLD_PRELAUNCH_FORCE_DELETE` |
| Teacher/student isolation | Teacher OAuth callback separation is merged. Teacher profile save now uses insert/update without widening ownership permissions. | `PASS_BASELINE_ISOLATION` |
| Scoped Academy RBAC | Target organization/program/cohort scoping is not the active authorization model yet. | `PARTIAL_TARGET_NOT_IMPLEMENTED` |
| Commerce/entitlements | Current learner API still exposes `academy.self_enroll(program_version_id)`; canonical Academy products/orders/contracts/entitlements remain absent from current main. | `TARGET_NOT_IMPLEMENTED` |
| Certificates | Academy certificates remain separate from student certificates. Final eligibility must be pinned to program version, completion evidence and future Academy entitlement policy. | `PASS_BASELINE_WITH_PENDING_ENTITLEMENT_BINDING` |
| Critical blockers | QB/import final gates and destructive prelaunch delete governance are not closed. | `NOT_ZERO` |

## Non-production acceptance matrix

### 1. Identity and isolation

Required PASS cases:

- `/academy` teacher flow never creates or updates `public.profiles` as part of Academy onboarding.
- Teacher Google callback remains inside Academy routes and never falls through to `/app` or student profile completion.
- `auth.users` is shared identity only; Academy authorization is derived from Academy data.
- No Academy role inherits student `app_role`, wallet, student subscription or student PII access.
- Teacher profile ownership fields (`user_id`, approval/status authority) cannot be widened by client updates.

Required DENY cases:

- Academy learner attempts to read or mutate another user's student profile.
- Academy trainer attempts any student-wallet or student-subscription mutation.
- Academy user attempts `qb_edit`, `qb_review`, or `qb_publish`.

### 2. Target scoped RBAC contract

Freeze the target authorization tuple:

`(user_id, capability, organization_id?, program_id?, cohort_id?, valid_from, valid_until, revoked_at)`

Mandatory acceptance cases:

- Trainer can act only on assigned program/cohort.
- Organization manager can act only on own organization and valid membership period.
- Certificate officer cannot edit learning content, contracts, memberships or QB.
- Support access is temporary, explicitly granted, auditable and non-transitive.
- Expired, future-dated or revoked grants fail closed.
- Cross-organization and cross-cohort access fail closed even when the same user owns another valid grant.
- No global Academy-sensitive action is authorized merely because a user is a student-app admin.

### 3. Commerce, contracts and entitlements

Target access chain:

`product -> order OR organization_contract -> entitlement -> enrollment -> completion -> certificate`

Mandatory acceptance cases:

- Free program enrollment is allowed only when the product/version is explicitly free.
- Paid program enrollment without active entitlement is denied.
- Organization seat consumption requires active organization membership plus available contract seat.
- Seat exhaustion fails closed without creating enrollment.
- Expired/revoked entitlement blocks new protected access but preserves historical progress/evidence.
- Refund/cancellation policy changes entitlement state, not historical completion evidence.
- `self_enroll(program_version_id)` cannot become the authorization boundary for paid access.
- Academy commerce never writes student wallet/subscription tables.

### 4. Certificate contract

Each Academy certificate must be pinned to:

- `program_version_id`;
- enrollment identity;
- completion evidence;
- assessment/pass evidence when required;
- entitlement/contract eligibility at completion time;
- issuer/audit identity;
- immutable public verification identifier.

Mandatory DENY cases:

- incomplete enrollment;
- failed mandatory assessment;
- cross-user certificate issuance;
- certificate issuance from revoked/invalid enrollment evidence;
- certificate officer attempting to mutate program content or contract state.

Revocation must preserve historical learning evidence and public verification must show revoked status without exposing private data.

### 5. UX denied-state acceptance

The non-production prototype must visibly and accessibly represent:

- paid program without entitlement;
- expired entitlement;
- organization contract expired;
- no seats available;
- trainer outside assigned cohort;
- organization manager outside own organization;
- certificate not yet eligible;
- certificate revoked;
- Academy callback failure that remains inside Academy recovery flow;
- QB features unavailable by policy.

All denied states require keyboard/focus behavior, Arabic RTL copy and no redirect into student application flows.

## Security blocker that still requires explicit pre-production policy

Current source contains `public.admin_curriculum_force_delete(text, uuid, text)` with an authenticated execute grant and an internal full-admin check. The function can delete student learning and assessment history and temporarily disable immutable-publication triggers inside its transaction. Stage 20A does not modify this path.

Before any new production gate can be declared open, an approved implementation must either:

1. retire/revoke/drop the prelaunch force-delete capability after cleanup; or
2. bind it to an explicit server-controlled prelaunch/environment switch inaccessible to normal application users/admins, with the UI hidden/disabled when closed.

## Programming gate

Full Academy backend expansion remains prohibited until all are simultaneously proven:

```text
QUESTION_BANK_FINAL_RUNTIME_CUTOVER=PASS
OR APPROVED_ACADEMY_MVP_QB_ISOLATION_POLICY=PASS

IMPORT_CONTRACT_FORMAL_GATE=PASS
CURRICULUM_SECURITY_GATE=PASS
ACADEMY_SCOPED_RBAC_CONTRACT=APPROVED
ACADEMY_COMMERCE_ENTITLEMENT_CONTRACT=APPROVED
TEACHER_STUDENT_ISOLATION=PASS
CRITICAL_SECURITY_BLOCKERS=0
```

## Current decision

```text
STAGE_20A=STARTED_NONPROD_ACCEPTANCE_FREEZE
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
ACADEMY_NONPROD_DESIGN_GATE=OPEN
QUESTION_BANK_RUNTIME_CUTOVER=HOLD
IMPORT_CONTRACT_FORMAL_GATE=HOLD
TEACHER_STUDENT_ISOLATION=PASS_BASELINE
ACADEMY_SCOPED_RBAC=SPEC_FROZEN_NOT_IMPLEMENTED
ACADEMY_COMMERCE_ENTITLEMENTS=SPEC_FROZEN_NOT_IMPLEMENTED
ACADEMY_CERTIFICATES=PASS_BASELINE_PENDING_ENTITLEMENT_BINDING
CURRICULUM_SECURITY_GATE=HOLD_PRELAUNCH_FORCE_DELETE
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED_BY_POLICY
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
```

## Next safe step

If the full programming gate remains closed, the next allowed work is non-production-only: build mock fixtures and executable acceptance tests for the frozen RBAC/commerce/certificate rules without connecting to Supabase production and without adding or applying migrations.