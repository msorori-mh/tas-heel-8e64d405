# TEACHER_ACADEMY_STAGE_19 — Commerce & Scoped RBAC Gap Closure

**Mode:** Design / non-production only  
**Base:** `main@2de5715a97aeb0af1ab6c8c5834ad05b19ae70fe`  
**Production writes:** NO  
**Migration apply:** NO  
**Deploy:** NO  
**Question-bank runtime integration:** DISABLED

## 1. Why Stage 19 starts now

The Teacher Academy MVP and its admin program-management flow are now present on `main`, but the full programming gate is not considered closed. The safe next step is therefore to freeze the remaining authorization and commercial boundaries before any further backend expansion.

This stage is intentionally documentation-only. It does not authorize applying any Academy migration that is already present in source, and it does not authorize changing production state.

## 2. Current gate snapshot

| Gate | Current decision | Evidence / rationale |
|---|---|---|
| Question bank stability | `HOLD_RUNTIME_CUTOVER` | QB-03 PR #58 is still open/draft and explicitly states that runtime defaults to `LEGACY`; production cutover is not closed. |
| Import contract | `PASS_OPERATIONAL_STRONG / FORMAL_CONTRACT_NOT_CLOSED` | Main contains the repaired Excel reader and independent seven-component publishing path, but PR #96 remains a draft/HOLD contract and is not the formal final contract. |
| Curriculum structure | `PASS_STRONG` | Current main supports exact component publishing and academy program bundles/admin authoring. |
| Teacher/student isolation | `PASS_IMPLEMENTED_BASELINE` | Academy schema, routes and auth client are separated from student root providers; shared `auth.users` is identity only. |
| Academy RBAC | `PARTIAL` | Current `academy.capability_grants` is user-global and exposes only three capabilities. The frozen target requires scope by organization/program/cohort where relevant. |
| Subscriptions / contracts / entitlements | `NOT_IMPLEMENTED_AS_TARGET_MODEL` | Current MVP allows `self_enroll` directly; no Academy `contracts`, `products`, `orders`, `entitlements`, or institutional seat ledger is present. |
| Certificates | `MVP_PRESENT / COMMERCIAL_BOUNDARY_PENDING` | Certificate flow can remain Academy-owned, but final issuance policy must depend on the frozen program version and valid enrollment/entitlement policy once Commerce is introduced. |
| Zero critical security blockers | `NOT_PROVEN` | No new critical Academy defect is identified in the latest admin closure, but the full gate cannot be asserted while QB cutover is open and authorization/commerce scope is incomplete. |

## 3. Non-negotiable separation boundary

The following remain hard constraints:

1. `auth.users` may be shared only for identity.
2. Teacher profile data belongs to `academy.*`, not student `profiles`.
3. Academy roles/capabilities must not extend or reinterpret the student `app_role`.
4. Teacher/Trainer/Organization roles must never inherit `qb_edit`, `qb_review`, `qb_publish`, student grading, or student PII permissions.
5. Academy Commerce must not reuse the student wallet/subscription entitlement model as an authorization shortcut.
6. Academy certificates remain separate from student certificates.
7. Question-bank integration remains read-only and disabled until the QB runtime cutover gate is independently closed.

## 4. Scoped RBAC target contract

The current global grant shape is acceptable only as an MVP bootstrap. The target authorization model must support explicit scope.

### 4.1 Required scope dimensions

A grant may be global only when the capability is inherently platform-wide. Otherwise it must carry one of:

- `organization_id`
- `program_id` or immutable `program_version_id`
- `cohort_id`
- optional expiry / revocation timestamps

### 4.2 Capability families

The target contract should separate at least:

- `ACADEMY_CATALOG_MANAGE`
- `ACADEMY_PROGRAM_PUBLISH`
- `ACADEMY_TEACHERS_VIEW`
- `ACADEMY_PROGRESS_VIEW`
- `ACADEMY_COHORT_MANAGE`
- `ACADEMY_ORG_MEMBERSHIP_MANAGE`
- `ACADEMY_CONTRACT_VIEW`
- `ACADEMY_CONTRACT_MANAGE`
- `ACADEMY_SEAT_ASSIGN`
- `ACADEMY_CERTIFICATE_ISSUE`
- `ACADEMY_CERTIFICATE_REVOKE`
- `ACADEMY_SUPPORT_AUDIT_VIEW`

No capability family above implies question-bank authoring rights.

### 4.3 Fail-closed rules

- Missing scope means deny unless the capability is explicitly classified platform-global.
- Expired/revoked organization membership means deny organization-scoped access.
- A trainer assigned to Cohort A cannot read progress for Cohort B.
- An organization manager cannot view teachers outside their active organization membership.
- Certificate officers cannot manage contracts unless granted that capability separately.
- Support staff cannot gain training, grading, certificate, or commercial mutation powers by role name alone.

## 5. Commerce target contract

Direct `self_enroll` is kept only as an MVP/free-program mechanism. It must not become the paid-access contract.

### 5.1 Canonical flow

`product -> order OR organization_contract -> entitlement -> enrollment -> completion -> certificate`

### 5.2 Required entities before paid launch

- `academy.products`
- `academy.orders`
- `academy.order_items`
- `academy.organizations`
- `academy.organization_memberships`
- `academy.contracts`
- `academy.contract_seats`
- `academy.entitlements`
- `academy.invoices` (or a provider-neutral invoice reference layer)

### 5.3 Individual subscription rules

- Payment/commercial confirmation creates or activates an Academy entitlement.
- Enrollment checks entitlement unless the program version is explicitly free.
- Cancellation/expiry must not delete learning history.
- Completion already earned remains auditable even if access later expires.

### 5.4 Institutional contract rules

- Contract defines seat quantity, validity window and eligible program/version scope.
- Seat assignment requires an active organization membership.
- Removing a seat stops future access according to policy but does not erase progress/audit history.
- Organization managers cannot issue unlimited seats beyond the contract balance.

## 6. Program-version and certificate invariants

1. Enrollment references an immutable `program_version_id`.
2. Entitlement identifies the exact product/program scope that permits enrollment.
3. Cohorts pin to a program version; publishing a new version does not mutate an active cohort.
4. A certificate records the completed program version and evidence timestamp.
5. Revocation creates an audit event; it does not hard-delete the certificate record.
6. A certificate must not be issued merely because an entitlement exists; completion evidence is mandatory.

## 7. UX acceptance flows to design before backend expansion

### Teacher learner
- Free program: profile -> visible catalog -> free enrollment -> learning.
- Paid program: catalog -> entitlement required -> purchase/activation state -> enrollment.
- Institutional seat: organization invitation/membership -> seat entitlement -> enrollment.
- Expired entitlement: learning history visible according to policy; protected content denied.

### Organization manager
- Contract overview.
- Seat allocation / release.
- Active memberships.
- Program usage metrics only within organization scope.
- No access to unrelated student-app data.

### Certificate officer
- Completion evidence review.
- Issue/revoke certificate.
- No contract mutation or broad teacher-directory access unless separately granted.

## 8. Security acceptance matrix for the eventual implementation

The next implementation candidate must prove, in isolated PostgreSQL/runtime tests:

1. Cross-organization access denied.
2. Cross-cohort progress access denied.
3. Revoked capability denied immediately.
4. Expired membership denied.
5. Expired entitlement denied for protected content.
6. Free program enrollment does not create fake paid entitlement.
7. Paid program cannot be enrolled through the free `self_enroll` path.
8. Contract seat over-allocation denied atomically.
9. Certificate issue denied without completion evidence.
10. Certificate revoke requires dedicated capability.
11. Academy grants never map to student `app_role` or QB capabilities.
12. No Academy RPC returns student PII from the student application domain.

## 9. Programming gate after Stage 19

The full backend expansion gate remains closed until all of the following are true:

```text
QUESTION_BANK_RUNTIME_CUTOVER=PASS_OR_EXPLICITLY_OUT_OF_SCOPE_FOR_MVP
IMPORT_CONTRACT_FINAL_STATE=FROZEN
ACADEMY_SCOPED_RBAC_CONTRACT=APPROVED
ACADEMY_COMMERCE_ENTITLEMENT_CONTRACT=APPROVED
STUDENT_DATA_ISOLATION=PASS
CRITICAL_SECURITY_BLOCKERS=0
```

If QB remains open, Academy development may continue only in areas that do not depend on QB runtime.

## 10. Safe next package

Once this document is reviewed, the next safe non-production package is:

`TEACHER_ACADEMY_STAGE_19A_SCOPED_RBAC_AND_COMMERCE_ACCEPTANCE_SPEC`

It should contain executable **test specifications / fixtures only**, not production migrations, and should define the PostgreSQL/RPC acceptance cases for organization scope, contracts, seats, entitlements and certificate issuance.

## Final decision

```text
STAGE_19=STARTED_DESIGN_ONLY
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
ACADEMY_NON_QB_NONPROD_DESIGN_GATE=OPEN
QB_RUNTIME_INTEGRATION=DISABLED
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
```
