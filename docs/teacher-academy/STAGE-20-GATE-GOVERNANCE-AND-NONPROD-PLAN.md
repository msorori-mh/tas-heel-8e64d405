# TEACHER ACADEMY — Stage 20 Gate Governance & Non-Production Plan

Date: 2026-09-01
Base main: `221d8b05830a693b99b947cb7293e93379f5337f`
Status: `PASS_DESIGN_CONTINUATION_ONLY`

## Purpose

This stage reconciles the current student-platform state with the previously approved Teacher Academy gating policy. It is documentation and planning only. It does not authorize or perform database writes, migrations, production deployment, question-bank cutover, or student-data changes.

## Gate snapshot

| Gate | Current evidence | Stage 20 decision |
|---|---|---|
| Question bank stability | PR #58 is still open/draft and explicitly keeps runtime default at `LEGACY`; owner cutover decisions remain open. | `HOLD_FINAL_RUNTIME_CUTOVER` |
| Import contract | PR #96 is still open/draft, marked `HOLD`, with CF10/CF11 and full PostgreSQL/E2E closure still required before merge. | `HOLD_FORMAL_CONTRACT` |
| Curriculum structure | Student content/curriculum implementation is strong, but the repository still contains a privileged prelaunch force-delete path that can remove learning/progress/question history and temporarily disable immutability triggers. | `HOLD_SECURITY_RECONCILIATION` |
| Teacher/student separation | `/academy` has independent routes/auth callbacks and Academy data lives under the `academy` schema; shared `auth.users` is identity only. | `PASS_BASELINE_ISOLATION` |
| Academy RBAC | `academy.capability_grants` exists, but the active uniqueness is global `(user_id, capability)` rather than the frozen organization/program/cohort scope model. | `PARTIAL_SCOPE_MODEL` |
| Commerce / subscriptions | Current learner flow still exposes `academy.self_enroll(program_version_id)` and no canonical Academy `products/orders/contracts/entitlements` layer exists on current main. | `NOT_IMPLEMENTED_TARGET_MODEL` |
| Certificates | Academy certificates are implemented separately from student certificates, but final eligibility must remain pinned to Academy program version/completion evidence/entitlement policy once commerce is introduced. | `PASS_BASELINE_WITH_FUTURE_ENTITLEMENT_BINDING` |
| Zero critical blockers | Not proven while QB/import gates remain open and the destructive prelaunch force-delete path remains available in source without an explicit environment retirement boundary. | `NO` |

## Important current security finding

Current main contains `supabase/migrations/20260911010000_admin_content_deletion.sql`, which recreates `public.admin_curriculum_force_delete(text, uuid, text)` as a SECURITY DEFINER function and grants execution to `authenticated` while internally requiring `is_full_admin(auth.uid())`. The function can delete student progress, attempts, exam/practice snapshots, question history, lifecycle/publication rows, lesson content, lessons and units, and temporarily disables immutable-publication triggers inside the transaction.

This may be useful for a tightly controlled prelaunch cleanup, but it is not acceptable as an unbounded long-lived production capability. Stage 20 therefore treats it as a release blocker until one of these non-ambiguous policies is adopted before production:

1. retire/drop/revoke the force-delete capability after the prelaunch cleanup window; or
2. gate it with an explicit server-side prelaunch/environment control that cannot be enabled by a normal application user/admin; and
3. remove/hide the UI action whenever that server-side gate is closed.

Stage 20 does not implement any of these changes.

## Non-production continuation scope

Until all programming gates are proven, work is limited to the following design domains only:

### A. Teacher Academy role boundary

Freeze the target scoped authorization tuple:

`(user_id, capability, organization_id?, program_id?, cohort_id?, valid_from, valid_until, revoked_at)`

Required invariants:

- no Academy role inherits `student app_role` privileges;
- no Teacher/Trainer/Org Manager gains `qb_edit`, `qb_review`, or `qb_publish`;
- no global `admin` bypass for Academy-sensitive operations;
- organization managers are constrained to their organization;
- trainers are constrained to assigned programs/cohorts;
- certificate officers can issue/revoke only under certificate policy and cannot mutate learning content or contracts;
- support access is temporary, audited, and cannot expose student PII.

### B. Commerce and subscriptions target contract

The target learner-access chain remains:

`product -> order or organization_contract -> entitlement -> enrollment -> completion -> certificate`

Rules:

- `self_enroll` must not be the paid-access authorization boundary;
- an enrollment may be created only from an active entitlement or an explicitly free product;
- organization seats come from a valid contract and active organization membership;
- entitlement revocation blocks future protected access without deleting historical learning evidence;
- student wallet/subscriptions are outside Academy authorization;
- contract/payment records are separate from student-commerce tables.

### C. Certificates target contract

Each Academy certificate must be pinned to:

- `program_version_id`;
- completion evidence;
- assessment result where required;
- entitlement/contract eligibility at completion time;
- issuer/audit identity;
- public verification token/code.

Certificate revocation must never rewrite historical progress and must not grant any question-bank privilege.

### D. UX acceptance plan

Before any new backend implementation, the non-production UX acceptance matrix must cover:

- teacher learner;
- trainer;
- organization manager;
- certificate officer;
- support;
- Academy admin.

Mandatory denied states include:

- cross-organization access;
- cross-cohort trainer access;
- expired/revoked membership;
- expired/revoked entitlement;
- paid program without entitlement;
- certificate issue without completion evidence;
- QB editing/review/publishing from any Academy learner/trainer path;
- any redirect from Academy login/callback to student profile completion or `/app`.

### E. Program plan continuation

Program design, specialty mapping, learning outcomes, lesson structures, live-session policy, assessments, and certificate criteria may continue as documentation/content work. No new program is treated as production-ready solely because the content bundle exists; specialist review remains a separate gate.

## Programming gate required to reopen implementation

`ACADEMY_FULL_PROGRAMMING_GATE=PASS` only when all of the following are proven simultaneously:

1. `QUESTION_BANK_FINAL_RUNTIME_CUTOVER=PASS` or an explicit approved MVP policy permanently isolates Academy MVP from QB runtime.
2. `IMPORT_CONTRACT_FORMAL_GATE=PASS` and the adopted contract matches the actual CF10/CF11 runtime.
3. `CURRICULUM_SECURITY_GATE=PASS`, including retirement/environment-bounding of prelaunch destructive delete paths.
4. `ACADEMY_SCOPED_RBAC_CONTRACT=APPROVED`.
5. `ACADEMY_COMMERCE_ENTITLEMENT_CONTRACT=APPROVED`.
6. `TEACHER_STUDENT_ISOLATION=PASS` with no student role/PII/wallet inheritance.
7. `CRITICAL_SECURITY_BLOCKERS=0`.

## Stage 20 exit criteria

Stage 20 is complete when:

- gate status is reconciled against current `main`;
- the destructive prelaunch deletion capability has an approved retirement/bounding policy;
- scoped RBAC acceptance cases are frozen;
- commerce/contract/entitlement acceptance cases are frozen;
- certificate eligibility and revocation rules are frozen;
- no production write, migration apply, deploy, or QB cutover is performed.

## Current release decision

```text
STAGE_20=STARTED_DESIGN_ONLY
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
QUESTION_BANK_RUNTIME_CUTOVER=HOLD
IMPORT_CONTRACT_FORMAL_GATE=HOLD
TEACHER_STUDENT_ISOLATION=PASS_BASELINE
ACADEMY_SCOPED_RBAC=PARTIAL
ACADEMY_COMMERCE_ENTITLEMENTS=TARGET_NOT_IMPLEMENTED
CURRICULUM_SECURITY_GATE=HOLD_PRELAUNCH_FORCE_DELETE
CRITICAL_SECURITY_BLOCKERS=NOT_ZERO
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED_BY_POLICY
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
```
