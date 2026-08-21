# TEACHER-ACADEMY-MVP-UX-RELEASE-CONTRACT-11

Status: `PASS_DESIGN_CONTINUATION_ONLY`

This stage is documentation/design only. It does not authorize Academy schema changes, migrations, production writes, deploys, or Question Bank runtime integration.

## 1. Current programming gate

`TEACHER_ACADEMY_PROGRAMMING_GATE = CLOSED_PENDING_QB_FINAL_INDEPENDENT_REVIEW`

The import contract is closed as a contract and the student-content pipeline is sufficiently stable to continue pre-code design. Question Bank import/security implementation is substantially hardened, but no repository evidence is treated here as a final independent closure of the QB runtime/cutover gate. Until that proof exists, Academy code must not depend on QB runtime.

## 2. Product boundary

The Teacher Academy is a separate product surface from the student application.

- Shared `auth.users` may be used only as identity.
- Teacher profile, academy roles, organization membership, entitlements, learning progress, assessments, certificates, and commerce remain Academy-owned.
- Student `profiles` / `app_role` are not expanded to model Academy authorization.
- No global admin bypass is accepted for Academy-sensitive operations.
- Teacher users receive no direct edit/review/publish capability over student curriculum or the student Question Bank.

## 3. MVP navigation and UX

The MVP navigation is frozen to these primary areas:

1. Home / My Learning
2. Program Catalog
3. Program Details
4. My Enrollments
5. Course / Module / Lesson Reader
6. Progress and Required Activities
7. Certificates
8. Organization Workspace (visible only when an active organization membership grants access)
9. Account / Academy Profile

Administrative Academy workspaces are separate from learner navigation and use scoped capability grants.

## 4. Core learner journeys

### Individual teacher

`sign in -> academy profile -> catalog -> program version -> entitlement -> enrollment -> lessons -> progress -> completion evidence -> certificate`

### Organization-sponsored teacher

`sign in -> active organization membership -> contract seat entitlement -> assigned program version -> enrollment -> lessons -> progress -> completion evidence -> certificate`

A program enrollment is always pinned to an immutable `academy_program_version`. Catalog changes must not silently alter an active enrollment or a previously issued certificate.

## 5. Commerce and entitlement boundary

Academy commerce is independent of the student app wallet/subscription model.

Supported MVP entitlement sources:

- individual purchase/order;
- organization contract seat;
- explicit administrative grant with audit trail.

An entitlement must resolve before enrollment begins. Revocation rules must preserve historical learning/progress/certificate evidence and must not cascade-delete completed learning records.

## 6. Certificates

A certificate is Academy-owned evidence and must be pinned to:

- learner identity;
- program version;
- completion evidence;
- issue timestamp;
- issuing organization/context when applicable.

Certificates are not aliases of student certificates and are never generated merely from a valid commercial entitlement.

## 7. Student curriculum integration

Until a later approved integration stage, Academy lessons use Academy-owned course content.

Future use of student curricular content must be read-only through an immutable/published version reference. Source replacement or retirement must mark the Academy reference unavailable/deprecated with audit evidence rather than cascade-deleting Academy progress.

## 8. Question Bank integration

`ACADEMY_QB_RUNTIME_INTEGRATION = DISABLED`

After final independent QB closure, the only initially allowed integration is server-side read of an explicitly published Question Bank revision for an Academy assessment snapshot. The Academy must never grant `qb_edit`, `qb_review`, or `qb_publish` to teacher/trainer roles by implication.

## 9. Offline MVP

Offline scope remains limited to:

- application shell;
- catalog metadata already viewed;
- text lesson content explicitly cached;
- progress outbox with conflict-safe replay.

Protected video downloads, offline high-stakes assessment submission, and offline evidence upload are outside MVP.

## 10. Pre-code acceptance gates

The next stage may become implementation-ready only when all of the following are documented as PASS:

- final independent Question Bank review/cutover evidence, or a formally frozen MVP decision that QB integration remains disabled;
- Academy capability model frozen;
- Academy data ownership/lifecycle boundary frozen;
- organization/contract/entitlement model frozen;
- student-data isolation threat model PASS;
- zero unresolved critical security findings affecting Academy boundaries.

## 11. Next safe stage

While the programming gate remains closed, continue with `TEACHER_ACADEMY_MVP_SCREEN_AND_ROLE_ACCEPTANCE_MATRIX_12`: screen-by-screen role visibility, learner/admin/organization UX acceptance criteria, entitlement failure states, certificate verification UX, and release checklist. This remains design-only and must not introduce schema, migration, production writes, or deploys.
