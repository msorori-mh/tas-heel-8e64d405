# Stage 20G — Readiness Matrix and Non-Production Plan

Status: **DESIGN / NON-PRODUCTION ONLY**  
Baseline: `main@4d1454974eb4825563c40d58a7b978d08f9d0898`

## 1. Decision

The full programming gate for Teacher Academy remains **CLOSED**.

This stage is therefore limited to vision, scope, training programs, role contracts,
subscription/entitlement contracts, UX acceptance, certificate rules, and the
implementation plan. It must not apply database migrations, write production data,
change production authorization/runtime behaviour, enable Question Bank cutover,
or deploy.

## 2. Gate matrix

| Gate | Current decision | Evidence / reason |
|---|---|---|
| Question Bank stability | **HOLD** | QB-03 PR #58 remains draft; runtime default remains `LEGACY`; no final runtime cutover. |
| Import contract | **PASS_OPERATIONAL_STRONG / HOLD_FORMAL** | V2 path has substantial operational evidence on `main`, but PR #96 remains draft/HOLD and is not the formally accepted contract. |
| Curriculum / program structure | **PASS_STRONG** | Academy catalog is aligned to the eight canonical Grade-12 subject groups; the program-content contract covers all eight subject programs. |
| Teacher/student separation | **PASS_BASELINE** | Academy owns its profile, schema and interface; shared authentication identity does not grant student roles or Academy capabilities. |
| Academy RBAC | **PARTIAL** | Active Academy capability grants are still global on `(user_id, capability)` rather than scoped by organisation/program/cohort. |
| Academy subscriptions / entitlements | **NOT_READY** | Current runtime still exposes `academy.self_enroll(program_version_id)` and there is no independent Academy entitlement/contract layer. |
| Critical-security release gate | **HOLD** | The prelaunch `admin_curriculum_force_delete` capability remains present. It is full-admin checked, but is intentionally destructive and can remove learning/assessment/publication data while temporarily disabling immutable triggers inside its transaction. It must be retired or explicitly constrained before the release gate is declared closed. |

## 3. Frozen separation invariants

1. `auth.users` may be the shared identity source only.
2. Teacher profile data remains in `academy.teacher_profiles`; it is not inferred from the student profile.
3. Student `app_role`, subscription, wallet, progress, certificates and content roles never grant Academy privileges.
4. Academy capabilities never grant Question Bank capabilities (`qb_edit`, `qb_review`, `qb_publish`).
5. Student and teacher interfaces remain separate journeys even when shipped in one Android container.
6. `/auth` is the student entry; `/academy` is the teacher entry. A dual-persona account must choose a persona explicitly.
7. Academy commerce, entitlements, enrollments and certificates are independent from student commerce and student certificates.
8. No Academy screen may read student PII merely because the user shares the same `auth.users` identity.

## 4. Program portfolio freeze

The canonical subject portfolio is:

- Quran (`QURAN`)
- Islamic Education (`ISLAMIC`)
- Arabic (`ARABIC`)
- English (`ENGLISH`)
- Mathematics (`MATHEMATICS`)
- Physics (`PHYSICS`)
- Chemistry (`CHEMISTRY`)
- Biology (`BIOLOGY`)

Current program-content acceptance baseline:

- each subject-specific foundational program: 6 lessons;
- estimated duration: 210 minutes;
- assessment: 12–15 questions;
- pass threshold: 75%;
- live-session planning window: 60–90 minutes;
- live session is not required for the certificate unless a future approved version explicitly changes the rule;
- no invented speaker/date/meeting URL is allowed.

Stage 20G does not publish or mutate any program. It only treats the existing portfolio as the curriculum-design baseline for subsequent acceptance work.

## 5. Target Academy roles — design contract

The target role model is separate from student roles and is scope-aware.

| Persona | Intended scope | Allowed domain |
|---|---|---|
| Teacher learner | self | own profile, entitled programs, own progress, own certificates |
| Trainer / facilitator | assigned program/cohort | delivery support and assigned learning interactions only |
| Organisation manager | one organisation | seats, members, contract visibility and organisation reports |
| Academy catalog manager | assigned catalog/program scope | program drafting and catalog administration |
| Certificate officer | assigned program/organisation | issue/revoke/verify certificate workflow only |
| Support / auditor | explicit read-only scope | diagnostics/audit views without content publishing or student privileges |

No target role is implemented by this document. The eventual runtime must scope grants by
organisation/program/cohort (as applicable) and fail closed when scope is absent.

## 6. Subscription / entitlement contract freeze

Target flow:

`plan/product -> order or organisation contract -> entitlement -> enrollment -> completion -> certificate`

Minimum entitlement states:

`PENDING`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, `REVOKED`.

Minimum contract/seat rules:

- individual and institutional acquisition are distinct flows;
- an institutional contract owns a finite seat allocation;
- a user cannot consume a seat from another organisation;
- expired/suspended contracts cannot create new active entitlements;
- revoked/expired entitlements cannot be bypassed by direct enrollment;
- `self_enroll` must not remain a commerce bypass in the final target architecture;
- no price value is invented in design artifacts; pricing stays an explicit business decision.

## 7. Certificate contract freeze

A certificate must be bound to the exact immutable `program_version_id` completed by the teacher.

Issue prerequisites:

1. valid Academy teacher identity/profile;
2. valid entitlement for the completed learning period;
3. program completion;
4. assessment threshold satisfied where the program has a graded assessment;
5. no blocking integrity/revocation state.

Public verification reveals the minimum necessary fields only. Revocation is auditable and does not delete issuance history.

## 8. Stage 20G non-production work now open

The following work is approved while the full programming gate is closed:

- portfolio QA matrix for the eight subject programs;
- role-to-screen and role-to-action UX matrix;
- individual/institutional subscription journey wire contracts;
- entitlement denial states and error-copy catalogue;
- certificate issue/revoke/verify UX acceptance criteria;
- dual-persona teacher/student boundary scenarios;
- implementation sequencing and migration-free acceptance fixtures/specifications.

## 9. Explicitly forbidden in Stage 20G

- production database writes;
- applying or adding production migrations for the target RBAC/commerce model;
- production deployment;
- payment integration;
- Question Bank runtime cutover/integration;
- granting Academy roles from student roles;
- changing production RLS/RPC privileges;
- using real student/teacher PII in fixtures.

## 10. Exit gates before backend expansion

Backend expansion beyond isolated non-production prototypes requires all of the following:

1. Question Bank runtime cutover formally accepted and regression proven.
2. Import V2 contract formally accepted (not only operationally strong).
3. Scoped Academy RBAC contract implemented and independently verified.
4. Academy commerce/contracts/entitlements implemented and independently verified.
5. Destructive prelaunch curriculum capability retired or constrained under an approved release policy.
6. Teacher/student boundary tests pass for student-only, teacher-only and dual-persona accounts.
7. No open critical security finding affecting Academy identity, authorization, enrollment, certificates or cross-persona data isolation.

Until those gates close, Stage 20G remains documentation/design/non-production acceptance work only.
