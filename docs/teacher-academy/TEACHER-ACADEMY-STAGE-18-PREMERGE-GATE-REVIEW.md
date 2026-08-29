# TEACHER ACADEMY — Stage 18 Pre-Merge Gate Review

Date: 2026-08-29

Reviewed candidate: `a3d084134f2b5edc688aac58f55e821c68a6023d`

Reviewed student-app main: `b81b032783665502f66af8d647eee42c92fce1a1`

This stage is review/design only. It does not authorize or execute a production migration, database write, merge, deploy, or publication.

## Decision

```text
ACADEMY_PROGRAMMING_GATE=CLOSED
ACADEMY_NONPROD_MVP_REVIEW_GATE=OPEN
ACADEMY_PRODUCTION_MIGRATION=FORBIDDEN
ACADEMY_PRODUCTION_DEPLOY=FORBIDDEN
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
```

A non-production Teacher Academy MVP candidate now exists and its own CI/PG17 contract is strong, but the parent student application still has unresolved release/security governance gates and the candidate does not yet implement the frozen subscription/contract boundary.

## Gate matrix

| Gate | State | Evidence / reason |
|---|---|---|
| Question-bank stability | `HOLD_FINAL_RUNTIME_CUTOVER` | QB-03 remains an open draft and explicitly keeps runtime default at `LEGACY`; final independent runtime/cutover closure is not proven. |
| Import contract | `PASS_DESIGN_STRONG / HOLD_RUNTIME_GOVERNANCE` | The import/content path has strong recent fail-closed fixes, but production/repository migration drift is still material and recent CF10/CF11 corrections prove the runtime chain was not previously reproduced faithfully in CI. |
| Curriculum structure | `PASS_FUNCTIONAL / BLOCKED_SECURITY_REGRESSION` | Grade/curriculum/import work is strong, but current `main` reintroduced the forbidden prelaunch force-delete path in `CurriculumDeleteDialog.tsx`. |
| Teacher/student UI separation | `PASS_CANDIDATE` | Separate Vite application under `apps/teacher-academy`, separate `academy` schema, shared `auth.users` identity only, and no mutation of student `app_role`/profiles in the academy foundation migration. |
| Academy role model | `PARTIAL` | Candidate uses separate academy capability grants, but grants are global (`user_id + capability`) rather than the previously frozen organization/program/cohort-scoped model. |
| Subscriptions/contracts/entitlements | `NOT_IMPLEMENTED_IN_CANDIDATE` | Current candidate exposes direct `self_enroll`; no organization/contracts/products/orders/entitlements layer is present in this MVP commit. |
| Certificates | `PASS_CANDIDATE` | Certificates and assessments live inside the academy schema and are independent from student certificates/question-bank authorization. |
| Critical security blockers | `PRESENT` | Current student-app main fails the purge security contract because the legacy force-delete RPC/UI path is referenced again. Migration-delivery drift is also an unresolved production release blocker. |

## Positive findings in the MVP candidate

1. `academy` is a dedicated schema; direct table access is revoked from `public`, `anon`, and `authenticated` and the intended contract is RPC-driven.
2. Teacher profiles are separate from student profiles and reference `auth.users` only for identity.
3. The migration does not extend `public.app_role` or mutate student role/profile authorization.
4. Program versions are immutable after publication and enrollment pins a specific program version.
5. Academy learning content/progress and assessments/certificates are academy-owned, not student-owned.
6. Learner assessment delivery omits `correct_option`; grading remains server-side. Admin access to answer keys is capability-gated.
7. The academy branch has a dedicated PostgreSQL 17 contract job and separate typecheck/test/build commands.
8. No student question-bank runtime dependency is required by the MVP; that is the correct fail-closed posture while QB cutover remains unresolved.

## Release blockers / design deltas

### B1 — Student-app security regression

`main` currently references `admin_curriculum_force_delete` and presents a force-delete action capable of including student activity. This contradicts the hardened prelaunch-purge contract. Until this is removed or replaced by the approved gated purge path and the security test is green, no academy merge/rebase should be treated as release-ready.

### B2 — Migration delivery drift

The repository documented that 55 of 195 migration files were unapplied at the last measured baseline and that production also contained direct function edits not represented by migration source. Subsequent targeted fixes reduce individual gaps but do not prove the backlog is empty or that source equals production. No bulk replay is authorized.

Required before academy production apply:

- fresh read-only migration ledger comparison;
- explicit list of academy prerequisites already present in production;
- zero unknown drift on objects used by the academy migrations;
- staged rehearsal against a production-faithful schema.

### B3 — Subscription/entitlement boundary not implemented

The candidate currently allows server-authorized self-enrollment into visible published programs. This is valid only for a formally approved free-access MVP.

Before supporting paid or institutional access, the design freeze requires an academy-owned commerce boundary such as:

```text
academy.products
academy.orders
academy.contracts
academy.organization_memberships
academy.entitlements
academy.invoices
```

Student wallet/subscription tables must not be reused.

### B4 — Capability grants are not scoped

The candidate capability model is separate from student roles, which is good, but it is currently global. Before organization/trainer/contract administration is enabled, grants must either:

- become explicitly scoped to organization/program/cohort where applicable; or
- be formally limited to a small platform-admin MVP with a documented later migration path.

No academy role may imply access to student PII or student question-bank editing/review/publishing.

### B5 — QB integration remains disabled

Do not add foreign keys, RPC calls, editing permissions, or runtime dependencies from the academy into the student question bank until QB final independent runtime/cutover closure is proven. Academy-local assessment is the approved temporary boundary.

## Stage 18 work started

Stage 18 is now the authoritative non-production review gate for the existing MVP candidate. The candidate should be treated as a prototype/release candidate branch, not as an approved production foundation.

The next safe work package is:

```text
TEACHER_ACADEMY_STAGE_18A_NONPROD_MVP_BOUNDARY_AND_SECURITY_ACCEPTANCE
```

It may include only:

- static/API-boundary review;
- isolated PostgreSQL 17 rehearsal;
- accessibility/responsive browser acceptance;
- threat-model assertions;
- capability/PII isolation tests;
- free-MVP vs entitlement-required decision documentation;
- rebase-readiness analysis against a fixed/green `main`.

It must not include production SQL execution, migration application, production data creation, deployment, or question-bank runtime integration.

## Gate to open implementation/release continuation

All of the following are required before moving from non-production MVP review to merge/release preparation:

```text
QB_FINAL_INDEPENDENT_RUNTIME_CLOSURE=PASS
MAIN_PURGE_SECURITY_CONTRACT=PASS
IMPORT_RUNTIME_GOVERNANCE=PASS
PRODUCTION_MIGRATION_DRIFT=RECONCILED_READONLY
ACADEMY_ROLE_SCOPE_DECISION=FROZEN
ACADEMY_ACCESS_MODEL=FREE_MVP_APPROVED_OR_ENTITLEMENTS_IMPLEMENTED
ACADEMY_STUDENT_DATA_ISOLATION=PASS
ACADEMY_PG17=PASS
ACADEMY_UI_A11Y_RUNTIME=PASS
CRITICAL_SECURITY_BLOCKERS=0
```

Until then, the Teacher Academy implementation stays isolated and non-production.