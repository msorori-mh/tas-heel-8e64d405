# Teacher Academy — Stage 20B: Commercial, Entitlement & Certification Lifecycle Freeze

**Mode:** design / non-production only  
**Baseline main:** `82fdcf6e7e24db712dac25821defcb1efbeb47d7`  
**Production writes:** forbidden  
**Migration apply:** forbidden  
**Deploy:** forbidden  
**QB runtime integration:** disabled

## 1. Gate review at start of Stage 20B

The full Teacher Academy programming gate remains closed.

| Gate | State | Evidence / decision |
|---|---|---|
| Question-bank runtime stability | HOLD | PR #58 is still open + draft and explicitly states runtime default remains `LEGACY`; runtime cutover is not complete. |
| Import contract | HOLD_FORMAL | PR #96 is still open + draft with an explicit HOLD pending CF10/CF11, PostgreSQL regression, E2E, build and publication proof. |
| Student curriculum/content runtime | PASS_STRONG_BASELINE | Main now includes verified Offline-First runtime and track-specific ministerial import work; this improves the student baseline but does not close the QB/import formal gates. |
| Teacher/student isolation | PASS_BASELINE | Teacher OAuth, academy callback, root-provider isolation and teacher-profile save path are independently separated from student routes/providers. |
| Academy scoped RBAC | PARTIAL | The current academy baseline still has global user/capability grants; the target organization/program/cohort scope is not yet implemented. |
| Academy commerce / contracts / entitlements | NOT_IMPLEMENTED_TARGET | Current learner flow still includes `academy.self_enroll(program_version_id)` and no canonical independent product/order/contract/entitlement layer was found on current main. |
| Critical security blockers | NOT_ZERO | The curriculum force-delete capability remains callable by `authenticated` after a later migration re-grants execution; the current function can purge learning/assessment/publication records and temporarily disable immutability triggers. This must be retired or server-side constrained before any new production gate is opened. |

## 2. Mandatory boundary

The Teacher Academy is a separate product surface and authorization domain.

- `auth.users` may be shared only as an identity anchor.
- Student `app_role`, student profile fields, wallet/subscription state and student PII never grant Academy access.
- Academy capabilities never imply `qb_edit`, `qb_review` or `qb_publish`.
- QB integration remains disabled until its independent runtime/cutover gate is PASS.
- Academy commercial state is independent from Student Tamkeen wallet/subscriptions.

## 3. Canonical commercial lifecycle — frozen target

### 3.1 Individual learner

`catalog program_version -> product -> order -> payment/approval state -> entitlement -> enrollment -> learning progress -> completion -> certificate`

Rules:

1. `program_version_id` is immutable after an order/entitlement is issued.
2. `self_enroll` must never bypass a paid or contract-required entitlement.
3. Order cancellation before entitlement activation creates no enrollment.
4. Refund/reversal after activation changes entitlement state according to policy; it does not silently delete learning evidence.
5. Expired entitlement blocks new protected learning access but preserves audit, completed progress and historical certificates according to certificate policy.

### 3.2 Organization learner

`organization -> contract -> seat pool -> temporal membership -> seat assignment -> entitlement -> enrollment`

Rules:

1. Organization managers act only inside their organization scope.
2. Seat assignment is bounded by contract dates and seat quantity.
3. Cross-organization assignment is always denied.
4. Membership expiry/revocation removes future organization-derived access without deleting historical progress.
5. Contract renewal creates a new commercial period; it does not mutate historical contract evidence.

## 4. Canonical entitlement states

Design target:

- `PENDING`
- `ACTIVE`
- `SUSPENDED`
- `EXPIRED`
- `REVOKED`

Transitions must be explicit, audited and attributable. No implicit entitlement is derived from student roles or merely from the existence of an academy profile.

## 5. Certificate lifecycle — frozen target

A certificate may be issued only when all of the following are true:

1. Teacher identity is an Academy identity.
2. Enrollment references one immutable `program_version_id`.
3. Required lessons/modules are complete under the Academy completion contract.
4. Required Academy assessment threshold is satisfied.
5. The enrollment originated from a valid Academy entitlement or approved free product policy.
6. Certificate data is stored in Academy certificate records, not Student Tamkeen certificate tables.

Certificate states:

- `ISSUED`
- `REVOKED`

Certificate verification must expose the minimum public verification payload only. Revocation never deletes the issuance audit trail.

## 6. Role acceptance boundaries

### Teacher Learner

May view own catalog visibility, own entitlements, own enrollments, own progress and own certificates. Cannot administer contracts, seats, other teachers, QB, or student data.

### Trainer

May access assigned Academy cohorts/program versions according to explicit scope. Trainer status does not grant catalog administration, organization contract control or student-data access.

### Organization Manager

May administer organization membership and seats only within the active contract scope. Cannot see unrelated organizations, learner private progress beyond the explicitly approved organizational reporting contract, or student application data.

### Certificate Officer

May issue/revoke certificates only under certificate-specific capability and scope. Cannot change learning progress, contracts or QB content.

### Support

May use only support/audit views explicitly designed for the case. No broad student or Academy data visibility and no privilege inheritance from support role.

## 7. UX failure states that must exist before backend implementation

The final UX contract must include explicit screens/messages for:

- entitlement pending
- entitlement suspended
- entitlement expired
- entitlement revoked
- contract expired
- no remaining seats
- membership expired
- wrong organization
- program version no longer sold but historical enrollment retained
- certificate not yet eligible
- certificate revoked
- QB-backed activity unavailable while QB runtime integration is disabled

None of these states may fall back to student app routes or student authentication/profile completion flows.

## 8. Security release blockers

Before any production Academy expansion, all must be true:

- `QUESTION_BANK_FINAL_RUNTIME_CUTOVER=PASS` or a formally approved MVP policy proves Academy has zero QB runtime dependency.
- `IMPORT_CONTRACT_FORMAL_GATE=PASS`.
- `ACADEMY_SCOPED_RBAC_RUNTIME=PASS`.
- `ACADEMY_COMMERCE_ENTITLEMENT_RUNTIME=PASS`.
- curriculum force-delete path is retired or protected by a non-client, server-side/environment gate with no authenticated client execution.
- critical security blockers = 0.

## 9. Stage 20B decision

```text
STAGE_20B=STARTED_DESIGN_ONLY
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
TEACHER_STUDENT_ISOLATION=PASS_BASELINE
ACADEMY_COMMERCE_LIFECYCLE=FROZEN_TARGET
ACADEMY_ENTITLEMENT_LIFECYCLE=FROZEN_TARGET
ACADEMY_CERTIFICATE_LIFECYCLE=FROZEN_TARGET
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
```

## 10. Next safe stage if gates remain closed

**Stage 20C — Pricing, plan catalog, organization contract UX and certificate acceptance journeys**, using mock/design artifacts only. No runtime/schema implementation is authorized by this document.
