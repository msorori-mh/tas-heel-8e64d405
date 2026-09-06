# Teacher Academy — Stage 20E: Non-Production UX / Accessibility / Role-Denial Acceptance

**Mode:** design + static prototype acceptance only  
**Parent:** Stage 20D  
**Production writes:** forbidden  
**Migration apply:** forbidden  
**Deploy:** forbidden  
**Runtime/schema changes:** forbidden  
**Supabase/API/payment/QB calls:** forbidden

## 1. Gate decision on latest student baseline

Latest `main` reviewed for this stage: `f8698a57474f1e6b24dd5189e72ce86e0f4d8a75` (merged PR #174).

| Gate | State | Stage 20E decision |
|---|---|---|
| Question-bank stability / runtime cutover | **HOLD** | PR #58 is still open + draft and explicitly keeps runtime default `LEGACY`. No Academy QB runtime integration is permitted. |
| Import contract | **PASS_OPERATIONAL_STRONG / HOLD_FORMAL** | PR #174 proves current Golden Lesson CF10/CF11, PostgreSQL 17 and publication paths are healthy, including multiple lab experiments. PR #96 remains open + draft with an explicit HOLD, so formal contract adoption is not treated as closed. |
| Student curriculum/content structure | **PASS_STRONG_BASELINE** | Current main has persistent staging PG17 and student-viewer evidence. This is sufficient for Academy UX design, not for opening the full Academy backend gate. |
| Teacher/student product isolation | **PASS_BASELINE** | Academy identity may share `auth.users` only; UI, roles, commerce, certificates and permissions remain separate from Student Tamkeen. |
| Academy scoped RBAC | **PARTIAL / TARGET_FROZEN** | Organization/program/cohort scoping remains an acceptance contract; current runtime is not considered the final target model. |
| Academy subscriptions/contracts/entitlements | **TARGET_NOT_CLOSED** | Canonical Academy commerce/entitlement lifecycle is still a design target; do not derive Academy access from student subscriptions or wallet state. |
| Critical security blockers | **NOT_ZERO** | Current main still contains `admin_curriculum_force_delete` executable by `authenticated` with an internal full-admin check and the ability to purge curriculum-linked learning/publication data while temporarily disabling immutable triggers. This remains a pre-production blocker. |

**Decision:** the full Teacher Academy programming gate remains **CLOSED**. Stage 20E may proceed because it is limited to UX/accessibility/role-contract acceptance on the static mock prototype.

## 2. Stage objective

Close the acceptance definition for the Stage 20D clickable prototype before any future runtime expansion.

The acceptance package verifies:

- Arabic RTL semantics and reading order;
- responsive behavior at mobile, tablet and desktop widths;
- keyboard-only navigation and visible focus;
- status/denial messaging that is perceivable without color alone;
- role-denial behavior for every Academy persona;
- privacy-minimal certificate verification;
- teacher/student/QB product-boundary isolation;
- absence of network, Supabase, payment and production integrations.

## 3. Viewport acceptance

Required static/manual widths:

- 360 px
- 390 px
- 412 px
- 768 px
- 1280 px

For every width:

1. No horizontal page overflow caused by the shell, controls or cards.
2. The audit table may scroll inside its labeled region only.
3. Role and entitlement selectors remain reachable and legible.
4. Primary actions retain a minimum 44 px target height.
5. Navigation remains usable without obscuring the main heading.
6. Denial states remain fully visible without clipping.

## 4. Keyboard and focus acceptance

Required path:

1. Load the prototype and reach the role selector using `Tab`.
2. Change role using the keyboard.
3. Reach each navigation control using `Tab` / `Shift+Tab`.
4. Activate allowed and denied sections using `Enter` or `Space`.
5. On view transition, focus moves to the main content target without trapping the user.
6. The denial screen exposes a clear return action.
7. Every interactive element has a visible `:focus-visible` indicator.
8. Disabled actions are not activatable and their reason is available in adjacent status text.

No custom keyboard shortcut is required.

## 5. RTL and semantic acceptance

The document must retain:

- `<html lang="ar" dir="rtl">`;
- one primary page heading;
- a labeled navigation landmark;
- a focusable main-content target;
- section headings associated with their views;
- explicit labels for all selects;
- a labeled scrollable audit region;
- status or alert semantics for important outcomes.

Visual placement must follow RTL without reversing numeric identifiers, dates or technical state codes where that would reduce clarity.

## 6. Status and denial semantics

Status color is supplementary only. Each state must contain explicit text.

Required entitlement states:

- `ACTIVE`
- `PENDING`
- `SUSPENDED`
- `EXPIRED`
- `REVOKED`
- `NONE`

Required contract/seat denials:

- no seats available;
- expired contract;
- suspended contract;
- inactive membership;
- wrong organization;
- program outside contract scope.

Required role denials:

1. Teacher Learner → organization seat management: denied.
2. Organization Manager → cross-organization assignment: denied.
3. Trainer → commerce/contracts: denied.
4. Certificate Officer → learner-progress mutation: denied.
5. Support → certificate issuance/revocation: denied.
6. Any Academy role → Student Tamkeen administration: denied.
7. Any Academy role → `qb_edit`, `qb_review`, `qb_publish`: denied by product boundary.

A denial must be visible and announced; hiding a navigation item alone does not count as acceptance.

## 7. Role acceptance matrix

| Role | Allowed mock surfaces | Explicitly denied surfaces |
|---|---|---|
| Teacher Learner | catalog, own entitlement, own certificate view, boundary | organization seats, trainer operations, certificate administration, support audit, student/QB admin |
| Organization Manager | catalog, own organization contract/seats, boundary | cross-org actions, trainer operations, certificate administration, student/QB admin |
| Trainer | catalog, assigned cohort summary, boundary | contracts, seat assignment, certificate administration, student/QB admin |
| Certificate Officer | catalog, certificate eligibility/verification/revocation preview, boundary | learner progress mutation, contracts/seats, student/QB admin |
| Support | catalog, purpose-limited support/audit view, boundary | certificate issuance, contracts mutation, learner progress mutation, student/QB admin |

## 8. Certificate privacy acceptance

Public verification may expose only synthetic/mock equivalents of:

- verification result;
- program/certificate title;
- approved display name;
- issue date;
- `ISSUED` / `REVOKED` state;
- verification reference.

It must not expose:

- email or phone;
- assessment answers or scores beyond a deliberate public policy decision;
- detailed progress history;
- organization contract or seat terms;
- student subscription/wallet data;
- Student Tamkeen profile fields.

Unknown verification references must fail closed without revealing whether a teacher account exists.

## 9. Static isolation acceptance

The Stage 20D prototype and any Stage 20E UX artifact must contain **none** of the following:

- `fetch(`
- `XMLHttpRequest`
- `WebSocket`
- `EventSource`
- Supabase imports or environment variables
- payment-provider SDKs
- student routes such as `/app` or `/complete-profile`
- student wallet/subscription/certificate fields
- `qb_edit`, `qb_review`, `qb_publish`
- production identifiers, credentials or real teacher PII

All data remains hard-coded synthetic mock data.

## 10. Acceptance evidence to collect

Stage 20E can be closed later only with non-production evidence for:

- five viewport checks;
- complete keyboard path;
- visible focus on all interactive controls;
- role-denial matrix;
- entitlement and contract state matrix;
- certificate privacy matrix;
- static no-network/no-Supabase/no-student/no-QB scan.

These checks must not require production access.

## 11. Gate invariants

```text
STAGE_20E=STARTED_NONPROD_UX_A11Y_ACCEPTANCE
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
ACADEMY_NONPROD_UX_GATE=OPEN
QUESTION_BANK_RUNTIME_CUTOVER=HOLD
IMPORT_CONTRACT=PASS_OPERATIONAL_STRONG/HOLD_FORMAL
TEACHER_STUDENT_ISOLATION=PASS_BASELINE
ACADEMY_SCOPED_RBAC=ACCEPTANCE_TARGET_ONLY
ACADEMY_COMMERCE_ENTITLEMENTS=ACCEPTANCE_TARGET_ONLY
CRITICAL_SECURITY_BLOCKERS=NOT_ZERO
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
```

## 12. Next safe stage if programming gates remain closed

**Stage 20F — Program Packaging & Enrollment UX Contract**, design-only:

- training-program discovery and eligibility copy;
- individual vs organization-sponsored enrollment UX;
- prerequisite and subject-specialization rules;
- cohort/waitlist/capacity states;
- certificate eligibility messaging;
- no backend implementation, migration, production write, payment integration or QB runtime integration.
